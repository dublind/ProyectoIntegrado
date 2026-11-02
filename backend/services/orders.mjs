import { ApiError, fail, permit } from '../shared/errors.mjs';
import { integer, text } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit, changeState } from '../shared/audit.mjs';
import { getBalance } from './inventory.mjs';

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

export async function getOrder(db, id) {
  return one(db, `${ORDER_DETAILS_QUERY} WHERE p.id_pedido = $1`, [id]);
}

export async function listOrders(db) {
  return rows(db, `${ORDER_DETAILS_QUERY} ORDER BY p.id_pedido DESC`);
}

export async function enqueueOrder(db, user, id) {
  const currentOrder = await getOrder(db, id);
  const turn = (await rows(db, "SELECT * FROM turno WHERE estado='preparacion'"))[0];
  if (
    !turn ||
    currentOrder.nombre_estado === 'Cancelado' ||
    currentOrder.entregados >= currentOrder.cantidad ||
    currentOrder.autorizacion === 'PENDIENTE' ||
    Number(currentOrder.pagado) < Number(currentOrder.cantidad * currentOrder.precio_unitario)
  ) {
    return;
  }
  if (
    (await rows(db, 'SELECT 1 FROM parada WHERE turno_id=$1 AND pedido_id=$2', [turn.id, id]))
      .length
  ) {
    return;
  }
  const remaining = currentOrder.cantidad - currentOrder.entregados;
  const queued = Number(
    (
      await one(db, 'SELECT COALESCE(SUM(cantidad),0) AS n FROM parada WHERE turno_id=$1', [
        turn.id,
      ])
    ).n,
  );
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
  await audit(db, user, 'Agregado al turno activo', id, { turno: turn.id, cantidad: remaining });
}

export async function handleOrders(db, user, method, id, action, body) {
  permit(user, 'administrador', 'administrativo');

  if (method === 'GET' && id) {
    return getOrderDetails(db, id);
  }

  if (method === 'POST' && !id) {
    return createOrder(db, user, body);
  }

  if (action === 'authorize') {
    return authorizeOrder(db, user, id, body);
  }

  if (action === 'enqueue') {
    await enqueueOrder(db, user, id);
    return { ok: true };
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
    integer(body.id_direccion, 'Dirección'),
  ]);
  fail(address.id_cliente !== Number(body.id_cliente), 'Dirección ajena al cliente');
  const client = await one(db, 'SELECT * FROM cliente WHERE id_cliente=$1 AND activo', [
    address.id_cliente,
  ]);
  const count = integer(body.cantidad, 'Cantidad');
  const alert =
    (
      await rows(
        db,
        "SELECT 1 FROM retorno_pendiente WHERE cliente_id=$1 AND estado IN ('no_retornaron','baja')",
        [client.id_cliente],
      )
    ).length > 0 || !!client.nota_no_retornados;
  const currentOrder = await one(
    db,
    `INSERT INTO pedido(id_cliente,id_direccion_entrega,id_estado_actual,cantidad,tipo_producto,autorizacion)
   VALUES ($1,$2,(SELECT id_estado FROM estado_pedido WHERE nombre_estado='Pendiente'),$3,$4,$5) RETURNING *`,
    [
      address.id_cliente,
      address.id_direccion,
      count,
      text(body.tipo_producto ?? 'Bidón de agua purificada 20L', 'Tipo'),
      alert ? 'PENDIENTE' : 'LIBRE',
    ],
  );
  await changeState(
    db,
    user,
    currentOrder.id_pedido,
    'Pendiente',
    'Pedido ingresado por administración desde WhatsApp',
  );
  await audit(db, user, 'Crear pedido', currentOrder.id_pedido);
  return currentOrder;
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
