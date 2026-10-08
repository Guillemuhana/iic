-- =====================================================================
--  002 — Recibo de reintegro de viáticos (estudios clínicos)
--  Agrega estudio, visita, paciente (iniciales + n.º), casillas SI/NO,
--  comprobantes adjuntos, datos de la transferencia y varias fotos por
--  comprobante (todas guardadas con firma y datos personales tapados).
--  Ejecutar DESPUÉS de 001_schema.sql. Se puede volver a correr.
-- =====================================================================

alter table public.tickets
  add column if not exists estudio               text,
  add column if not exists visita                text,
  add column if not exists paciente_iniciales    text,
  add column if not exists paciente_numero       text,
  add column if not exists monto_detalle         text,
  add column if not exists adjunta_comprobantes  boolean,
  add column if not exists recibe_viatico        boolean,
  add column if not exists desayuno              boolean,
  add column if not exists comprobantes_adjuntos jsonb not null default '[]'::jsonb,
  add column if not exists pago                  jsonb,
  add column if not exists nro_operacion         text,
  add column if not exists image_paths           text[] not null default '{}',
  add column if not exists datos_ocultos         integer not null default 0;

alter table public.tickets alter column tipo_comprobante set default 'Recibo de viáticos';
alter table public.tickets alter column concepto set default 'Reintegro de viáticos';

create index if not exists tickets_estudio_idx  on public.tickets (estudio);
create index if not exists tickets_paciente_idx on public.tickets (estudio, paciente_numero);

-- Por privacidad, el sistema no guarda nombre ni DNI del paciente:
-- se identifica solo por iniciales + n.º de paciente.
create or replace function public.tickets_privacy_guard()
returns trigger language plpgsql as $$
begin
  new.paciente_nombre := null;
  new.paciente_dni := null;
  new.paciente_iniciales := nullif(upper(regexp_replace(coalesce(new.paciente_iniciales, ''), '[^A-Za-zÑñ]', '', 'g')), '');
  new.estudio := nullif(upper(regexp_replace(coalesce(new.estudio, ''), '\s', '', 'g')), '');
  new.visita := nullif(upper(trim(coalesce(new.visita, ''))), '');
  return new;
end $$;

drop trigger if exists tickets_privacy on public.tickets;
create trigger tickets_privacy before insert or update on public.tickets
  for each row execute function public.tickets_privacy_guard();

-- Configuración nueva
insert into public.settings (key, value) values ('estudios', '{"lista":["I8F-MC-GPLL"]}')
on conflict (key) do nothing;

update public.settings
   set value = value || '{"cuit":"30710851111"}'::jsonb
 where key = 'instituto' and not (value ? 'cuit');

-- Estadísticas para el panel (reemplaza la versión de 001)
create or replace function public.ticket_stats(p_from date, p_to date)
returns jsonb language sql stable security invoker set search_path = public as $$
  with base as (
    select t.*, coalesce(t.fecha_comprobante, (t.created_at at time zone 'America/Argentina/Cordoba')::date) as dia
    from tickets t
    where t.status <> 'anulado'
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

grant execute on function public.ticket_stats(date, date) to authenticated;
