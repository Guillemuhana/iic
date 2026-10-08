-- =====================================================================
--  IIC Tickets — Instituto de Investigaciones Clínicas de Córdoba
--  Esquema completo: perfiles/roles, tickets, envíos, configuración,
--  RLS y Storage. Ejecutar entero en Supabase > SQL Editor.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'administracion');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status as enum ('cargado', 'enviado', 'anulado');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.user_role not null default 'administracion',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Crea el perfil automáticamente al dar de alta un usuario en Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo quedan activos los usuarios creados desde el panel (traen el rol en la metadata).
  -- Cualquier alta por otro medio queda desactivada hasta que un admin la habilite.
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'administracion'),
    new.raw_user_meta_data ? 'role'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers de rol (security definer para evitar recursión en RLS)
create or replace function public.current_role_name()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active = true)
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active = true)
$$;

-- ---------------------------------------------------------------------
-- Envíos a la contadora
-- ---------------------------------------------------------------------
create table if not exists public.email_reports (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  sent_by       uuid references public.profiles(id) on delete set null,
  trigger_kind  text not null default 'manual',   -- manual | cierre | automatico
  recipients    text[] not null default '{}',
  period_from   date,
  period_to     date,
  ticket_count  integer not null default 0,
  total_amount  numeric(14,2) not null default 0,
  status        text not null default 'enviado',  -- enviado | error
  error         text
);

-- ---------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------
create table if not exists public.tickets (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid not null default auth.uid() references public.profiles(id) on delete restrict,

  -- Comprobante
  fecha_comprobante date,
  hora_comprobante  text,
  tipo_comprobante  text,            -- Factura A/B/C, Ticket, Recibo, Nota de crédito...
  punto_venta       text,
  numero            text,
  cae               text,
  cae_vencimiento   date,

  -- Emisor
  cuit_emisor       text,
  razon_social      text,

  -- Paciente
  paciente_nombre   text,
  paciente_dni      text,
  obra_social       text,
  nro_afiliado      text,

  -- Detalle
  concepto          text,
  items             jsonb not null default '[]'::jsonb,  -- [{descripcion,cantidad,precio_unitario,importe}]
  medio_pago        text,
  moneda            text not null default 'ARS',
  subtotal          numeric(14,2),
  iva               numeric(14,2),
  total             numeric(14,2) not null check (total >= 0),

  -- Lectura IA
  raw_text          text,
  extraction        jsonb,           -- respuesta completa del modelo + advertencias
  confidence        numeric(4,3),
  model             text,
  image_path        text,

  -- Gestión
  status            public.ticket_status not null default 'cargado',
  report_id         uuid references public.email_reports(id) on delete set null,
  sent_at           timestamptz,
  notas             text,
  anulado_motivo    text
);

create index if not exists tickets_fecha_idx    on public.tickets (fecha_comprobante desc);
create index if not exists tickets_created_idx  on public.tickets (created_at desc);
create index if not exists tickets_status_idx   on public.tickets (status);
create index if not exists tickets_creator_idx  on public.tickets (created_by);

-- Evita cargar dos veces el mismo comprobante (si tiene datos fiscales).
create unique index if not exists tickets_unique_comprobante
  on public.tickets (cuit_emisor, tipo_comprobante, punto_venta, numero)
  where status <> 'anulado'
    and cuit_emisor is not null and punto_venta is not null and numero is not null;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists tickets_touch on public.tickets;
create trigger tickets_touch before update on public.tickets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Configuración (clave / valor)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

insert into public.settings (key, value) values
  ('instituto',  '{"nombre":"Instituto de Investigaciones Clínicas de Córdoba","responsable":"Dr. Pautasso"}'),
  ('contadora',  '{"nombre":"","email":"","cc":[]}'),
  ('envio_automatico', '{"activo":true,"hora":"20:00"}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Auditoría simple
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  action      text not null,
  ticket_id   uuid,
  detail      jsonb
);

create or replace function public.audit_ticket_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_log (action, ticket_id, detail) values ('ticket_creado', new.id, jsonb_build_object('total', new.total));
  elsif tg_op = 'UPDATE' then
    if new.status = 'anulado' and old.status <> 'anulado' then
      insert into audit_log (action, ticket_id, detail) values ('ticket_anulado', new.id, jsonb_build_object('motivo', new.anulado_motivo));
    elsif new.status = old.status then
      insert into audit_log (action, ticket_id, detail) values ('ticket_editado', new.id, jsonb_build_object('total_antes', old.total, 'total_despues', new.total));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tickets_audit on public.tickets;
create trigger tickets_audit after insert or update on public.tickets
  for each row execute function public.audit_ticket_changes();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.tickets       enable row level security;
alter table public.email_reports enable row level security;
alter table public.settings      enable row level security;
alter table public.audit_log     enable row level security;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_self_update on public.profiles;

