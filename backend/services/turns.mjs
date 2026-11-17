import { ApiError, fail, permit } from '../shared/errors.mjs';
import { text } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit, changeState } from '../shared/audit.mjs';
import { getOrder, enqueueOrder, isPaid } from './orders.mjs';
import { getBalance, move } from './inventory.mjs';
import { notifyDispatch } from './notifications.mjs';
import { permitTurnActor, saveRoute, turnLoad } from './planning.mjs';

export async function handleTurns(db, user, method, id, action, body) {
  if (method === 'POST' && !id && !action) {
    permit(user, 'administrador', 'administrativo');
    return createTurn(db, user, body);
  }

  // Bloquea el turno: salir y cerrar a la vez (o dos veces) se resuelve en orden
  const turn = await one(db, 'SELECT * FROM turno WHERE id=$1 FOR UPDATE', [id]);

  // El chofer carga, sale y cierra su propia ruta desde la app
  if (action === 'start') {
    permitTurnActor(user, turn);
    return startTurn(db, user, id, turn);
  }

  if (action === 'close') {
    permitTurnActor(user, turn);
    return closeTurn(db, user, id, turn);
  }

  if (action === 'route') {
    return saveRoute(db, user, turn, body);
  }

  permit(user, 'administrador', 'administrativo');
  if (action === 'vehicle') {
    return assignVehicle(db, user, id, body, turn);
  }
  throw new ApiError(404, 'Ruta no encontrada');
}

async function createTurn(db, user, body) {
  fail(!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha), 'Fecha inválida');
  if (body.vehiculo_id) {
    fail(
      (
        await rows(db, 'SELECT 1 FROM turno WHERE vehiculo_id=$1 AND fecha=$2', [
          Number(body.vehiculo_id),
          body.fecha,
        ])
      ).length,
      'El furgón ya tiene un turno ese día',
      409,
    );
  }
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
    await enqueueOrder(db, user, currentOrder.id_pedido, turn.id);
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
    fail((await turnLoad(db, id)) > vehicle.capacidad, 'Capacidad insuficiente', 409);
    fail(
      (
        await rows(db, 'SELECT 1 FROM turno WHERE vehiculo_id=$1 AND fecha=$2 AND id<>$3', [
          vehicle.id,
          turn.fecha,
          id,
        ])
      ).length,
      'El furgón ya tiene un turno ese día',
      409,
    );
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
  const stops = await rows(db, "SELECT * FROM parada WHERE turno_id=$1 AND estado='planificada'", [
    id,
  ]);
  fail(!stops.length, 'No hay pedidos en el turno');
  fail(
    stops.reduce((n, stop) => n + stop.cantidad, 0) > vehicle.capacidad,
    'Capacidad insuficiente',
    409,
  );
  const orders = new Map();
  for (const stop of stops) orders.set(stop.pedido_id, await getOrder(db, stop.pedido_id));
  const full = stops
    .filter((stop) => orders.get(stop.pedido_id).tipo !== 'retiro')
    .reduce((n, stop) => n + stop.cantidad, 0);
  const available = await getBalance(db, 'BODEGA', 'LLENO');
  fail(full > available, `Faltan llenos en bodega: se necesitan ${full} y hay ${available}.`, 409);
  for (const stop of stops) {
    const currentOrder = orders.get(stop.pedido_id);
    const retrieval = currentOrder.tipo === 'retiro';
    fail(
      !retrieval && (currentOrder.autorizacion === 'PENDIENTE' || !isPaid(currentOrder)),
      'Hay pedidos sin pago o autorización',
      409,
    );
    if (!retrieval) {
      await move(db, user, {
        tipo: 'DESPACHO',
        cantidad: stop.cantidad,
        origen: 'BODEGA',
        condicionOrigen: 'LLENO',
        destino: 'TRANSITO',
        condicionDestino: 'LLENO',
        pedido: currentOrder.id_pedido,
        turno: id,
        observacion: 'Carga autorizada del turno ' + id,
        evento: `carga-${id}-${currentOrder.id_pedido}`,
      });
    }
    await changeState(
      db,
      user,
      currentOrder.id_pedido,
      'En reparto',
      retrieval ? 'Salida a retiro de envases' : 'Carga y salida',
    );
    if (!retrieval) await notifyDispatch(db, id, currentOrder.id_pedido);
    await db.query("UPDATE parada SET estado='en_ruta' WHERE id=$1", [stop.id]);
  }
  await db.query("UPDATE turno SET estado='en_ruta' WHERE id=$1", [id]);
  await audit(db, user, 'Iniciar turno', id, { llenos: full });
  return { ok: true };
}

// Lo que el turno lleva a bordo según sus movimientos
async function onBoard(db, turnId, condition) {
  const row = (
    await rows(db, 'SELECT llenos, vacios FROM v_carga_turno WHERE turno_id=$1', [turnId])
  )[0];
  return Number(row?.[condition === 'LLENO' ? 'llenos' : 'vacios'] ?? 0);
}

async function closeTurn(db, user, id, turn) {
  fail(turn.estado !== 'en_ruta', 'Turno no está en ruta', 409);
  fail(
    (await rows(db, "SELECT 1 FROM parada WHERE turno_id=$1 AND estado='en_ruta'", [id])).length,
    'Hay paradas por resolver',
    409,
  );
  fail(
    (
      await rows(
        db,
        `SELECT 1 FROM reporte_rotura r
         WHERE NOT r.clasificado
           AND (r.parada_id IN (SELECT id FROM parada WHERE turno_id=$1)
                OR (r.parada_id IS NULL AND r.pedido_id IN (SELECT pedido_id FROM parada WHERE turno_id=$1)))`,
        [id],
      )
    ).length,
    'La oficina debe clasificar los reportes de rotura antes del cierre',
    409,
  );
  // Movimientos anteriores al registro por turno no llevan turno: si no hay otra ruta abierta,
  // se descarga todo lo que quede en tránsito (comportamiento original de un solo turno)
  const otherRoutes = (
    await rows(db, "SELECT 1 FROM turno WHERE estado='en_ruta' AND id<>$1", [id])
  ).length;
  const unloaded = {};
  for (const condition of ['LLENO', 'VACIO']) {
    const n = otherRoutes
      ? await onBoard(db, id, condition)
      : await getBalance(db, 'TRANSITO', condition);
    unloaded[condition] = Math.max(0, n);
    if (n > 0) {
      await move(db, user, {
        tipo: 'TRASLADO',
        cantidad: n,
        origen: 'TRANSITO',
        condicionOrigen: condition,
        destino: 'BODEGA',
        condicionDestino: condition,
        turno: id,
        observacion: 'Descarga y cuadratura al cierre',
        evento: `cierre-${id}-${condition}`,
      });
    }
  }
  // Las ausencias no resueltas vuelven a "por planificar" con su pago original
  for (const stop of await rows(
    db,
    "SELECT pedido_id FROM parada WHERE turno_id=$1 AND estado='ausente'",
    [id],
  )) {
    await changeState(db, user, stop.pedido_id, 'Pagado', 'No entregado: vuelve a por planificar');
  }
  await db.query("UPDATE turno SET estado='finalizado' WHERE id=$1", [id]);
  await audit(db, user, 'Cerrar turno', id, { llenos: unloaded.LLENO, vacios: unloaded.VACIO });
  return { ok: true, llenos: unloaded.LLENO, vacios: unloaded.VACIO };
}
