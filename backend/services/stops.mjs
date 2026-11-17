import { fail } from '../shared/errors.mjs';
import { integer, text, eventKey } from '../shared/validation.mjs';
import { one } from '../shared/database.mjs';
import { audit, changeState } from '../shared/audit.mjs';
import { getOrder } from './orders.mjs';
import { move } from './inventory.mjs';
import { notifyBreakage, notifyDelivery, notifyPendingReturn } from './notifications.mjs';
import { collectFifo } from './returns.mjs';
import { cancelRetrievalsWithoutDebt, pendingReturnsOf } from './planning.mjs';

export async function handleStops(db, user, method, id, action, body) {
  // El chofer registra su ruta; el administrador (super usuario) también puede usar la app del chofer
  fail(!['chofer', 'administrador'].includes(user.rol), 'Sin permiso', 403);
  const stop = await one(
    db,
    'SELECT pa.*,t.chofer,t.estado AS estado_turno FROM parada pa JOIN turno t ON t.id=pa.turno_id WHERE pa.id=$1 FOR UPDATE OF pa',
    [id],
  );
  fail(
    user.rol === 'chofer' && stop.chofer !== user.username,
    'Parada asignada a otro chofer',
    403,
  );
  const key = eventKey(body);
  if (stop.evento === key) {
    return { ok: true };
  }
  fail(
    stop.estado_turno !== 'en_ruta' || stop.estado !== 'en_ruta',
    'Parada ya resuelta o turno no iniciado',
    409,
  );

  const currentOrder = await getOrder(db, stop.pedido_id);

  if (body.ausente) {
    await db.query("UPDATE parada SET estado='ausente',evento=$1 WHERE id=$2", [key, id]);
    await changeState(
      db,
      user,
      currentOrder.id_pedido,
      'Ausente',
      'Coordinar regreso durante el día o mañana',
    );
    await audit(db, user, 'Cliente ausente', id, { pedido: currentOrder.id_pedido });
    await notifyDelivery(db, id, currentOrder.id_pedido, { absent: true });
    return { ok: true };
  }

  if (currentOrder.tipo === 'retiro') {
    return deliverRetrieval(db, user, stop, currentOrder, body, key);
  }

  const delivered = integer(body.entregados, 'Entregados', 0);
  const broken = integer(body.rotos ?? 0, 'Rotos', 0);
  const empties = integer(body.vacios ?? 0, 'Vacíos', 0);
  // Vacíos de entregas anteriores que el cliente devuelve en esta visita
  const previous = integer(body.retiros ?? 0, 'Retiros', 0);
  fail(delivered + broken > stop.cantidad, 'Cantidades superiores a la carga');
  fail(
    delivered < stop.cantidad && !body.aceptacion_parcial,
    'La entrega parcial requiere aceptación del cliente',
  );

  const pending = await pendingReturnsOf(db, currentOrder.id_cliente);
  fail(empties > delivered + pending, 'Retornos superiores a los retiros previstos');
  fail(previous > pending, 'El cliente no debe tantos envases de entregas anteriores');

  if (delivered) {
    await move(db, user, {
      tipo: 'ENTREGA',
      cantidad: delivered,
      origen: 'TRANSITO',
      condicionOrigen: 'LLENO',
      destino: 'ENTREGADOS',
      condicionDestino: 'LLENO',
      pedido: currentOrder.id_pedido,
      turno: stop.turno_id,
      observacion: 'Cantidad efectivamente entregada',
      evento: key + '-entrega',
    });
  }

  if (empties) {
    await move(db, user, {
      tipo: 'DEVOLUCION',
      cantidad: empties,
      origen: 'RETORNOS',
      condicionOrigen: 'VACIO',
      destino: 'TRANSITO',
      condicionDestino: 'VACIO',
      pedido: currentOrder.id_pedido,
      turno: stop.turno_id,
      observacion: 'Retiro físico confirmado por chofer',
      evento: key + '-vacios',
    });
  }

  // Los vacíos del pedido actual van en "vacios"; los de entregas anteriores, en "retiros"
  fail(empties > delivered, 'Marca los retiros anteriores individualmente antes de confirmar');

  // Se resuelven antes de registrar lo que quede pendiente de esta entrega (los más antiguos primero)
  if (previous) {
    await collectFifo(db, user, {
      clientId: currentOrder.id_cliente,
      cantidad: previous,
      turnId: stop.turno_id,
      evento: key + '-anteriores',
    });
  }

  if (delivered > empties) {
    const pendingReturn = await one(
      db,
      'INSERT INTO retorno_pendiente(cliente_id,pedido_id,cantidad,evento,responsable) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [
        currentOrder.id_cliente,
        currentOrder.id_pedido,
        delivered - empties,
        key + '-pendiente',
        user.username,
      ],
    );
    await notifyPendingReturn(db, pendingReturn);
  } else if (previous) {
    await cancelRetrievalsWithoutDebt(db, user, currentOrder.id_cliente);
  }

  if (broken) {
    const report = await one(
      db,
      'INSERT INTO reporte_rotura(pedido_id,cantidad,detalle,chofer,parada_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [
        currentOrder.id_pedido,
        broken,
        text(body.detalle ?? 'Rotura informada al administrativo', 'Detalle', 300),
        user.username,
        id,
      ],
    );
    await notifyBreakage(db, report);
  }

  await db.query('UPDATE pedido SET entregados=entregados+$1 WHERE id_pedido=$2', [
    delivered,
    currentOrder.id_pedido,
  ]);
  await db.query(
    'UPDATE parada SET entregados=$1,rotos=$2,vacios=$3,estado=$4,aceptacion_parcial=$5,evento=$6 WHERE id=$7',
    [
      delivered,
      broken,
      empties + previous,
      delivered === stop.cantidad ? 'entregada' : 'parcial',
      !!body.aceptacion_parcial,
      key,
      id,
    ],
  );

  await changeState(
    db,
    user,
    currentOrder.id_pedido,
    currentOrder.entregados + delivered === currentOrder.cantidad ? 'Entregado' : 'Parcial',
    delivered === stop.cantidad
      ? 'Entrega confirmada'
      : 'Parcial aceptada; saldo pagado en próximo turno',
  );
  await audit(db, user, 'Registrar entrega', id, {
    pedido: currentOrder.id_pedido,
    delivered,
    broken,
    empties,
    previous,
  });
  if (delivered) {
    await notifyDelivery(db, id, currentOrder.id_pedido, { delivered });
  }
  return { ok: true };
}

// Parada solo de retiro: el chofer recoge los envases pendientes del cliente (los más antiguos primero)
async function deliverRetrieval(db, user, stop, order, body, key) {
  const empties = integer(body.vacios ?? 0, 'Vacíos', 0);
  const pending = await pendingReturnsOf(db, order.id_cliente);
  fail(empties > pending, 'El cliente no debe tantos envases');
  if (empties) {
    await collectFifo(db, user, {
      clientId: order.id_cliente,
      cantidad: empties,
      turnId: stop.turno_id,
      evento: key,
    });
  }
  await db.query("UPDATE parada SET vacios=$1,estado='entregada',evento=$2 WHERE id=$3", [
    empties,
    key,
    stop.id,
  ]);
  await changeState(
    db,
    user,
    order.id_pedido,
    'Entregado',
    empties ? `Retiro de ${empties} envase(s)` : 'Retiro sin envases para recoger',
  );
  await cancelRetrievalsWithoutDebt(db, user, order.id_cliente, order.id_pedido);
  await audit(db, user, 'Registrar retiro', stop.id, { pedido: order.id_pedido, empties });
  return { ok: true };
}
