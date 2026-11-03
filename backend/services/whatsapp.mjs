import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError, fail, permit } from '../shared/errors.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit } from '../shared/audit.mjs';
import { notify } from './notifications.mjs';

const SYSTEM = { username: 'whatsapp' };
const digits = (phone) => String(phone ?? '').replace(/\D/g, '');

// Primer número razonable del texto ("mándame 3 bidones") como cantidad sugerida
function suggestedQuantity(text) {
  const match = String(text).match(/\b([1-9]\d?)\b/);
  return match ? Number(match[1]) : null;
}

// Meta firma el cuerpo con el secreto de la app. Sin secreto configurado solo se aceptan llamadas locales.
export function verifySignature(raw, header, secret, remoteAddress) {
  if (!secret) {
    fail(
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress),
      'Webhook sin firma configurada',
      403,
    );
    return;
  }
  const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(raw).digest('hex'));
  const received = Buffer.from(String(header ?? ''));
  fail(
    received.length !== expected.length || !timingSafeEqual(received, expected),
    'Firma inválida',
    403,
  );
}

// GET de verificación de Meta: devuelve el desafío si el token coincide.
export function verifySubscription(params, verifyToken) {
  fail(
    !verifyToken ||
      params.get('hub.mode') !== 'subscribe' ||
      params.get('hub.verify_token') !== verifyToken,
    'Verificación rechazada',
    403,
  );
  return params.get('hub.challenge') ?? '';
}

// PBI 59: cada mensaje entrante propone un pedido; el mismo mensaje reenviado no se duplica.
export async function receiveMessages(db, payload) {
  let created = 0;
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const names = new Map(
        (value.contacts ?? []).map((c) => [digits(c.wa_id), c.profile?.name ?? null]),
      );
      for (const message of value.messages ?? []) {
        if (!message.id || !message.from) continue;
        const phone = digits(message.from);
        const text =
          message.type === 'text'
            ? String(message.text?.body ?? '').slice(0, 1000)
            : `[Mensaje de tipo ${message.type}]`;
        const client = (
          await rows(
            db,
            "SELECT id_cliente FROM cliente WHERE regexp_replace(telefono,'\\D','','g')=$1 AND activo",
            [phone],
          )
        )[0];
        const request = (
          await rows(
            db,
            `INSERT INTO solicitud_whatsapp(mensaje_id,telefono,nombre,texto,cantidad,cliente_id)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (mensaje_id) DO NOTHING RETURNING *`,
            [
              message.id,
              phone,
              names.get(phone) ?? null,
              text,
              suggestedQuantity(text),
              client?.id_cliente ?? null,
            ],
          )
        )[0];
        if (!request) continue;
        created++;
        await notify(db, {
          evento: `solicitud-${request.id}`,
          tipo: 'SOLICITUD_WHATSAPP',
          canal: 'INTERNO',
          destino: 'administrativo',
          cliente: request.cliente_id,
          mensaje: `Nueva solicitud por WhatsApp de ${request.nombre ?? '+' + phone}: "${text.slice(0, 120)}"`,
        });
        await audit(db, SYSTEM, 'Solicitud recibida por WhatsApp', request.id);
      }
    }
  }
  return { ok: true, creadas: created };
}

export async function handleRequests(db, user, method, id, action) {
  permit(user, 'administrador', 'administrativo');
  if (action === 'discard') {
    await one(
      db,
      "UPDATE solicitud_whatsapp SET estado='descartada' WHERE id=$1 AND estado='nueva' RETURNING id",
      [id],
    );
    await db.query("UPDATE notificacion SET estado='leido' WHERE evento=$1", [`solicitud-${id}`]);
    await audit(db, user, 'Descartar solicitud de WhatsApp', id);
    return { ok: true };
  }
  throw new ApiError(404, 'Ruta no encontrada');
}

// Al crear el pedido desde la solicitud, esta queda convertida y su aviso resuelto.
export async function convertRequest(db, requestId, orderId, clientId) {
  await one(
    db,
    "UPDATE solicitud_whatsapp SET estado='convertida',pedido_id=$2,cliente_id=$3 WHERE id=$1 AND estado='nueva' RETURNING id",
    [requestId, orderId, clientId],
  );
  await db.query("UPDATE notificacion SET estado='leido' WHERE evento=$1", [
    `solicitud-${requestId}`,
  ]);
}
