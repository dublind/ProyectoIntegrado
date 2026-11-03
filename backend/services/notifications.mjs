import { ApiError, permit } from '../shared/errors.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit } from '../shared/audit.mjs';

// Reintentos con espera creciente: 1, 2, 4 y 8 minutos; al quinto fallo queda como fallido.
export const MAX_INTENTOS = 5;

const digits = (phone) => String(phone ?? '').replace(/\D/g, '');
const money = (n) => '$' + Math.round(Number(n)).toLocaleString('es-CL');

// Registra un aviso una sola vez por hecho (evento). Los avisos internos quedan visibles de inmediato.
export async function notify(
  db,
  { evento, tipo, canal, destino, pedido = null, cliente = null, mensaje },
) {
  await db.query(
    `INSERT INTO notificacion(evento,tipo,canal,destino,pedido_id,cliente_id,mensaje,estado,enviado)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (evento) DO NOTHING`,
    [
      evento,
      tipo,
      canal,
      canal === 'WHATSAPP' ? digits(destino) : destino,
      pedido,
      cliente,
      mensaje,
      canal === 'INTERNO' ? 'enviado' : 'pendiente',
      canal === 'INTERNO' ? new Date() : null,
    ],
  );
}

async function orderContact(db, orderId) {
  return one(
    db,
    `SELECT p.id_pedido, p.cantidad, p.precio_unitario, c.id_cliente, c.nombre, c.telefono
     FROM pedido p JOIN cliente c ON c.id_cliente = p.id_cliente
     WHERE p.id_pedido = $1`,
    [orderId],
  );
}

// PBI 60 y 61: pago aprobado confirma al cliente la promesa "mañana" y avisa al administrativo.
export async function notifyPaymentApproved(db, orderId, paymentId) {
  const o = await orderContact(db, orderId);
  await notify(db, {
    evento: `pago-${paymentId}-cliente`,
    tipo: 'PAGO_APROBADO',
    canal: 'WHATSAPP',
    destino: o.telefono,
    pedido: o.id_pedido,
    cliente: o.id_cliente,
    mensaje:
      `Hola ${o.nombre}, recibimos tu pago de ${money(o.cantidad * o.precio_unitario)} ` +
      `por el pedido N° ${o.id_pedido} (${o.cantidad} bidón(es) de 20 litros). ` +
      'Tu pedido será entregado mañana; te avisaremos cuando salga el reparto.',
  });
  await notify(db, {
    evento: `pago-${paymentId}-interno`,
    tipo: 'PAGO_APROBADO',
    canal: 'INTERNO',
    destino: 'administrativo',
    pedido: o.id_pedido,
    cliente: o.id_cliente,
    mensaje: `Pago aprobado del pedido N° ${o.id_pedido} (${o.nombre}). Queda listo para el reparto.`,
  });
}

// PBI 73: salida a ruta.
export async function notifyDispatch(db, turnId, orderId) {
  const o = await orderContact(db, orderId);
  await notify(db, {
    evento: `despacho-${turnId}-${orderId}`,
    tipo: 'DESPACHO',
    canal: 'WHATSAPP',
    destino: o.telefono,
    pedido: o.id_pedido,
    cliente: o.id_cliente,
    mensaje: `Hola ${o.nombre}, tu pedido N° ${o.id_pedido} ya va en camino. Hoy pasamos a entregarlo.`,
  });
}

// PBI 73: resultado de la visita del chofer.
export async function notifyDelivery(db, stopId, orderId, { delivered = 0, absent = false }) {
  const o = await orderContact(db, orderId);
  await notify(db, {
    evento: `entrega-${stopId}`,
    tipo: absent ? 'CLIENTE_AUSENTE' : 'ENTREGA',
    canal: 'WHATSAPP',
    destino: o.telefono,
    pedido: o.id_pedido,
    cliente: o.id_cliente,
    mensaje: absent
      ? `Hola ${o.nombre}, pasamos a dejar tu pedido N° ${o.id_pedido} y no te encontramos. Te escribiremos para coordinar otra visita.`
      : `Hola ${o.nombre}, entregamos ${delivered} bidón(es) de tu pedido N° ${o.id_pedido}. ¡Gracias!`,
  });
}

