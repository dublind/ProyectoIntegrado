# Proyecto Integrado: distribución de bidones de agua purificada

Sistema para coordinar la venta y el reparto de bidones de agua purificada. El producto busca que el equipo pueda seguir cada pedido desde su recepción y pago hasta la entrega, mientras controla el stock de botellones llenos, vacíos y en tránsito.

> **Estado:** proyecto en desarrollo. Este repositorio contiene por ahora la documentación inicial; las funcionalidades descritas corresponden al MVP planificado en [Azure DevOps](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_boards/board/t/Proyecto%20Integrado%20Team/Backlog%20items) y no deben interpretarse como implementadas.

## Problema que resuelve

La operación de reparto necesita conectar solicitudes, confirmaciones de pago, preparación de pedidos, carga de vehículos, entregas y devolución de envases. Cuando estos datos quedan separados, resulta difícil conocer el estado real de un pedido y cuadrar el inventario. El proyecto propone un flujo trazable para el personal administrativo, los choferes y la persona dueña del negocio, con información clara para el cliente.

## Objetivo del MVP

Permitir gestionar el ciclo operativo de un pedido de agua purificada y registrar los movimientos de bidones retornables. El alcance se organiza en estos bloques:

| Bloque | Capacidades previstas |
| --- | --- |
| Clientes y pedidos | Registrar clientes con varias direcciones; crear pedidos y mantener un historial de estados. |
| Canales y comunicación | Recibir solicitudes desde WhatsApp; confirmar el pedido y comunicar una promesa de entrega aprobada. |
| Pagos | Gestionar enlaces de pago Webpay y transferencias bancarias; liberar el pedido a despacho solo tras la validación correspondiente. |
| Inventario | Registrar botellones llenos, vacíos, en tránsito, pendientes y rotos mediante movimientos auditables. |
| Despacho y reparto | Asignar carga y pedidos a vehículo, ruta y chofer; confirmar entregas y retornos de envases. |
| Interfaces y acceso | Disponer de vistas para administración y reparto móvil, con permisos según perfil. |
| Seguimiento | Mostrar indicadores básicos, enviar avisos operativos y exportar movimientos para auditoría. |

El [backlog de Azure DevOps](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_boards/board/t/Proyecto%20Integrado%20Team/Backlog%20items) es la referencia para las historias, responsables, iteraciones, criterios de aceptación y estado actualizado.

## Flujo operativo esperado

1. Se recibe una solicitud y se identifica al cliente, la dirección y los bidones solicitados.
2. El equipo confirma el pedido y comunica una promesa de entrega autorizada.
3. Se registra el pago. Un Webpay aprobado o una transferencia validada habilita el despacho según la política acordada con el cliente del proyecto.
4. Se comprueba stock y capacidad del vehículo; se asignan carga, ruta y chofer.
5. El chofer registra lo efectivamente entregado y los envases vacíos recibidos.
6. El sistema actualiza el pedido y los movimientos de inventario; las diferencias, roturas o devoluciones pendientes quedan trazables.

Este flujo es una meta del producto. Las reglas de pagos, retornables, mermas y excepciones deben quedar ratificadas con el cliente antes de considerarse definitivas.

## Criterios de éxito del MVP

- Un pedido solo avanza mediante estados válidos y cada transición queda registrada.
- Un pago rechazado o una confirmación repetida no libera el pedido dos veces; una transferencia mantiene el pedido retenido hasta su aprobación.
- La carga asignada no supera el stock disponible ni la capacidad configurada del vehículo.
- La entrega actualiza el pedido y el inventario según cantidades efectivas, incluidos los envases vacíos que regresan.
- Los movimientos permiten reconstruir los saldos de llenos, vacíos, en tránsito, pendientes y rotos sin doble conteo.
- El personal administrativo, el chofer y la persona dueña acceden únicamente a las acciones permitidas para su perfil.
- El flujo integral y los fallos de integraciones se prueban antes del piloto con el cliente.

Estos puntos resumen criterios del backlog; su cumplimiento se verificará con las historias y pruebas correspondientes.

## Plan de trabajo

El backlog agrupa trabajo de definición, diseño, implementación, pruebas y piloto. Incluye arquitectura y contratos entre módulos web, API, datos, WhatsApp y Webpay; modelos de clientes, pedidos, pagos e inventario; interfaces administrativas y móviles; despacho; notificaciones; pruebas integrales, despliegue y recuperación.

Como Product Owner, Ignacio Salinas prioriza las historias y valida el alcance y los criterios de aceptación con el equipo y el cliente. El avance real se consulta en [Azure Boards](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_boards/board/t/Proyecto%20Integrado%20Team/Backlog%20items); las fechas o funcionalidades no se consideran comprometidas por aparecer en este README.

## Repositorio

En la versión actual solo se mantiene este README. Cuando se incorporen módulos de software, este documento incluirá la estructura del código, los requisitos de instalación, la configuración de entornos y los pasos para ejecutar las pruebas. La tarea de preparar repositorio, entornos y pipeline está registrada en el [ítem 54 del backlog](https://dev.azure.com/ignaciosalinas/Proyecto%20Integrado/_workitems/edit/54).
