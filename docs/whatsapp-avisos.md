# Avisos y solicitudes por WhatsApp (Sprint 2)

Cubre los PBI 59, 60, 67 y 73. El código funciona sin credenciales: los avisos internos se ven de inmediato en el panel y los mensajes a clientes quedan **pendientes** con el motivo a la vista hasta que se configure WhatsApp.

## Qué hace

| Hecho | Aviso | Canal |
| --- | --- | --- |
| Mensaje entrante de un cliente | Solicitud en *Pedidos y ventas* + aviso interno | Webhook → panel |
| Pago aprobado | "Recibimos tu pago… te lo llevamos mañana" + aviso al administrativo | WhatsApp + interno |
| Salida a reparto | "Tu pedido ya va en camino" | WhatsApp |
| Entrega o cliente ausente | Confirmación de la entrega o aviso de nueva visita | WhatsApp |
| Envase por retirar | Alerta fechada al administrativo; se resuelve al retirarlo | Interno |
| 30 días sin retirar | Pasa a no retornados con aviso | Interno |
| 60 días sin retirar | Aviso al administrador para registrar la baja | Interno |

Cada aviso nace de un hecho con clave única (`notificacion.evento`), así que repetir una acción o consultar el panel no duplica avisos. Una solicitud de WhatsApp se identifica por el id del mensaje: si Meta reintenta el webhook, no se crea otra.

## Envío y reintentos

El servidor revisa los mensajes pendientes cada minuto (también con *Enviar pendientes ahora* en *Bodegas*). Si WhatsApp falla, reintenta a los 1, 2, 4 y 8 minutos; al quinto fallo queda **Falló** y solo vuelve a intentarse con *Reintentar*. Sin credenciales no se gastan intentos.

## Configurar WhatsApp (pendiente del cliente)

1. Cuenta de Meta Business con WhatsApp Cloud API y un número verificado.
2. En `.env`: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET` (ver `.env.example`).
3. Registrar en Meta el webhook `https://<dominio>/api/whatsapp/webhook` con el mismo `WHATSAPP_VERIFY_TOKEN` y suscribirlo a `messages`. Requiere el servidor publicado con HTTPS.

Sin `WHATSAPP_APP_SECRET` el webhook solo acepta llamadas desde el mismo equipo (pruebas locales).

## Probar en local

```bash
curl -X POST http://127.0.0.1:8787/api/whatsapp/webhook -H "Content-Type: application/json" -d '{"entry":[{"changes":[{"value":{"contacts":[{"wa_id":"56911111111","profile":{"name":"Cliente"}}],"messages":[{"id":"wamid.prueba-1","from":"56911111111","type":"text","text":{"body":"Necesito 3 bidones"}}]}}]}]}'
```

Las pruebas automáticas están en `backend/tests/sprint2.test.mjs`.