// PBI 67: alerta interna fechada por cada envase que quedó por retirar.
export async function notifyPendingReturn(db, pendingReturn) {
  const client = await one(db, 'SELECT nombre FROM cliente WHERE id_cliente=$1', [
    pendingReturn.cliente_id,
  ]);
  await notify(db, {
    evento: `retiro-${pendingReturn.id}`,
    tipo: 'RETIRO_PENDIENTE',
    canal: 'INTERNO',
    destino: 'administrativo',
    pedido: pendingReturn.pedido_id,
    cliente: pendingReturn.cliente_id,
    mensaje:
      `${client.nombre} quedó con ${pendingReturn.cantidad} envase(s) por retirar ` +
      `(pedido N° ${pendingReturn.pedido_id}). Se incorporará en su próximo despacho.`,
  });
}

// Al retirar el envase, la alerta deja de estar activa.
export async function resolvePendingReturnAlert(db, pendingReturnId) {
  await db.query("UPDATE notificacion SET estado='leido' WHERE evento=$1", [
    `retiro-${pendingReturnId}`,
  ]);
}

export function whatsappSender(env = process.env) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return null;
  }
  return async (notification) => {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: notification.destino,
          type: 'text',
          text: { body: notification.mensaje },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`WhatsApp respondió ${response.status}`);
    }
  };
}

// Envía los mensajes vencidos. Sin credenciales no gasta intentos: deja el motivo a la vista.
export async function dispatchNotifications(db, sender = whatsappSender()) {
  const due = await rows(
    db,
    `SELECT * FROM notificacion
     WHERE canal='WHATSAPP' AND estado='pendiente' AND proximo_intento <= now()
     ORDER BY id LIMIT 20`,
  );
  const result = { enviados: 0, reintentos: 0, fallidos: 0, sinCanal: 0 };
  if (!sender) {
    for (const n of due) {
      await db.query('UPDATE notificacion SET ultimo_error=$1 WHERE id=$2', [
        'Canal WhatsApp sin credenciales configuradas',
        n.id,
      ]);
    }
    result.sinCanal = due.length;
    return result;
  }
  for (const n of due) {
    try {
      await sender(n);
      await db.query(
        "UPDATE notificacion SET estado='enviado',enviado=now(),intentos=intentos+1,ultimo_error=NULL WHERE id=$1",
        [n.id],
      );
      result.enviados++;
    } catch (error) {
      const attempts = n.intentos + 1;
      const failed = attempts >= MAX_INTENTOS;
      await db.query(
        `UPDATE notificacion
         SET intentos=$1, estado=$2, ultimo_error=$3,
             proximo_intento = now() + make_interval(mins => $4)
         WHERE id=$5`,
        [
          attempts,
          failed ? 'fallido' : 'pendiente',
          String(error.message).slice(0, 300),
          2 ** (attempts - 1),
          n.id,
        ],
      );
      failed ? result.fallidos++ : result.reintentos++;
    }
  }
  return result;
}

export async function handleNotifications(db, user, method, id, action, body, context = {}) {
  permit(user, 'administrador', 'administrativo');

  if (action === 'read') {
    await one(
      db,
      "UPDATE notificacion SET estado='leido' WHERE id=$1 AND canal='INTERNO' RETURNING id",
      [id],
    );
    return { ok: true };
  }

  if (action === 'retry') {
    await one(
      db,
      "UPDATE notificacion SET estado='pendiente',intentos=0,proximo_intento=now(),ultimo_error=NULL WHERE id=$1 AND canal='WHATSAPP' AND estado='fallido' RETURNING id",
      [id],
    );
    await audit(db, user, 'Reintentar aviso', id);
    return { ok: true };
  }

  if (action === 'dispatch') {
    return dispatchNotifications(
      db,
      context.sender === undefined ? whatsappSender() : context.sender,
    );
  }
  throw new ApiError(404, 'Ruta no encontrada');
}
