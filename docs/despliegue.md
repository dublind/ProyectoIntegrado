# Despliegue y base de datos

Estado al 16/11/2026. Cubre los PBI 103 y 104 y deja el avance de 78, 105, 106 y 107.

## Dónde corre

| Pieza | Servicio | Detalle |
| --- | --- | --- |
| Aplicación (API + frontend compilado) | Railway, proyecto `proyecto-integrado-agua`, servicio `web` | https://web-production-73dbabd8.up.railway.app · región us-east4 · Node 22 · healthcheck `/api/health` |
| Base de datos | Supabase, proyecto `proyecto-integrado-agua` (organización de `dublind`) | PostgreSQL 17 · us-east-1 · plan Free |

Railway se conecta a Supabase por el **session pooler** (`aws-1-us-east-1.pooler.supabase.com:5432`), porque Railway solo tiene IPv4 y la conexión directa de Supabase es IPv6.

## Decisión de base de datos (PBI 104)

Opciones evaluadas:

| Opción | Costo mensual | Persistencia | Observaciones |
| --- | --- | --- | --- |
| PGlite con volumen en Railway | Railway Hobby US$5 + volumen US$0,15/GB | Sí, mientras exista el volumen | Una sola instancia; respaldos manuales; no es el backend oficial |
| Railway Postgres | Incluido en el uso de Railway Hobby (US$5 con US$5 de uso) | Sí | Se probó y se eliminó al pasar a Supabase |
| **Supabase (elegida)** | **US$0 (Free)**; Pro US$25 si se necesita | Sí | Backend oficial según `AGENTS.md`; panel para revisar tablas; respaldos y PITR en planes pagados |

Decisión: **Supabase**. Es el backend oficial del proyecto, no suma costo al plan Free y separa los datos del servidor de aplicación. Costo total actual: Railway Hobby (US$5/mes con US$5 de uso incluido) + Supabase Free (US$0). Confirmar precios vigentes en railway.com/pricing y supabase.com/pricing.

Límites del plan Free de Supabase a vigilar: 500 MB de base, el proyecto se pausa tras 7 días sin actividad y no incluye respaldos descargables (ver PBI 107).

## Cómo funciona el código

- `backend/db.mjs`: con `DATABASE_URL` usa PostgreSQL (`pg`) con la misma interfaz que PGlite; sin ella, PGlite local en `.local/postgres`.
- El esquema se aplica **una sola vez**: si existe `schema_local` no se vuelve a sembrar, y un candado (`pg_advisory_lock`) evita que dos instancias lo creen a la vez. Los cambios posteriores (`database/sprint2-avisos.sql`, `database/sprint3-cuadratura.sql`) son idempotentes y se aplican en cada inicio.
- Usuarios iniciales: `ignacio` (administrador), `administrativo`, `chofer`, con la contraseña de la variable `DEMO_PASSWORD`. En la nube nunca se escribe en disco ni en los logs.
- Seguridad: Data API de Supabase desactivada al crear el proyecto y RLS activo en todas las tablas de `public` (el servidor usa el rol `postgres`, que tiene BYPASSRLS).

## Variables en Railway (servicio `web`)

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Cadena del session pooler de Supabase |
| `DEMO_PASSWORD` | Contraseña inicial de los tres usuarios (cambiarla antes de compartir la URL) |
| `TRUST_PROXY=1` | Límite de intentos de login por IP real (`X-Forwarded-For`) |

Pendiente (PBI 105): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` y credenciales de Transbank, cuando Erick las entregue; dominio propio acordado con Erick.

## Desplegar

```bash
railway up --service web
```

Railway ejecuta `npm ci`, `npm run build` (instala y compila el frontend) y `npm start`. Pendiente (PBI 106): conectar el servicio al repositorio para desplegar automáticamente desde `main` solo con CI aprobado.

## Verificado

- `/api/health` responde `{"mode":"PostgreSQL"}`; login de los tres perfiles, estado y exportaciones responden en producción contra Supabase.
- Un redeploy conserva los datos: viven en Supabase, no en el contenedor.
