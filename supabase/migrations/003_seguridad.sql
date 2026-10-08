-- =====================================================================
--  003 — Endurecimiento de permisos (RLS, Storage, alta de usuarios)
--  Ejecutar DESPUÉS de 001 y 002. Se puede volver a correr.
--
--  * handle_new_user ya no confía en user_metadata (el usuario la puede
--    modificar). El rol y la activación salen de app_metadata, que solo
--    puede escribir el service_role (api/users.js).
--  * Administración: crea recibos propios en estado 'cargado'; edita o
--    anula solo los suyos todavía cargados y solo mientras está activa.
--    No puede cambiar created_by, report_id, sent_at ni marcar 'enviado'.
--  * Nadie borra recibos desde el cliente (se anulan).
--  * anon sin acceso a tablas ni funciones.
--  * Storage: subida solo a {aaaa}/{mm}/{auth.uid()}/archivo; borrado solo
--    de fotos que no estén referenciadas por ningún recibo.
--  * ticket_stats solo devuelve datos a admin.
--  * privacy_findings(): detección (admin) de posibles datos personales
--    sin ocultar en raw_text / extraction.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Alta de usuarios: rol desde app_metadata (no editable por el usuario)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta_role text := new.raw_app_meta_data->>'role';
  v_desde_panel boolean := coalesce(new.raw_app_meta_data->>'role', '') in ('admin', 'administracion');
begin
  -- Solo los usuarios creados con service_role (panel /api/users) traen el rol en
  -- app_metadata y quedan activos. Cualquier otra alta queda como
  -- 'administracion' desactivada hasta que un admin la habilite.
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    case when v_desde_panel then v_meta_role::public.user_role else 'administracion'::public.user_role end,
    v_desde_panel
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tickets: reglas de columnas que RLS no puede expresar
-- ---------------------------------------------------------------------
create or replace function public.tickets_write_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Las funciones /api (service_role) y el SQL Editor (postgres) no pasan por esta regla.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is distinct from auth.uid() then
      raise exception 'created_by debe ser el usuario actual' using errcode = '42501';
    end if;
    if not public.is_admin()
       and (new.status <> 'cargado' or new.report_id is not null or new.sent_at is not null) then
      raise exception 'Solo se pueden crear recibos en estado cargado' using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE
  if not public.is_admin() then
    if new.id <> old.id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.report_id  is distinct from old.report_id
       or new.sent_at    is distinct from old.sent_at
       or new.status not in ('cargado', 'anulado') then
      raise exception 'No tenés permiso para modificar ese dato del recibo' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tickets_guard on public.tickets;
create trigger tickets_guard before insert or update on public.tickets
  for each row execute function public.tickets_write_guard();

-- Políticas de tickets
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated
  using (public.is_active_user());

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (public.is_active_user() and created_by = auth.uid());

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (
    public.is_admin()
    or (public.is_active_user() and created_by = auth.uid() and status = 'cargado')
  )
  with check (
    public.is_admin()
    or (public.is_active_user() and created_by = auth.uid() and status in ('cargado', 'anulado'))
  );

-- Los recibos no se borran desde el cliente: se anulan.
drop policy if exists tickets_delete on public.tickets;

-- ---------------------------------------------------------------------
-- 3. Privilegios de tablas (además de RLS)
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.tickets, public.email_reports, public.settings, public.audit_log from anon;
revoke all on all sequences in schema public from anon;

revoke truncate, references, trigger on public.profiles, public.tickets, public.email_reports, public.settings, public.audit_log from authenticated;
revoke delete on public.tickets, public.profiles, public.settings from authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke insert, update, delete on public.email_reports, public.audit_log from authenticated;