-- tickets: todos los usuarios activos ven los tickets (administración ve
-- el día a día; admin ve todo para estadísticas).
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated
  using (public.is_active_user());

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (public.is_active_user() and created_by = auth.uid());

-- administración solo edita sus propios tickets todavía no enviados; admin edita todo.
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (public.is_admin() or (created_by = auth.uid() and status = 'cargado'))
  with check (public.is_admin() or (created_by = auth.uid() and status in ('cargado','anulado')));

drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated
  using (public.is_admin());

-- email_reports
drop policy if exists reports_select on public.email_reports;
create policy reports_select on public.email_reports for select to authenticated
  using (public.is_active_user());

-- settings
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to authenticated
  using (public.is_active_user());

drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit_log
drop policy if exists audit_admin_select on public.audit_log;
create policy audit_admin_select on public.audit_log for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- Storage: bucket privado para las fotos de los tickets
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists tickets_storage_read on storage.objects;
create policy tickets_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'tickets' and public.is_active_user());

drop policy if exists tickets_storage_insert on storage.objects;
create policy tickets_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tickets' and public.is_active_user());

drop policy if exists tickets_storage_delete on storage.objects;
create policy tickets_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tickets' and (public.is_admin() or owner = auth.uid()));

-- ---------------------------------------------------------------------
-- Estadísticas (RPC) — usado por el panel del Dr. Pautasso
-- ---------------------------------------------------------------------
create or replace function public.ticket_stats(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = public as $$
  with base as (
    select t.*, coalesce(t.fecha_comprobante, (t.created_at at time zone 'America/Argentina/Cordoba')::date) as dia
    from tickets t
    where t.status <> 'anulado'
      and coalesce(t.fecha_comprobante, (t.created_at at time zone 'America/Argentina/Cordoba')::date) between p_from and p_to
  )
  select jsonb_build_object(
    'total',        coalesce((select sum(total) from base), 0),
    'cantidad',     (select count(*) from base),
    'promedio',     coalesce((select round(avg(total), 2) from base), 0),
    'pendientes',   (select count(*) from base where status = 'cargado'),
    'pendientes_total', coalesce((select sum(total) from base where status = 'cargado'), 0),
    'por_dia', coalesce((select jsonb_agg(x order by x->>'dia') from (
        select jsonb_build_object('dia', dia, 'total', sum(total), 'cantidad', count(*)) x from base group by dia) s), '[]'),
    'por_obra_social', coalesce((select jsonb_agg(x order by (x->>'total')::numeric desc) from (
        select jsonb_build_object('nombre', coalesce(nullif(trim(obra_social), ''), 'Particular'), 'total', sum(total), 'cantidad', count(*)) x
        from base group by coalesce(nullif(trim(obra_social), ''), 'Particular')) s), '[]'),
    'por_medio_pago', coalesce((select jsonb_agg(x order by (x->>'total')::numeric desc) from (
        select jsonb_build_object('nombre', coalesce(nullif(trim(medio_pago), ''), 'Sin dato'), 'total', sum(total), 'cantidad', count(*)) x
        from base group by coalesce(nullif(trim(medio_pago), ''), 'Sin dato')) s), '[]'),
    'por_concepto', coalesce((select jsonb_agg(x order by (x->>'total')::numeric desc) from (
        select jsonb_build_object('nombre', coalesce(nullif(trim(concepto), ''), 'Sin concepto'), 'total', sum(total), 'cantidad', count(*)) x
        from base group by coalesce(nullif(trim(concepto), ''), 'Sin concepto') order by sum(total) desc limit 10) s), '[]'),
    'por_operador', coalesce((select jsonb_agg(x order by (x->>'cantidad')::int desc) from (
        select jsonb_build_object('nombre', coalesce(p.full_name, p.email), 'total', sum(b.total), 'cantidad', count(*)) x
        from base b left join profiles p on p.id = b.created_by group by coalesce(p.full_name, p.email)) s), '[]'),
    'por_hora', coalesce((select jsonb_agg(x order by (x->>'hora')::int) from (
        select jsonb_build_object('hora', extract(hour from created_at at time zone 'America/Argentina/Cordoba')::int, 'cantidad', count(*)) x
        from base group by extract(hour from created_at at time zone 'America/Argentina/Cordoba')::int) s), '[]')
  )
$$;

grant execute on function public.ticket_stats(date, date) to authenticated;

-- =====================================================================
--  Después de correr esto:
--  1) Creá el primer usuario en Authentication > Users (Add user).
--  2) Convertilo en admin:
--     update public.profiles set role = 'admin', active = true, full_name = 'Dr. Pautasso'
--     where email = 'EMAIL_DEL_DOCTOR';
--  El resto de los usuarios se crean desde el panel (Usuarios).
-- =====================================================================
