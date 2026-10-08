# IIC Comprobantes

Sistema de carga de **recibos de reintegro de viáticos** de los pacientes de estudios clínicos del **Instituto de Investigaciones Clínicas de Córdoba**.

- **Administración** (celular): escanea el recibo y, en el mismo registro, los tickets de gastos adjuntos y el comprobante de transferencia. La IA lee estudio, visita (ej. V19), iniciales + n.º de paciente, importe, casillas SI/NO y comprobantes; la persona revisa y guarda.
- **Privacidad**: antes de guardar, se tapa la firma del paciente y sus datos personales (nombre, dirección, DNI, CUIT/CUIL, CBU/CVU/alias, teléfono, email) en todas las fotos. Solo se almacena la foto tapada.
- **Contadora**: recibe todos los viernes a las 12:00 de Argentina un reporte a **estudiocaballerosalva@gmail.com**. El corte va de viernes 12:00 a viernes 12:00, por fecha de carga (no fecha del recibo). Incluye todo lo cargado en ese intervalo, excepto anulados, y pendientes anteriores si hubo errores. Excel ordenado por estudio con resumen y todas las fotos tapadas, CSV y email con totales. Sin recibos no se envía.
- **Admin (Dr. Pautasso)**: panel con estadísticas, listado completo, edición/anulación, reenvíos, usuarios y configuración.

Stack: React + Vite + Tailwind · Supabase (Auth, Postgres con RLS, Storage) · Funciones serverless en Vercel (`/api`) · Groq (modelo de visión) · SMTP (Gmail u otro).

---

## 1. Supabase

1. Creá un proyecto nuevo en Supabase.
2. **SQL Editor** → ejecutá completos y en orden `supabase/migrations/001_schema.sql`, `002_recibo_viaticos.sql`, `003_seguridad.sql`, `004_rol_desde_app_metadata.sql` y `005_ajustes_advisors.sql`. Crean tablas, roles, políticas RLS, el bucket privado `tickets`, los campos del recibo de viáticos, las estadísticas y el endurecimiento de permisos. Se pueden volver a ejecutar sin romper nada.
3. **Authentication → Users → Add user**: creá el usuario del doctor (marcá *Auto confirm* y elegí vos la contraseña).
4. Convertilo en admin (SQL Editor). El rol se asigna en `app_metadata` (el usuario no la puede modificar) y un trigger activa el perfil:
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
   where email = 'EMAIL_DEL_DOCTOR';
   update public.profiles set full_name = 'Dr. Pautasso' where email = 'EMAIL_DEL_DOCTOR';
   select role, active from public.profiles where email = 'EMAIL_DEL_DOCTOR';  -- admin | true
   ```
5. **Authentication → Sign In / Providers**: desactivá *Allow new users to sign up* (los usuarios se crean solo desde el panel).
6. Copiá de **Project Settings → API**: URL, `anon`/publishable key y `service_role` key.

## 2. Groq

Creá una API key en console.groq.com. El modelo de visión se configura con `GROQ_VISION_MODEL` (por defecto `qwen/qwen3.8-27b`, el que Groq lista hoy para imágenes). Si Groq lo cambia, se actualiza la variable sin tocar código.

## 3. Email (SMTP)

Con Gmail / Google Workspace:
1. Activá verificación en 2 pasos en la cuenta que va a enviar.
2. Generá una **contraseña de aplicación** (myaccount.google.com → Seguridad → Contraseñas de aplicaciones).
3. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=la cuenta`, `SMTP_PASS=la contraseña de aplicación`.

Sirve cualquier otro SMTP (Brevo, Zoho, el hosting del instituto).

## 4. GitHub + Vercel

```bash
npm install
git init && git add . && git commit -m "IIC Comprobantes"
git remote add origin https://github.com/TU_USUARIO/iic-tickets.git
git push -u origin main
```

En Vercel: **Add New → Project → importá el repo**. Framework: Vite (se detecta solo).
En **Settings → Environment Variables** cargá todas las de `.env.example`:

| Variable | Dónde se usa |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | navegador |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | funciones `/api` |
| `GROQ_API_KEY`, `GROQ_VISION_MODEL` | lectura de tickets |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | email a contadora |
| `CRON_SECRET` | protege el envío automático semanal |

Redeploy. El cron de `vercel.json` (`0 15 * * 5` = viernes 12:00 Argentina) dispara el envío semanal. Desde Configuración se puede pausar, y desde Envíos el administrador puede reenviar un período si la contadora lo pide.