-- ---------------------------------------------------------------------
-- 4. Estadísticas: solo admin (security invoker + RLS + filtro de rol)
-- ---------------------------------------------------------------------
create or replace function public.ticket_stats(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = public as $$
  with base as (
    select t.*, coalesce(t.fecha_comprobante, (t.created_at at time zone 'America/Argentina/Cordoba')::date) as dia
    from tickets t
    where public.is_admin()
      and t.status <> 'anulado'
      and coalesce(t.fecha_comprobante, (t.created_at at time zone 'America/Argentina/Cordoba')::date) between p_from and p_to
  )
  select jsonb_build_object(
    'total',            coalesce((select sum(total) from base), 0),
    'cantidad',         (select count(*) from base),
    'promedio',         coalesce((select round(avg(total), 2) from base), 0),
    'pendientes',       (select count(*) from base where status = 'cargado'),
    'pendientes_total', coalesce((select sum(total) from base where status = 'cargado'), 0),
    'pacientes',        (select count(distinct coalesce(estudio,'') || '|' || coalesce(paciente_numero, paciente_iniciales, id::text)) from base),
    'con_viatico',      (select count(*) from base where recibe_viatico is true),
    'con_desayuno',     (select count(*) from base where desayuno is true),
    'con_comprobantes', (select count(*) from base where adjunta_comprobantes is true),
    'gastos_adjuntos',  coalesce((select sum((g->>'importe')::numeric) from base, jsonb_array_elements(base.comprobantes_adjuntos) g where g->>'importe' ~ '^-?[0-9.]+$'), 0),
    'por_dia', coalesce((select jsonb_agg(x order by x->>'dia') from (
        select jsonb_build_object('dia', dia, 'total', sum(total), 'cantidad', count(*)) x from base group by dia) s), '[]'),
    'por_estudio', coalesce((select jsonb_agg(x order by (x->>'total')::numeric desc) from (
        select jsonb_build_object('nombre', coalesce(estudio, 'Sin estudio'), 'total', sum(total), 'cantidad', count(*),
                                  'pacientes', count(distinct coalesce(paciente_numero, paciente_iniciales))) x
        from base group by coalesce(estudio, 'Sin estudio')) s), '[]'),
    'por_visita', coalesce((select jsonb_agg(x order by (x->>'cantidad')::int desc) from (
        select jsonb_build_object('nombre', coalesce(visita, 'Sin visita'), 'total', sum(total), 'cantidad', count(*)) x
        from base group by coalesce(visita, 'Sin visita') order by count(*) desc limit 12) s), '[]'),
    'por_paciente', coalesce((select jsonb_agg(x order by (x->>'total')::numeric desc) from (
        select jsonb_build_object(
          'nombre', trim(coalesce(paciente_iniciales, '') || ' ' || coalesce(paciente_numero, '')),
          'estudio', coalesce(estudio, '—'), 'total', sum(total), 'cantidad', count(*),
          'ultima_visita', (array_agg(visita order by dia desc))[1]) x
        from base
        where paciente_iniciales is not null or paciente_numero is not null
        group by estudio, paciente_iniciales, paciente_numero
        order by sum(total) desc limit 15) s), '[]'),
    'por_medio_pago', coalesce((select jsonb_agg(x order by (x->>'total')::numeric desc) from (
        select jsonb_build_object('nombre', coalesce(nullif(trim(medio_pago), ''), 'Sin dato'), 'total', sum(total), 'cantidad', count(*)) x
        from base group by coalesce(nullif(trim(medio_pago), ''), 'Sin dato')) s), '[]'),
    'por_operador', coalesce((select jsonb_agg(x order by (x->>'cantidad')::int desc) from (
        select jsonb_build_object('nombre', coalesce(p.full_name, p.email), 'total', sum(b.total), 'cantidad', count(*)) x
        from base b left join profiles p on p.id = b.created_by group by coalesce(p.full_name, p.email)) s), '[]'),
    'por_hora', coalesce((select jsonb_agg(x order by (x->>'hora')::int) from (
        select jsonb_build_object('hora', extract(hour from created_at at time zone 'America/Argentina/Cordoba')::int, 'cantidad', count(*)) x
        from base group by extract(hour from created_at at time zone 'America/Argentina/Cordoba')::int) s), '[]')
  )
$$;

-- ---------------------------------------------------------------------
-- 5. Storage (bucket privado tickets)
-- ---------------------------------------------------------------------
update storage.buckets
   set public = false,
       file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'tickets';

-- ¿La foto está referenciada por algún recibo (incluidos los anulados)?
create or replace function public.ticket_image_in_use(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tickets where image_path = p_path or p_path = any(image_paths))
$$;

drop policy if exists tickets_storage_read on storage.objects;
create policy tickets_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'tickets' and public.is_active_user());

