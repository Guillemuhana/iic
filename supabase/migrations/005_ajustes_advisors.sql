-- =====================================================================
--  005 — Ajustes de los advisors de Supabase (sin cambiar permisos)
--  * search_path fijo en funciones de trigger.
--  * auth.uid() envuelto en (select ...) en políticas (se evalúa una vez).
--  * Índices para claves foráneas.
--  * ticket_image_in_use responde solo a usuarios activos.
--  Ejecutar DESPUÉS de 004. Se puede volver a correr.
-- =====================================================================

alter function public.tickets_privacy_guard() set search_path = public;
alter function public.touch_updated_at() set search_path = public;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (public.is_active_user() and created_by = (select auth.uid()));

drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (
    public.is_admin()
    or (public.is_active_user() and created_by = (select auth.uid()) and status = 'cargado')
  )
  with check (
    public.is_admin()
    or (public.is_active_user() and created_by = (select auth.uid()) and status in ('cargado', 'anulado'))
  );

create index if not exists email_reports_sent_by_idx on public.email_reports (sent_by);
create index if not exists tickets_report_idx on public.tickets (report_id);

create or replace function public.ticket_image_in_use(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user()
     and exists (select 1 from public.tickets where image_path = p_path or p_path = any(image_paths))
$$;
revoke execute on function public.ticket_image_in_use(text) from public, anon;
grant execute on function public.ticket_image_in_use(text) to authenticated;
