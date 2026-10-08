-- Weekly accounting configuration requested by the institute.
update public.settings
set value = value || '{"email":"estudiocaballerosalva@gmail.com"}'::jsonb, updated_at = now()
where key = 'contadora';

update public.settings
set value = value || '{"activo":true,"frecuencia":"semanal","dia":5,"hora":"12:00","zona":"America/Argentina/Cordoba"}'::jsonb, updated_at = now()
where key = 'envio_automatico';
