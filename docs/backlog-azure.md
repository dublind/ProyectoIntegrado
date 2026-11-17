# Estado del backlog en Azure Boards

Foto del tablero `ignaciosalinas / Proyecto Integrado` al 08/11/2026, contrastada con `main` (60e6ee5, v0.3.1). Azure Boards es la fuente de verdad; este archivo resume decisiones y hallazgos para el grafo de graphify.

## Hallazgos del código en main

- **Resuelto en el PBI 102 (16/11/2026):** las vistas principales (`/indicadores`, `/pedidos`, `/despacho`, `/inventario`, `/seguimiento`, `/chofer`) leen `GET /api/state` y cada acción llama a su endpoint (`frontend/src/store/useAppStore.ts`, traducción en `frontend/src/store/mapeo.ts`). Se retiró el puente `/api/shared-state` (la tabla `estado_compartido` se conserva con lo que tenga, sin migrar). Ver `docs/planificacion-api.md`.
- **Sin inicio de sesión en el panel.** El rol se deduce de la URL en `frontend/src/layouts/AdminLayout.vue` (función `usuario`); el backend sí tiene autenticación y permisos por perfil (PBI 55).
- **Regla de 45 comprobantes contradictoria.** El backend rota la cuenta activa al comprobante 45 (`backend/services/payments.mjs`, tabla `cuenta_bancaria` en `database/extension-sprint1.sql`), pero el commit `8656da4` (03/11/2026) la eliminó del frontend por riesgo ante el SII y dejó una cuenta única escrita en `useAppStore.ts`. Solo existen las cuentas de prueba `DEMO-001` y `DEMO-002`; no hay API ni pantalla para configurar cuentas reales. Bloquea el PBI 63.
- **Servidor no listo para la nube.** `backend/server.mjs` escucha en `127.0.0.1`, escribe `.local/server.pid` y deja la contraseña temporal en `.local/credenciales.txt`. La base es PGlite en `DATA_DIR` y se pierde en cada despliegue sin volumen.
- **Secretos de prueba en CI.** `.github/workflows/ci-cd-agua.yml` (job `deploy-to-staging`) trae valores de Webpay y WhatsApp escritos (bug 100).
- Pruebas del backend: 44 pasan (`npm test`), 3 pendientes marcadas TODO (ER-04 exportación, ER-05 bloqueo/MFA, ER-06 control de versión 409).

## Orden del tablero (tarjetas abiertas)

Etiqueta `Pregunta cliente` = depende de una respuesta de Erick.

| Orden | PBI | Título | Responsable | Pregunta cliente |
| --- | --- | --- | --- | --- |
| 1 | 78 | Preparar despliegue, respaldo y recuperación | Ignacio | Dónde publicar |
| 2 | 101 | Confirmar con Erick el despliegue en Railway | Ignacio | Sí |
| 3 | 73 | Enviar notificaciones de pago, despacho y entrega | Ignacio | Acceso a WhatsApp Business (Meta) |
| 4 | 63 | Configurar cuentas bancarias y regla de alternancia | Agustín | Cuenta única o rotación a 45, datos reales |
| 5 | 102 | Conectar la interfaz principal a la API antes de publicar | Ignacio | No |
| 6 | 103 | Adaptar el servidor para ejecutarse en Railway | Ignacio | Depende de 101 |
| 7 | 104 | Configurar base de datos persistente en Railway | Ignacio | Depende de 101 |
| 8 | 105 | Configurar secretos, dominio y HTTPS en Railway | Ignacio | Depende de 101 |
| 9 | 106 | Automatizar el despliegue desde main con pruebas previas | Ignacio | Depende de 101 |
| 10 | 107 | Probar respaldo y recuperación en Railway | Ignacio | Depende de 101 |
| 11 | 77 | Ejecutar piloto con el nuevo cliente | Ignacio | Fecha y participantes |
| 12 | 99 | ER-07: no hay RLS en la base | Ignacio | No |
| 13 | 79 | Cerrar documentación operativa y plan siguiente | Ignacio | No |

También dependen de Erick, sin cambiar su orden: 61 y 95 (código de comercio de Transbank para Webpay), 94 (credenciales de WhatsApp) y 64 (conteo inicial de botellones).

## Preguntas pendientes para Erick

1. Publicación en Railway: aceptación, titular de la cuenta y medio de pago, presupuesto, dominio propio o subdominio. Railway Hobby: US$5/mes con US$5 de uso incluido; volumen a US$0,15 por GB-mes (confirmar en railway.com/pricing).
2. Transferencias: cuenta única o rotación cada 45 comprobantes (validado con su contador por el SII); datos de las cuentas reales; quién puede modificarlas.
3. WhatsApp Business: si la cuenta oficial en Meta existe y quién la administra.
4. Webpay: si tiene contrato y código de comercio de Transbank.
5. Inventario inicial: llenos, vacíos y rotos actuales.
6. Piloto: semana disponible y participantes (administrativo y chofer).

## Tarjetas de despliegue en Railway

Creadas el 08/11/2026, Sprint 3, asignadas a Ignacio, relacionadas con el PBI 78. Solo avanzan si Erick aprueba el PBI 101, salvo el 102, que se necesita igual para el piloto.

