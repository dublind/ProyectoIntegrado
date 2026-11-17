import { ApiError, fail, permit } from '../shared/errors.mjs';
import { integer, text } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit, changeState } from '../shared/audit.mjs';
import { recargoDelivery } from '../shared/comunas.mjs';
import { getBalance } from './inventory.mjs';
import { convertRequest } from './whatsapp.mjs';
import {
  planOrder,
  unplanOrder,
  retryAbsent,
  pendingReturnsOf,
  unresolvedStop,
  turnLoad,
} from './planning.mjs';

const ORDER_DETAILS_QUERY = `
  SELECT p.*, e.nombre_estado, c.nombre, c.telefono,
         d.calle, d.numero, d.comuna, d.latitud, d.longitud,
         COALESCE((
           SELECT SUM(monto)
           FROM pago
           WHERE id_pedido = p.id_pedido AND codigo_estado = 'CONFIRMADO'
         ), 0) AS pagado
  FROM pedido p
  JOIN estado_pedido e ON e.id_estado = p.id_estado_actual
  JOIN cliente c ON c.id_cliente = p.id_cliente
  JOIN direccion d ON d.id_direccion = p.id_direccion_entrega
`;

// Monto a pagar: bidones más recargo de delivery. Un retiro de envases no se cobra.
export function amountDue(order) {
  if (order.tipo === 'retiro') return 0;
  return Number(order.cantidad) * Number(order.precio_unitario) + Number(order.recargo ?? 0);
}

export const isPaid = (order) => Number(order.pagado) >= amountDue(order);

export async function getOrder(db, id) {
  return one(db, `${ORDER_DETAILS_QUERY} WHERE p.id_pedido = $1`, [id]);
}

export async function listOrders(db) {
  return rows(db, `${ORDER_DETAILS_QUERY} ORDER BY p.id_pedido DESC`);
}

/**
 * "Pedido autorizado al turno activo": con un solo turno en preparación, un pedido pagado y
 * autorizado entra solo a ese turno. Con varios furgones planificados a la vez, el pedido
 * queda por planificar y el administrativo elige furgón y día en el calendario.
 * Un turno en bodega de días anteriores (que nunca salió) no recibe pedidos automáticamente.
 * Al crear un turno a mano (POST /turns) se indica ese turno como destino.
 */
export async function enqueueOrder(db, user, id, targetTurnId = null) {
  const currentOrder = await getOrder(db, id);
  const turns = targetTurnId
    ? await rows(db, "SELECT * FROM turno WHERE id=$1 AND estado='preparacion'", [targetTurnId])
    : await rows(
        db,
        "SELECT * FROM turno WHERE estado='preparacion' AND fecha >= CURRENT_DATE - 1",
      );
  if (
    turns.length !== 1 ||
    currentOrder.tipo === 'retiro' ||
    currentOrder.nombre_estado === 'Cancelado' ||
    currentOrder.entregados >= currentOrder.cantidad ||
    currentOrder.autorizacion === 'PENDIENTE' ||
    !isPaid(currentOrder) ||
    (await unresolvedStop(db, id))
  ) {
    return;
  }
  const turn = turns[0];
  const remaining = currentOrder.cantidad - currentOrder.entregados;
  const queued = await turnLoad(db, turn.id);
  if (queued + remaining > (await getBalance(db, 'BODEGA', 'LLENO'))) {
    return;
  }
  if (turn.vehiculo_id) {
    const vehicle = await one(db, 'SELECT * FROM vehiculo WHERE id=$1', [turn.vehiculo_id]);
    if (!vehicle.activo || queued + remaining > vehicle.capacidad) {
      return;
    }
  }
  await db.query('INSERT INTO parada(turno_id,pedido_id,cantidad) VALUES ($1,$2,$3)', [
    turn.id,
    id,
    remaining,
  ]);
  await db.query('UPDATE turno SET ruta_km=NULL,ruta_min=NULL,ruta_fuente=NULL WHERE id=$1', [
    turn.id,
  ]);
  await audit(db, user, 'Agregado al turno activo', id, { turno: turn.id, cantidad: remaining });
}

export async function handleOrders(db, user, method, id, action, body) {
  permit(user, 'administrador', 'administrativo');

  if (method === 'GET' && id) {
    return getOrderDetails(db, id);
  }

  if (method === 'POST' && action === 'retrieval') {
    return createRetrieval(db, user, body);
  }

  if (method === 'POST' && !id && !action) {
    return createOrder(db, user, body);
  }

  if (action === 'authorize') {
    return authorizeOrder(db, user, id, body);
  }

  if (action === 'enqueue') {
    await enqueueOrder(db, user, id);
    return { ok: true };
  }

  if (action === 'plan') {
    return planOrder(db, user, id, body);
  }

  if (action === 'unplan') {
    return unplanOrder(db, user, id);
  }

  if (action === 'retry') {
    return retryAbsent(db, user, id, body);
  }
  throw new ApiError(404, 'Ruta no encontrada');
}

