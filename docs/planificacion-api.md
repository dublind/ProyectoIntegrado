# Panel conectado a la API y planificación por furgón (PBI 102 y PBI 70)

Estado al 16/11/2026.

## Qué cambió

- La interfaz principal (vistas de Fabián) ya no guarda datos en el navegador. Lee `GET /api/state` cada 4 segundos y cada acción va a su endpoint; luego vuelve a leer el estado.
- `frontend/src/store/mapeo.ts` traduce el modelo SQL de Agustín al modelo de la interfaz (pedidos, paradas por turno, inventario, rotos, avisos y actividad). Son funciones puras con pruebas en `useAppStore.test.ts`.
- La app del chofer funciona sin señal: sus acciones quedan en IndexedDB con un identificador de evento y se envían al reconectar (el servidor no las duplica).
- Se eliminaron los datos de demostración, el generador de pedidos de prueba y el botón "Restablecer demo".

## Modelo de planificación (backend)

Decisión del PO (16/11/2026): se amplía el backend para conservar el calendario por furgón y día.

- Varios turnos abiertos a la vez, como máximo uno por furgón y fecha (`database/sprint4-planificacion.sql`, se aplica en cada inicio y no borra datos).
- Lo que lleva cada furgón se cuadra por turno: los movimientos guardan `turno_id` y la vista `v_carga_turno` da llenos y vacíos a bordo. Cerrar una ruta descarga solo su furgón.
- Con un solo turno en bodega vigente (hoy o después), un pedido pagado entra solo a ese turno (regla "pedido autorizado al turno activo"). Con varios, queda por planificar. Un turno en bodega de un día pasado no recibe pedidos y sus pedidos vuelven a la cola en el panel.

| Acción | Endpoint |
| --- | --- |
| Planificar o mover un pedido | `POST /api/orders/:id/plan` `{vehiculo_id, fecha}` |
| Quitarlo del día | `POST /api/orders/:id/unplan` |
| Ausente: volver hoy u otro día | `POST /api/orders/:id/retry` `{cuando: 'hoy' \| 'manana'}` |
| Retiro de envases sin pedido nuevo | `POST /api/orders/retrieval` `{id_cliente}` |
| Orden de visita (automático o manual) | `POST /api/turns/:id/route` `{orden, km, minutos, fuente}` |
| Salir y cerrar ruta (chofer u oficina) | `POST /api/turns/:id/start`, `POST /api/turns/:id/close` |
| Entrega con vacíos de entregas anteriores | `POST /api/stops/:id/deliver` con `retiros` |

Reglas en el servidor: solo pedidos pagados y autorizados, cupo diario del furgón, un domicilio un furgón por día, no mover pedidos que ya salieron, y bloqueo de fila para que dos planificaciones simultáneas no superen la capacidad (CP-20).

Otros cambios: recargo de delivery por comuna calculado por el servidor (`backend/shared/comunas.mjs`, debe coincidir con `frontend/src/utils/comunas.ts`); aviso interno y mensaje al cliente por rotura en ruta (PBI 68, tarea 113); el reporte de rotura guarda parada, quién lo clasificó y cuándo (tarea 114); el cierre espera que la oficina clasifique las roturas de esa ruta.

## Pendiente

- Webpay sigue siendo una simulación identificada (bug 95) y la cuenta de transferencias es la de prueba (PBI 63).
- En PGlite local las horas de `pedido.fecha_creacion` (TIMESTAMP sin zona) pueden verse con una hora de diferencia en horario de verano; en PostgreSQL con zona UTC se ven bien.
