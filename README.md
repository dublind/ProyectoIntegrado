# Proyecto integrado — versión local del Sprint 1

Copia de trabajo para Ignacio Salinas en `C:\Users\isali\proyecto integrado`, rama `codex/sprint1-local`. Conserva el avance del equipo: SQL de Agustín obtenido del PBI 52 de Azure y frontend/sistema visual Vue de Fabián desde el commit `32066b2`.

## Ejecutar

Requisitos: Node.js 22 o superior. En esta computadora ya se instalaron las dependencias.

```powershell
cd "C:\Users\isali\proyecto integrado"
npm start
```

Abrir `http://127.0.0.1:8787`. La primera inicialización ejecuta el SQL en una base PostgreSQL local y crea credenciales temporales en `.local/credenciales.txt`. Los arranques siguientes conservan los datos.

| Usuario de prueba | Perfil |
| --- | --- |
| `ignacio` | Administrador: revisión y baja definitiva, inventario |
| `administrativo` | Pedidos, pagos, autorización y mensaje interno de no retornados |
| `chofer` | Su ruta, entregas, retiros e incidencias |

Para editar con recarga inmediata: detener la instancia anterior y ejecutar `npm run dev`, o usar `iniciar.ps1`. En ese modo la interfaz se abre en `http://127.0.0.1:5173`. VS Code incluye la tarea **Iniciar proyecto integrado** y **Verificar Sprint 1**.

## Incluye

- Inicio de sesión por contraseña, permisos en servidor y pantallas por perfil.
- Alta, consulta y actualización de clientes y varias direcciones; validación y duplicados.
- Pedidos prellenados por último pedido, detalle/historial y autorización por no retornados.
- Modelo de pago de Agustín: medios, comprobantes, confirmación, rechazo, fecha y responsable. Simulación local Webpay explícita y transferencias revisadas; rotación a 45 comprobantes.
- Libro de inventario inmutable, cantidades reales, stock/capacidad y clasificación de rotos sin baja inmediata.
- Vehículos con capacidades y desactivación, turno con asignación opcional, carga y salida, paradas geográficas y vista móvil.
- Ausencia, entrega parcial aceptada con saldo al siguiente turno y pago original; retiro pendiente, alertas fechadas, 30/60 días y baja por administrador.
- PWA en el build y cola IndexedDB de reparto; ningún registro offline equivale por sí mismo a confirmación del servidor.

## Verificación

```powershell
npm run check
```

Ejecuta las pruebas de integración/SQL, incluida restauración de respaldo y consultas del panel, y compila Vue/TypeScript. Las pruebas usan una base separada en memoria y no modifican `.local/postgres`.

Con el servidor detenido, `npm run backup` guarda un archivo en `.local/backups` y verifica su restauración en memoria, sin sobrescribir los datos originales.

## Organización del backend

- `backend/server.mjs`: servidor HTTP, sesiones, autenticación y transacciones.
- `backend/service.mjs`: entrada de la API y selección del servicio según el recurso.
- `backend/services/`: operaciones separadas por clientes, direcciones, pedidos, pagos, vehículos, turnos, paradas, retornos e inventario. `state.mjs` reúne los datos visibles para cada perfil.
- `backend/shared/`: errores y permisos, validaciones, consultas y auditoría reutilizables.
- `backend/db.mjs`: apertura e inicialización de PostgreSQL local.

Los servicios reciben la transacción abierta por el servidor: las operaciones de una solicitud se confirman o revierten juntas. El panel consulta clientes y pedidos en conjunto, sin una consulta adicional por cada registro; el chofer carga solo los datos de su ruta.

Para mantener la indentación de dos espacios, las comillas y los saltos de línea del backend:

```powershell
npm run format:backend
npm run format:backend:check
```

## Alcance y trazabilidad

La [matriz de Sprint 1](docs/sprint1-trazabilidad.md) relaciona los **16 PBI** capturados desde Azure con código, pruebas y pendientes. [Contratos y arquitectura](docs/arquitectura-contratos.md) y [reglas del cliente](docs/reglas-cliente.md) precisan permisos, estados y excepciones.

El destino oficial del backend es **Supabase/PostgreSQL**. Como Docker está detenido y el proyecto Supabase del equipo no está accesible en esta sesión, esta copia utiliza **PGlite (PostgreSQL local)** y un adaptador Node para desarrollo. No se presenta como Supabase Auth/RLS/Edge Functions ya integrado. No modifica bases ni repositorios remotos.

Webpay y WhatsApp reales necesitan configuración oficial; la ficha Google Business y Meta Ads son trabajo comercial. El pipeline `azure-pipelines.yml` está preparado para validación/build/despliegue efímero de prueba, pero aún no se registró ni ejecutó en Azure. La disponibilidad del equipo y su aprobación de alcance no pueden acreditarse mediante código. Por eso no se marcan esas historias como terminadas.

## Fuentes conservadas

- `database/source/agustin-original.sql` y `agustin-pbi52.txt`: código y evidencia de Agustín, sin reescribir el original.
- `database/extension-sprint1.sql`: adaptación aditiva a las respuestas actuales.
- `frontend/src/views/MainAppView.vue`: prototipo original, conservado como referencia y sin ruta activa.
- `frontend/src/views/SprintAppView.vue`: aplicación conectada al servidor local.
- `docs/azure/`: criterios y tablero leídos desde Azure.
- `docs/README-base-fabian.md`: README original del equipo.

**No ejecutar el SQL original de demostración sobre datos reales:** contiene DROP y escenarios de prueba. El programa lo ejecuta únicamente al inicializar una base local nueva.