async function getOrderDetails(db, id) {
  const currentOrder = await getOrder(db, id);
  currentOrder.historial = await rows(
    db,
    'SELECT h.*,e.nombre_estado FROM historial_estado_pedido h JOIN estado_pedido e ON e.id_estado=h.id_estado WHERE id_pedido=$1 ORDER BY fecha_cambio,id_historial',
    [id],
  );
  return currentOrder;
}

async function createOrder(db, user, body) {
  const address = await one(db, 'SELECT * FROM direccion WHERE id_direccion=$1 AND activo', [
    integer(body.id_direccion, 'Dirección', 1, 2147483647),
  ]);
  fail(address.id_cliente !== Number(body.id_cliente), 'Dirección ajena al cliente');
  const client = await one(db, 'SELECT * FROM cliente WHERE id_cliente=$1 AND activo', [
    address.id_cliente,
  ]);
  const count = integer(body.cantidad, 'Cantidad');
  fail(
    body.medio_preferido && !['WEBPAY', 'TRANSFERENCIA'].includes(body.medio_preferido),
    'Medio de pago no habilitado',
  );
  const alert =
    (
      await rows(
        db,
        "SELECT 1 FROM retorno_pendiente WHERE cliente_id=$1 AND estado IN ('no_retornaron','baja')",
        [client.id_cliente],
      )
    ).length > 0 || !!client.nota_no_retornados;
  // El recargo lo calcula el servidor según la comuna de la dirección (no lo envía el navegador)
  const recargo = body.con_recargo ? recargoDelivery(address.comuna) : 0;
  const currentOrder = await one(
    db,
    `INSERT INTO pedido(id_cliente,id_direccion_entrega,id_estado_actual,cantidad,tipo_producto,autorizacion,recargo,medio_preferido)
   VALUES ($1,$2,(SELECT id_estado FROM estado_pedido WHERE nombre_estado='Pendiente'),$3,$4,$5,$6,$7) RETURNING *`,
    [
      address.id_cliente,
      address.id_direccion,
      count,
      text(body.tipo_producto ?? 'Bidón de agua purificada 20L', 'Tipo'),
      alert ? 'PENDIENTE' : 'LIBRE',
      recargo,
      body.medio_preferido ?? null,
    ],
  );
  await changeState(
    db,
    user,
    currentOrder.id_pedido,
    'Pendiente',
    'Pedido ingresado por administración desde WhatsApp',
  );
  await audit(db, user, 'Crear pedido', currentOrder.id_pedido, { cantidad: count });
  if (body.solicitud_id) {
    await convertRequest(
      db,
      integer(body.solicitud_id, 'Solicitud', 1, 2147483647),
      currentOrder.id_pedido,
      address.id_cliente,
    );
  }
  return currentOrder;
}

// Parada solo de retiro para recoger los envases pendientes de un cliente (sin pedido nuevo ni cobro)
async function createRetrieval(db, user, body) {
  const clientId = integer(body.id_cliente, 'Cliente', 1, 2147483647);
  const client = await one(db, 'SELECT * FROM cliente WHERE id_cliente=$1 AND activo', [clientId]);
  const pending = await pendingReturnsOf(db, clientId);
  fail(pending <= 0, `${client.nombre} no tiene envases pendientes.`, 409);
  const open = (
    await rows(
      db,
      `SELECT p.id_pedido FROM pedido p JOIN estado_pedido e ON e.id_estado=p.id_estado_actual
       WHERE p.id_cliente=$1 AND p.tipo='retiro' AND e.nombre_estado NOT IN ('Entregado','Cancelado')`,
      [clientId],
    )
  )[0];
  fail(open, `${client.nombre} ya tiene el retiro N° ${open?.id_pedido} programado.`, 409);
  const address = await one(
    db,
    'SELECT * FROM direccion WHERE id_cliente=$1 AND activo ORDER BY id_direccion DESC LIMIT 1',
    [clientId],
  );
  const order = await one(
    db,
    `INSERT INTO pedido(id_cliente,id_direccion_entrega,id_estado_actual,cantidad,tipo_producto,tipo)
     VALUES ($1,$2,(SELECT id_estado FROM estado_pedido WHERE nombre_estado='Pagado'),$3,'Retiro de envases vacíos','retiro')
     RETURNING *`,
    [clientId, address.id_direccion, pending],
  );
  await changeState(db, user, order.id_pedido, 'Pagado', 'Retiro de envases sin cobro');
  await audit(db, user, 'Programar retiro', order.id_pedido, { cantidad: pending });
  return order;
}

async function authorizeOrder(db, user, id, body) {
  permit(user, 'administrativo');
  fail(!['CON_RETORNO', 'SIN_RETORNO'].includes(body.decision), 'Decisión inválida');
  await one(db, 'SELECT * FROM pedido WHERE id_pedido=$1', [id]);
  await db.query(
    'UPDATE pedido SET autorizacion=$1,observacion_autorizacion=$2 WHERE id_pedido=$3',
    [body.decision, text(body.motivo, 'Coordinación por WhatsApp', 300), id],
  );
  await audit(db, user, 'Autorizar pedido', id, { decision: body.decision, motivo: body.motivo });
  await enqueueOrder(db, user, id);
  return { ok: true };
}
