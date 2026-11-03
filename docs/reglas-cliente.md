# Reglas confirmadas del cliente

Fuente: respuestas incorporadas en Azure el 13/10/2026, PBI 42 y 43.

- Canal actual: WhatsApp y transferencia con comprobante; embotellación semanal, cierre diario, carga nocturna y entrega al día siguiente. Google Business aún no existe; escalamiento comercial con Meta Ads, PBI 82.
- Flujo objetivo: administrativo prellena último pedido (datos, cantidad y tipo), link Webpay, pago anticipado, notificación y pedido autorizado al turno activo; chofer carga y recibe paradas geográficas, registra entrega e incidencias.
- No garantía y no contador general de botellones en poder del cliente. Se guardan incidencias concretas de retiro asociadas al despacho.
- Rotos fuera de disponibles y dentro del total físico. Chofer reporta; administrativo clasifica. Solo administrador da de baja después de revisión y eliminación física.
- Pendiente de devolución: fecha original, alerta inmediata, retiro incorporado al próximo despacho; retirado resuelve alerta y registra retorno físico una vez.
- A 30 días: no retornaron. A 60 días: baja por administrador y mensaje persistente para el administrativo. No se baja automáticamente sin el administrador. La evidencia de revisión de un envase que no está físicamente recuperado requiere precisar la regla con el cliente.
- Mensaje de no retornados solo al administrativo. Coordina por WhatsApp y autoriza con retorno o excepción sin retorno; ninguna autorización suma stock.
- Ausencia: pendiente de entrega, aviso a administración y coordinación para regresar hoy o mañana. No equivale a pendiente de devolución.
- Parcial por rotura: informar y obtener aceptación; registrar cantidades reales y llevar solo faltante al turno siguiente, con pago original y sin cobrar otra vez.
- Sin stock: embotellar y confirmar para el día siguiente; no cargar inexistencias.
- Vehículos: CRUD de capacidades y asignación opcional a turnos. Planificar sin vehículo está permitido; cargar/salir requiere vehículo válido y capacidad suficiente.

## Aplicación al modelo de Agustín

El original incluye ubicaciones de cliente para probar conservación. Se conserva como evidencia histórica. La app no crea nuevos saldos por cliente ni muestra un contador general: las nuevas entregas/retornos usan ubicaciones externas agregadas y las devoluciones pendientes se representan mediante incidencias. El total físico excluye envases fuera de bodega/vehículo, incluye rotos y no confunde una promesa de retorno con existencias.

En la copia local se conserva historial de paradas por turno para continuar el mismo pedido y pago por su cantidad faltante. Cerrar el turno devuelve al stock físico llenos no entregados y vacíos efectivamente recolectados.