- **101** Confirmar con Erick el despliegue en Railway (tarjeta de decisión).
- **102** Conectar la interfaz principal a la API: inicio de sesión real con los perfiles del backend y vistas principales sobre `services/api.ts`. Coordinar con Fabián.
- **103** Adaptar el servidor: `0.0.0.0:PORT`, endpoint de salud, build de `frontend/dist`, Node 22, contraseña inicial por variable de entorno.
- **104** Base persistente: PGlite con volumen en `DATA_DIR` o PostgreSQL gestionado (Railway o Supabase). Afecta al bug 99.
- **105** Secretos, dominio y HTTPS: variables en Railway, quitar valores de prueba del workflow (bug 100), registrar el webhook `/api/whatsapp/webhook` en Meta (desbloquea 73 y 94).
- **106** Despliegue automático desde `main` solo con CI aprobado; entorno de pruebas desde `develop` con base separada.
- **107** Respaldo programado y restauración probada en el entorno publicado (cierra el criterio del PBI 78).

## Revisión de tareas "To Do" de Ignacio

Revisadas y cerradas el 08/11/2026 con comentario de evidencia en Azure, salvo la 87. Tareas de apoyo cuyo backend ya está implementado y probado. La parte de interfaz queda cubierta por el PBI 102, porque ninguna vista accesible usa la API.

| Tarea | Padre | Evidencia en backend | Estado al 08/11/2026 |
| --- | --- | --- | --- |
| 83 Alertas fechadas y saldos en dashboard | 72 (Done) | Pruebas PBI 67/76 (alerta con fecha, 30 días, se resuelve al retirar), CP-13, CP-14 | Cerrada (Done); interfaz en 102 |
| 84 Prellenado del último pedido y aviso de no retornados | 57 (Done) | `ultimo_pedido` en `backend/services/clients.mjs`; prueba "No retornados: autorización sin retorno no agrega stock y nota interna queda restringida" | Cerrada (Done); interfaz en 102 |
| 87 Bodega de rotos y baja exclusiva del administrador | 68 (New) | `reporte_rotura` en `stops.mjs`, clasificación en `inventory.mjs`, CP-15 | **Mantener abierta**: el administrativo no ve ni registra reportes de rotura en la interfaz (se clasifican solos al cerrar turno) y la rotura en camino no avisa a administración ni al cliente |
| 88 Permisos diferenciados por perfil | 55 (Done) | Pruebas PBI 55, CP-17 y privacidad del estado por perfil | Cerrada (Done); login en 102, RLS en 99 |
| 89 Turno activo, orden geográfico y retiros pendientes | 70 (New) | CP-10, CP-13, CP-27, CP-28, PBI 76; orden por latitud/longitud en `backend/services/state.mjs` | Cerrada (Done); el ajuste manual de orden del planificador (criterio 2 del PBI 70) no existe en el backend y queda en el PBI 70 |
| 90 CRUD de vehículos y asignación opcional a turnos | 81 (Done) | `backend/services/vehicles.mjs` (alta, edición, baja lógica, quita de turnos en preparación, bloqueo en ruta); prueba "Vehículo opcional en planificación" | Cerrada (Done) |
| 91 Entrega parcial, ausencia y retorno de vacíos | 66 (Done) | CP-12 (una sola vez), CP-27, CP-28 | Cerrada (Done) |

## Asignaciones del Sprint 3 a Ainelyn

El 08/11/2026 se pasaron del backlog de Agustín a Ainelyn cuatro PBI de backend del proyecto, sin dependencia del despliegue: 68, 69 y 70 se movieron del Sprint 2 al 3, y 75 ya estaba en el Sprint 3. Los bugs 97 y 98 (EVA3) quedaron con Agustín. Ainelyn mantiene además 61 y 95 (Webpay), 94 (WhatsApp) y 100 (CI).

| PBI | Tarea | Qué falta en el código |
| --- | --- | --- |
| 75 Exportar pedidos y movimientos | 108 Endpoint de exportación de pedidos | No existe exportación; `send()` en `backend/server.mjs` solo responde JSON. CSV con BOM, permisos, auditoría y protección contra inyección de fórmulas |
| 75 | 109 Endpoint de exportación de movimientos | Exportar `movimiento_inventario` con filtros; la suma debe cuadrar con `v_saldo_inventario` |
| 75 | 110 Convertir CP-16 en prueba y cerrar bug 96 | `backend/tests/eva3-casos.test.mjs:461` es `test.todo` |
| 70 Asignar pedidos a ruta | 111 Guardar orden manual de paradas | `parada` no tiene columna de orden; criterio 2 del PBI |
| 70 | 112 Respetar el orden manual en la ruta del chofer | `backend/services/state.mjs:21` ordena solo por latitud/longitud |
| 68 Registrar roturas | 113 Avisar a administración y cliente por rotura en camino | `backend/services/stops.mjs:111` solo inserta en `reporte_rotura`; criterio 4 |
| 68 | 114 Trazabilidad del reporte de rotura | `reporte_rotura` no guarda parada, quién clasificó ni cuándo; el estado no separa los pendientes. Coordinar con la tarea 87 de Ignacio |
| 69 Cuadratura de inventario | 115 Ampliar `v_inconsistencias` | `database/extension-sprint1.sql:113` reemplazó la vista original de Agustín y solo revisa saldo negativo y movimiento sin responsable |
| 69 | 116 Prueba de cuadratura con los 6 criterios | Los criterios están repartidos en varias pruebas; falta una de punta a punta |

Hallazgo de la revisión: en el backend, cerrar el turno no clasifica roturas automáticamente; eso solo ocurre en el store de demostración del frontend (`useAppStore.ts`).
