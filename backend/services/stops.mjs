import { fail, permit } from '../shared/errors.mjs';
import { integer, text, eventKey } from '../shared/validation.mjs';
import { one } from '../shared/database.mjs';
import { audit, changeState } from '../shared/audit.mjs';
import { getOrder } from './orders.mjs';
import { move } from './inventory.mjs';
import { notifyDelivery, notifyPendingReturn } from './notifications.mjs';

export async function handleStops(db, user, method, id, action, body) {
  permit(user, 'chofer');
  const stop = await one(
    db,
    'SELECT pa.*,t.chofer,t.estado AS estado_turno FROM parada pa JOIN turno t ON t.id=pa.turno_id WHERE pa.id=$1',
    [id],
  );
  fail(stop.chofer !== user.username, 'Parada asignada a otro chofer', 403);
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
    await audit(db, user, 'Cliente ausente', id);
    await notifyDelivery(db, id, currentOrder.id_pedido, { absent: true });
    return { ok: true };
  }

  const delivered = integer(body.entregados, 'Entregados', 0);
  const broken = integer(body.rotos ?? 0, 'Rotos', 0);
  const empties = integer(body.vacios ?? 0, 'Vacíos', 0);
  fail(delivered + broken > stop.cantidad, 'Cantidades superiores a la carga');
  fail(
    delivered < stop.cantidad && !body.aceptacion_parcial,
    'La entrega parcial requiere aceptación del cliente',
  );

  const pending = Number(
    (
      await one(
        db,
        "SELECT COALESCE(SUM(cantidad),0) AS n FROM retorno_pendiente WHERE cliente_id=$1 AND estado IN ('pendiente','no_retornaron')",
        [currentOrder.id_cliente],
      )
    ).n,
  );
  fail(empties > delivered + pending, 'Retornos superiores a los retiros previstos');

  if (delivered) {
    await move(db, user, {
      tipo: 'ENTREGA',
      cantidad: delivered,
      origen: 'TRANSITO',
      condicionOrigen: 'LLENO',
      destino: 'ENTREGADOS',
      condicionDestino: 'LLENO',
      pedido: currentOrder.id_pedido,
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
      observacion: 'Retiro físico confirmado por chofer',
      evento: key + '-vacios',
    });
  }

  // Los retiros antiguos son explícitos mediante /returns/:id/collect. El formulario
  // de entrega registra los vacíos del pedido actual; no resuelve acuerdos ficticios.
  fail(empties > delivered, 'Marca los retiros anteriores individualmente antes de confirmar');

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
  }

  if (broken) {
    await db.query(
      'INSERT INTO reporte_rotura(pedido_id,cantidad,detalle,chofer) VALUES ($1,$2,$3,$4)',
      [
        currentOrder.id_pedido,
        broken,
        text(body.detalle ?? 'Rotura informada al administrativo', 'Detalle', 300),
        user.username,
      ],
    );
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
      empties,
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
  await audit(db, user, 'Registrar entrega', id, { delivered, broken, empties });
  if (delivered) {
    await notifyDelivery(db, id, currentOrder.id_pedido, { delivered });
  }
  return { ok: true };
}