-- Ruta de uploadTicketImage: aaaa/mm/<auth.uid()>/<uuid>.jpg
drop policy if exists tickets_storage_insert on storage.objects;
create policy tickets_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tickets'
    and public.is_active_user()
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[1] ~ '^[0-9]{4}$'
    and (storage.foldername(name))[2] ~ '^[0-9]{2}$'
    and (storage.foldername(name))[3] = auth.uid()::text
  );

drop policy if exists tickets_storage_update on storage.objects;

-- Borrado: solo fotos huérfanas (p. ej. falló el insert del recibo en ScanFlow).
-- Las fotos de un recibo guardado, enviado o anulado no se pueden borrar desde el cliente.
drop policy if exists tickets_storage_delete on storage.objects;
create policy tickets_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'tickets'
    and public.is_active_user()
    and not public.ticket_image_in_use(name)
    and (public.is_admin() or owner_id = auth.uid()::text or (storage.foldername(name))[3] = auth.uid()::text)
  );

-- ---------------------------------------------------------------------
-- 6. Detección de posibles datos personales sin ocultar (solo admin)
--    Revisa texto. NO puede verificar el tapado visual de las fotos.
-- ---------------------------------------------------------------------
create or replace function public.privacy_findings()
returns table (ticket_id uuid, campo text, tipo text, coincidencias integer)
language sql stable security invoker set search_path = public as $$
  with src as (
    select id, 'raw_text'::text as campo, raw_text as txt from public.tickets where raw_text is not null and public.is_admin()
    union all
    select id, 'extraction', extraction::text from public.tickets where extraction is not null and public.is_admin()
    union all
    select id, 'paciente_nombre/dni', concat_ws(' ', paciente_nombre, paciente_dni) from public.tickets
     where (paciente_nombre is not null or paciente_dni is not null) and public.is_admin()
  ),
  pats(tipo, re) as (values
    ('email',     '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z.]{2,}'),
    ('cbu_cvu',   '(?<![0-9])[0-9]{22}(?![0-9])'),
    ('cuit_cuil', '(?<![0-9])(?:20|23|24|27|30|33|34)[-. ]?[0-9]{8}[-. ]?[0-9](?![0-9])'),
    ('dni',       '[Dd]\.?[Nn]\.?[Ii]\.?:?\s*[0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}'),
    ('telefono',  '[Tt]el[eé]?f?o?n?o?\.?:?\s*\+?[0-9][0-9 -]{6,}'),
    ('alias',     '[Aa]lias:?\s*[A-Za-z0-9][A-Za-z0-9.-]{5,}'),
    ('nombre',    '(?:[Aa]claraci[oó]n|[Nn]ombre|[Aa]pellido|[Dd]estinatario)\s*:?\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+')
  )
  select s.id, s.campo, p.tipo, count(*)::int
  from src s
  cross join pats p
  cross join lateral regexp_matches(s.txt, p.re, 'g') m
  where s.campo <> 'paciente_nombre/dni'
    -- el CUIT del instituto no es dato personal
    and not (p.tipo = 'cuit_cuil' and regexp_replace(m[1], '[^0-9]', '', 'g') = '30710851111')
  group by 1, 2, 3
  union all
  select s.id, s.campo, 'nombre_o_dni_guardado', 1 from src s where s.campo = 'paciente_nombre/dni'
$$;

-- ---------------------------------------------------------------------
-- 7. Permisos de ejecución de funciones
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on function
  public.handle_new_user(), public.audit_ticket_changes(), public.tickets_privacy_guard(),
  public.touch_updated_at(), public.tickets_write_guard()
  from authenticated;
grant execute on function
  public.is_admin(), public.is_active_user(), public.current_role_name(),
  public.ticket_stats(date, date), public.ticket_image_in_use(text), public.privacy_findings()
  to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;
