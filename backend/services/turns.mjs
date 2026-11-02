import { ApiError, fail, permit } from '../shared/errors.mjs';
import { text } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit, changeState } from '../shared/audit.mjs';
import { getOrder, enqueueOrder } from './orders.mjs';
import { getBalance, move } from './inventory.mjs';

export async function handleTurns(db, user, method, id, action, body) {
  permit(user, 'administrador', 'administrativo');

  if (method === 'POST' && !id) {
    return createTurn(db, user, body);
  }

  const turn = await one(db, 'SELECT * FROM turno WHERE id=$1', [id]);

  if (action === 'vehicle') {
    return assignVehicle(db, user, id, body, turn);
  }

  if (action === 'start') {
    return startTurn(db, user, id, turn);
  }

  if (action === 'close') {
    return closeTurn(db, user, id, turn);
  }
  throw new ApiError(404, 'Ruta no encontrada');
}

async function createTurn(db, user, body) {
  fail(
    (await rows(db, "SELECT 1 FROM turno WHERE estado <> 'finalizado'")).length,
    'Ya existe un turno activo',
    409,
  );
  fail(!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha), 'Fecha inválida');
  await one(db, "SELECT 1 FROM usuario_local WHERE username=$1 AND rol='chofer' AND activo", [
    body.chofer,
  ]);
  const turn = await one(
    db,
    'INSERT INTO turno(fecha,nombre,chofer,vehiculo_id) VALUES ($1,$2,$3,$4) RETURNING *',
    [body.fecha, text(body.nombre, 'Turno', 40), body.chofer, body.vehiculo_id ?? null],
  );
  for (const currentOrder of await rows(
    db,
    'SELECT id_pedido FROM pedido WHERE entregados<cantidad',
  )) {
    await enqueueOrder(db, user, currentOrder.id_pedido);
  }
  await audit(db, user, 'Crear turno', turn.id);
  return turn;
}

async function assignVehicle(db, user, id, body, turn) {
  fail(turn.estado !== 'preparacion', 'Solo puede cambiarse vehículo durante planificación', 409);
  if (body.vehiculo_id) {
    const vehicle = await one(db, 'SELECT * FROM vehiculo WHERE id=$1 AND activo', [
      Number(body.vehiculo_id),
    ]);
    const load = Number(
      (await one(db, 'SELECT COALESCE(SUM(cantidad),0) AS n FROM parada WHERE turno_id=$1', [id]))
        .n,
    );
    fail(load > vehicle.capacidad, 'Capacidad insuficiente', 409);
  }
  await db.query('UPDATE turno SET vehiculo_id=$1 WHERE id=$2', [body.vehiculo_id ?? null, id]);
  await audit(db, user, 'Asignar vehículo', id);
  return { ok: true };
}

async function startTurn(db, user, id, turn) {
  fail(turn.estado !== 'preparacion', 'Turno ya iniciado o finalizado', 409);
  fail(!turn.vehiculo_id, 'Asigna un vehículo antes de salir', 409);
  const vehicle = await one(db, 'SELECT * FROM vehiculo WHERE id=$1 AND activo', [
    turn.vehiculo_id,
  ]);
  const stops = await rows(db, 'SELECT * FROM parada WHERE turno_id=$1', [id]);
  fail(!stops.length, 'No hay pedidos en el turno');
  fail(
    stops.reduce((n, stop) => n + stop.cantidad, 0) > vehicle.capacidad,
    'Capacidad insuficiente',
    409,
  );
  for (const stop of stops) {
    const currentOrder = await getOrder(db, stop.pedido_id);
    fail(
      currentOrder.autorizacion === 'PENDIENTE' ||
        Number(currentOrder.pagado) < Number(currentOrder.cantidad * currentOrder.precio_unitario),
      'Hay pedidos sin pago o autorización',
      409,
    );
    await move(db, user, {
      tipo: 'DESPACHO',
      cantidad: stop.cantidad,
      origen: 'BODEGA',
      condicionOrigen: 'LLENO',
      destino: 'TRANSITO',
      condicionDestino: 'LLENO',
      pedido: currentOrder.id_pedido,
      observacion: 'Carga autorizada del turno ' + id,
      evento: `carga-${id}-${currentOrder.id_pedido}`,
    });
    await changeState(db, user, currentOrder.id_pedido, 'En reparto', 'Carga y salida');
    await db.query("UPDATE parada SET estado='en_ruta' WHERE id=$1", [stop.id]);
  }
  await db.query("UPDATE turno SET estado='en_ruta' WHERE id=$1", [id]);
  await audit(db, user, 'Iniciar turno', id);
  return { ok: true };
}

async function closeTurn(db, user, id, turn) {
  fail(turn.estado !== 'en_ruta', 'Turno no está en ruta', 409);
  fail(
    (await rows(db, "SELECT 1 FROM parada WHERE turno_id=$1 AND estado='en_ruta'", [id])).length,
    'Hay paradas por resolver',
    409,
  );
  fail(
    (await rows(db, 'SELECT 1 FROM reporte_rotura WHERE NOT clasificado')).length,
    'Clasifica los reportes de rotura antes del cierre',
    409,
  );
  for (const condition of ['LLENO', 'VACIO']) {
    const n = await getBalance(db, 'TRANSITO', condition);
    if (n > 0) {
      await move(db, user, {
        tipo: 'TRASLADO',
        cantidad: n,
        origen: 'TRANSITO',
        condicionOrigen: condition,
        destino: 'BODEGA',
        condicionDestino: condition,
        observacion: 'Descarga y cuadratura al cierre',
        evento: `cierre-${id}-${condition}`,
      });
    }
  }
  await db.query("UPDATE turno SET estado='finalizado' WHERE id=$1", [id]);
  await audit(db, user, 'Cerrar turno', id);
  return { ok: true };
}
