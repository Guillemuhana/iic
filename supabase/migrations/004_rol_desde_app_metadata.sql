-- =====================================================================
--  004 — Rol inicial desde app_metadata
--  Auth (GoTrue) inserta el usuario y DESPUÉS escribe app_metadata, así que
--  handle_new_user (INSERT) todavía no la ve. Este trigger toma la primera
--  asignación de rol en app_metadata (solo la puede escribir service_role)
--  y recién ahí activa el perfil. Cambios posteriores de rol se sincronizan
--  pero no reactivan un usuario desactivado. user_metadata se ignora.
--  Ejecutar DESPUÉS de 003. Se puede volver a correr.
-- =====================================================================

create or replace function public.handle_user_app_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new text := new.raw_app_meta_data->>'role';
  v_old text := old.raw_app_meta_data->>'role';
begin
  if v_new in ('admin', 'administracion') and v_new is distinct from v_old then
    update public.profiles
       set role = v_new::public.user_role,
           active = case when v_old is null then true else active end
     where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_app_role on auth.users;
create trigger on_auth_user_app_role
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data->>'role' is distinct from new.raw_app_meta_data->>'role')
  execute function public.handle_user_app_role();

revoke execute on function public.handle_user_app_role() from public, anon, authenticated;
