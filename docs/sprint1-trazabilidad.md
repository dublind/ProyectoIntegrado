# Sprint 1: trazabilidad de la versión local

Fuente: Azure Boards, Sprint 1 consultado el 13 de octubre de 2026. Los criterios originales se conservan en `docs/azure/pbi-*.json`; el tablero capturado incluye los 16 PBI siguientes. Las respuestas del cliente prevalecen sobre los supuestos anteriores del repositorio.

| PBI | Criterio / alcance | Entregable y verificación | Estado de esta copia |
| --- | --- | --- | --- |
| 42 | Validar flujo, canal y excepciones | Reglas confirmadas en Azure; `docs/reglas-cliente.md` | Evidencia del cliente conservada |
| 43 | Retornables y mermas | Incidencias fechadas, 30/60 días, baja exclusiva, sin garantía ni contador general por cliente; pruebas integrales | Implementado en modo local; revisión de pérdidas no recuperadas requiere precisión del cliente |
| 44 | Pago y liberación a despacho | Pago anticipado, validación manual, idempotencia, autorización, turno y stock | Probado localmente; Transbank real pendiente |
| 45 | Roles y disponibilidad de los cuatro integrantes | Matriz de permisos y cuentas de prueba; pruebas de API | Permisos probados; disponibilidad del equipo exige validación humana |
| 46 | Priorización y alcance aprobado | Prioridad/dependencias documentadas aquí y en Azure | La aprobación del equipo no se sustituye por código |
| 47 | Flujos de pedido, carga, entrega e incidencia | Se conserva el blueprint de Fabián en `docs/ux/`; vistas integradas y contratos | Implementado y actualizado |
| 48 | Buscar, crear y revisar pedidos con pago/estado | Vista de pedidos, búsqueda, prellenado, detalle e historial | Implementado localmente |
| 49 | Vista móvil, paradas, entrega y envases | Vista del chofer, orden geográfico, retiros y entrega parcial/ausente; cola IndexedDB | Implementado localmente; comprobar terreno/conectividad real en piloto |
| 50 | Clientes, direcciones y pedidos | Se ejecuta SQL de Agustín y se extiende con cantidades, prellenado, autorización y saldo | Esquema y pruebas ejecutados |
| 51 | Medio, comprobante, confirmación, rechazo y autor | Tablas y checks originales, vista `v_pago_detalle` y revisión API | Esquema y pruebas ejecutados |
| 52 | Inventario por movimientos | Libro original de Agustín, vistas, trigger inmutable, movimientos atómicos, total físico y rotos | Esquema y pruebas ejecutados |
| 53 | Web, API, datos, WhatsApp y Webpay, incluidos fallos | `docs/arquitectura-contratos.md` | Contratos documentados; adaptadores externos reales pendientes |
| 54 | Repositorio, entornos, validaciones y despliegue de prueba | Git clonado, rama `codex/sprint1-local`, scripts, pruebas, build y `azure-pipelines.yml` | Entorno local funcionando; pipeline debe registrarse/ejecutarse en Azure |
| 55 | Autenticación y permisos en UI/API | Contraseñas scrypt, cookie HttpOnly, sesión revocable y autorización en servidor | Probado localmente; Supabase Auth/RLS aún no conectado |
| 56 | API alta/consulta/actualización, validación y duplicados | REST de clientes/direcciones, teléfono/RUT y propiedad de dirección | Pruebas ejecutadas |
| 80 | Mockups de administración/chofer | Se conserva prototipo original de Fabián y se reutiliza su sistema visual | Original conservado; criterio vacío en Azure |

## Fuentes de código y decisiones

- **Agustín Briceño:** comentario del PBI 52, editado el 7 de octubre. Se conservan el texto de evidencia y el SQL completo en `database/source/`. Sus catálogos, claves INT identity, relaciones, checks de pagos y libro de movimientos se ejecutan en la base local; la extensión es aditiva.
- **Fabián Jeldes:** repositorio `dublind/ProyectoIntegrado`, commit base `32066b2`, con trabajos 47/48/49. Se conservan `MainAppView.vue`, tipos y store original como prototipo histórico; la ruta principal usa `SprintAppView.vue` y la paleta/estilos globales originales. El store histórico con contador de deuda no se utiliza en la aplicación nueva.
- El `AGENTS.md` actualizado del repositorio define Vue 3 y Supabase/PostgreSQL. No se implementó un segundo frontend Next.js ni una API Python, que aparecían en documentación preliminar anterior.
- La copia local utiliza **PostgreSQL con PGlite** y un servidor Node solo como adaptador de desarrollo. No es una instancia Supabase ni certifica RLS, Auth o Edge Functions en Supabase. La integración oficial queda indicada explícitamente, sin cambiar ningún proyecto remoto.

## Prioridad y dependencias

1. Reglas 42/43/44 y permisos 45 → modelos 50/51/52.
2. Contratos 53 y entorno 54 → acceso 55 y clientes/direcciones 56.
3. UX 47 → pantallas 48/49 y mockups 80.
4. Extensiones verificables del flujo para probar las reglas nuevas → PBI 57/58/61/65–72 y 81.
5. Google Business, PBI 82, es trabajo comercial. No se crea una ficha ni una campaña al ejecutar esta app.

## Verificación y límites

`npm run check` ejecuta pruebas sobre una base en memoria nueva y compila Vue/TypeScript. Las pruebas comprueban resultados, restricciones y permisos, sin depender únicamente de mensajes NOTICE del SQL de demostración. Los datos del usuario local no se reinicializan en cada arranque.

No se marca ninguna historia como terminada en Azure por tener esta copia. La capacidad semanal, aprobación de alcance, despliegue de prueba remoto, credenciales oficiales e integraciones se cierran con el equipo y su evidencia correspondiente. No se promete cumplimiento completo de esos criterios externos a través de una simulación.