Último paso: entrá como admin → **Configuración**:
- email de la contadora;
- **estudios activos** (uno por línea, ej. `I8F-MC-GPLL`). La lectura usa esta lista para corregir códigos manuscritos (I/1, 8/B, 0/O, G/6);
- CUIT del instituto (ya viene cargado `30-71085111-1`): es el único CUIT que no se oculta en el texto leído.

## 5. Desarrollo local

```bash
cp .env.example .env    # completá los valores
npm install
npx vercel dev          # frontend + /api juntos en http://localhost:3000
```

`npm run dev` levanta solo el frontend; para usar las funciones apuntá `VITE_API_PROXY` a un deploy de Vercel.
`npm test` corre las pruebas de validación (CUIT, importes, fechas, parseo de la IA).

> La cámara del navegador requiere HTTPS. En el celular probá siempre sobre la URL de Vercel. Se puede "instalar" como app desde el navegador (Agregar a pantalla de inicio).

---

## Cómo funciona la carga

1. **Foto del recibo**. Cámara trasera a máxima resolución, guía de encuadre, linterna y enfoque continuo. Si la foto sale movida, oscura o con reflejo, pide repetirla.
2. **Agregar foto** (opcional, en el mismo registro): tickets de gastos adjuntos (YPF, peajes, etc.) y el comprobante de transferencia (Mercado Pago o banco).
3. **Lectura IA en dos pasadas (Groq)**, por cada foto. Primero transcribe todo el texto, impreso y manuscrito. Después extrae los datos a JSON:
   - del recibo: estudio, visita, iniciales y n.º de paciente (en *Aclaración*), fecha, "Recibí la suma de", total, casillas *Adjunta comprobantes / Recibe viático / Desayuno*;
   - de los tickets: comercio, detalle, medio de pago e importe;
   - de la transferencia: monto, fecha, hora y n.º de operación (se cruza con el total del recibo).
4. **Tapado de datos personales**. La IA ubica la firma y los datos del paciente y los tapa. La persona ve cada foto con las tapas y puede moverlas, agrandarlas, quitarlas o agregar más. Si alguna foto queda sin ningún dato tapado, se pide confirmación antes de guardar. Al guardar, el teléfono pinta las tapas sobre la imagen (no se pueden quitar), endereza la foto y recién ahí la sube. La foto original nunca se guarda.
5. **Validación**: estudio ajustado a la lista de estudios activos, visita normalizada (`v 19` → `V19`), faltantes (n.º de paciente), monto de la transferencia vs. recibo, casilla "adjunta comprobantes" sin fotos de tickets, fechas imposibles, y aviso si ya existe un reintegro del mismo paciente para esa visita.

**Qué se guarda y qué no**
- No se guarda el nombre ni el DNI del paciente. La base lo fuerza con un trigger: el paciente queda solo como iniciales + n.º.
- El texto leído se guarda con nombres, CUIT/CUIL, CBU/CVU, alias, DNI, emails y teléfonos reemplazados por `[DATO OCULTO]`. El CUIT del instituto queda visible.
- Las fotos del bucket (y los links que recibe la contadora) son las versiones tapadas.
- Para poder leer, la foto viaja una vez a Groq sin tapar. Groq no forma parte del almacenamiento del sistema.

## Roles

| | Administración | Admin |
|---|---|---|
| Escanear y guardar recibos | ✓ | ✓ |
| Ver recibos del día | ✓ | ✓ |
| Editar / anular sus recibos no enviados | ✓ | ✓ (todos) |
| Reenviar un período a la contadora | | ✓ |
| Estadísticas (por estudio, visita y paciente), usuarios, configuración | | ✓ |

Los permisos se aplican en la base de datos (RLS), no solo en la interfaz. Los recibos nunca se borran: se anulan con motivo y queda auditoría (`audit_log`).

## Estructura

```
api/                 funciones serverless (Vercel)
  scan-ticket.js     lectura de cada foto con Groq + ubicación de datos a tapar
  send-report.js     envío a la contadora (Excel + CSV)
  cron-daily.js      envío automático semanal
  users.js           alta y gestión de usuarios (admin)
  _lib/              supabase, groq, armado del reporte
shared/              validaciones usadas por front y API
src/
  pages/caja/        app móvil de administración (inicio, escáner)
  pages/admin/       panel del doctor
  components/        cámara, editor de tapado, formulario, UI
supabase/migrations  001 esquema base · 002 recibo de viáticos
tests/               pruebas de validación
```

La lectura compara el importe con una segunda lectura independiente sobre la imagen original. La persona debe revisar y confirmar el monto antes de guardar: las coincidencias de IA no garantizan exactitud. Configurar SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y MAIL_FROM para habilitar el correo.
