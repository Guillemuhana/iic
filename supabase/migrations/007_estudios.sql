-- Ejecutar después de 006. No modifica tickets ni settings históricos.
begin;
create table if not exists public.estudios (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo = btrim(codigo) and codigo <> ''),
  estado text not null check (estado in ('activo', 'pendiente_inicio', 'start_up', 'seleccionado_sin_start_up')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.estudios enable row level security;
revoke all on public.estudios from anon, authenticated;
grant select, insert, update on public.estudios to authenticated;
grant all on public.estudios to service_role;
drop policy if exists estudios_select on public.estudios;
create policy estudios_select on public.estudios for select to authenticated
  using (public.is_active_user());
drop policy if exists estudios_insert on public.estudios;
create policy estudios_insert on public.estudios for insert to authenticated
  with check (public.is_admin());
drop policy if exists estudios_update on public.estudios;
create policy estudios_update on public.estudios for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Baja lógica: no se otorga DELETE.
-- Pendientes de confirmar: J3R-MC-YDAO, C64G1002, J2O-MC-EKBG, BI 1378 0041.
insert into public.estudios (codigo, estado) values
  ('AMG20180244', 'activo'),
  ('AbbVie M19-044', 'activo'),
  ('AbbVie M23-716', 'activo'),
  ('AQUA - EFC17599', 'activo'),
  ('WARD - X4P-001-110', 'activo'),
  ('GSK221672', 'activo'),
  ('I8F-MC-GPIJ', 'activo'),
  ('J1I-MC-GZBO', 'activo'),
  ('J3L-MC-EZEF', 'activo'),
  ('LIBREXIA', 'activo'),
  ('VICTORION', 'activo'),
  ('AROAPOC3-3003', 'activo'),
  ('AROAPOC3-3009', 'activo'),
  ('AMG20230053', 'activo'),
  ('EFC18366', 'activo'),
  ('MBX 2H1004', 'activo'),
  ('GPJA', 'activo'),
  ('GZPL', 'activo'),
  ('RIVER', 'activo'),
  ('AbbVie M20-465', 'activo'),
  ('CLOU064J12302', 'activo'),
  ('BI 1378 0041', 'activo'),
  ('J2O-MC-EKBG', 'activo'),
  ('DAICHII', 'activo'),
  ('GZLF', 'activo'),
  ('IM011-1130', 'activo'),
  ('READY-AD', 'pendiente_inicio'),
  ('SHASTA-5', 'pendiente_inicio'),
  ('SHASTA-10', 'pendiente_inicio'),
  ('GCT1184-02', 'pendiente_inicio'),
  ('ANTHOS', 'pendiente_inicio'),
  ('AZD8205', 'pendiente_inicio'),
  ('ALN', 'pendiente_inicio'),
  ('GZPW', 'pendiente_inicio'),
  ('KAILERA', 'pendiente_inicio'),
  ('GZPR', 'pendiente_inicio'),
  ('MALO', 'pendiente_inicio'),
  ('RLY-2608-102', 'pendiente_inicio'),
  ('POLARIS', 'start_up'),
  ('J3R-MC-YDAO', 'start_up'),
  ('AMAZE I', 'start_up'),
  ('VESPER 4', 'start_up'),
  ('VESPER 5', 'start_up'),
  ('NN9490-8507', 'seleccionado_sin_start_up'),
  ('GSK Zenith - 1', 'seleccionado_sin_start_up'),
  ('CA266-0001', 'seleccionado_sin_start_up'),
  ('PVT-2201-304 ALPINE', 'seleccionado_sin_start_up'),
  ('ARGX-113-25-GRD-3001', 'seleccionado_sin_start_up'),
  ('GSK Zenith - 2', 'seleccionado_sin_start_up'),
  ('C64G1002', 'seleccionado_sin_start_up'),
  ('INCA', 'seleccionado_sin_start_up')
on conflict (codigo) do nothing;
commit;
