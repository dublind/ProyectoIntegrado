import { fail, permit } from '../shared/errors.mjs';
import { integer } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit, changeState } from '../shared/audit.mjs';
import { getOrder, isPaid } from './orders.mjs';
import { move } from './inventory.mjs';

// Planificación por furgón y día (PBI 102, PBI 70): un turno por furgón y fecha, creado al
// asignarle el primer pedido. Mientras el turno está en bodega se puede mover o quitar pedidos.

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function pendingReturnsOf(db, clientId) {
  return Number(
    (
      await one(
        db,
        "SELECT COALESCE(SUM(cantidad),0) AS n FROM retorno_pendiente WHERE cliente_id=$1 AND estado IN ('pendiente','no_retornaron')",
        [clientId],
      )
    ).n,
  );
}

// Parada aún sin resolver de un pedido (planificada, en ruta o ausente) en un turno abierto
export async function unresolvedStop(db, orderId) {
  return (
    await rows(
      db,
      `SELECT pa.*, t.estado AS estado_turno, t.fecha, t.vehiculo_id, t.chofer
       FROM parada pa JOIN turno t ON t.id = pa.turno_id
       WHERE pa.pedido_id = $1 AND t.estado <> 'finalizado'
         AND pa.estado IN ('planificada','en_ruta','ausente')
       ORDER BY pa.id DESC LIMIT 1`,
      [orderId],
    )
  )[0];
}

// Cupo comprometido del turno (las paradas reprogramadas ya no ocupan el furgón)
export async function turnLoad(db, turnId) {
  return Number(
    (
      await one(
        db,
        "SELECT COALESCE(SUM(cantidad),0) AS n FROM parada WHERE turno_id=$1 AND estado <> 'reprogramada'",
        [turnId],
      )
    ).n,
  );
}

// El chofer del turno o el administrativo/administrador pueden operar la ruta
export function permitTurnActor(user, turn) {
  if (user.rol === 'chofer') {
    fail(turn.chofer !== user.username, 'Turno asignado a otro chofer', 403);
    return;
  }
  permit(user, 'administrador', 'administrativo');
}

// Al cambiar las paradas, el recorrido guardado deja de servir y el panel lo recalcula
async function resetRoute(db, turnId) {
  await db.query('UPDATE turno SET ruta_km=NULL,ruta_min=NULL,ruta_fuente=NULL WHERE id=$1', [
    turnId,
  ]);
  await db.query('UPDATE parada SET orden=NULL WHERE turno_id=$1', [turnId]);
}

// Un turno en bodega que se quedó sin paradas se elimina (no tiene movimientos asociados)
async function dropEmptyTurn(db, turnId) {
  await db.query(
    `DELETE FROM turno t WHERE t.id=$1 AND t.estado='preparacion'
       AND NOT EXISTS (SELECT 1 FROM parada WHERE turno_id=t.id)
       AND NOT EXISTS (SELECT 1 FROM movimiento_inventario WHERE turno_id=t.id)`,
    [turnId],
  );
}

async function remainingFor(db, order) {
  return order.tipo === 'retiro'
    ? pendingReturnsOf(db, order.id_cliente)
    : order.cantidad - order.entregados;
}

const vehicleName = (vehicle) => vehicle.modelo.replace(/\s*\(.*\)$/, '');
const shortDate = (fecha) => `${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`;

export async function planOrder(db, user, id, body) {
  const order = await getOrder(db, id);
  const code = `PED-${id}`;
  fail(order.nombre_estado === 'Cancelado', `${code} está cancelado.`, 409);
  fail(!isPaid(order), 'Solo se pueden planificar pedidos pagados.', 409);
  fail(
    order.autorizacion === 'PENDIENTE',
    `${code} requiere autorización del administrativo (cliente con envases no retornados).`,
    409,
  );
  const remaining = await remainingFor(db, order);
  fail(
    remaining <= 0,
    order.tipo === 'retiro'
      ? `${order.nombre} ya no tiene envases pendientes.`
      : `${code} ya fue entregado.`,
    409,
  );
  const vehicleId = integer(body.vehiculo_id, 'Furgón', 1, 2147483647);
  fail(!FECHA.test(String(body.fecha ?? '')), 'Fecha inválida');
  const fecha = body.fecha;
  // Margen de un día por la diferencia horaria entre el servidor (UTC) y Chile
  fail(
    (await one(db, 'SELECT $1::date < CURRENT_DATE - 1 AS pasado', [fecha])).pasado,
    'No se puede planificar en un día que ya pasó.',
  );
  // Bloquea el furgón: dos planificaciones simultáneas no pueden superar juntas su capacidad
  const vehicle = await one(db, 'SELECT * FROM vehiculo WHERE id=$1 AND activo FOR UPDATE', [
    vehicleId,
  ]);
  const name = vehicleName(vehicle);

  const current = await unresolvedStop(db, id);
  fail(
    current && current.estado_turno !== 'preparacion',
    `${code} ya salió a ruta y no se puede mover.`,
    409,
  );
  let turn = (
    await rows(db, 'SELECT * FROM turno WHERE vehiculo_id=$1 AND fecha=$2', [vehicleId, fecha])
  )[0];
  if (turn && current && turn.id === current.turno_id) return { ok: true, turno: turn.id };
  fail(
    turn && turn.estado !== 'preparacion',
    `${name} ya ${turn?.estado === 'en_ruta' ? 'salió a ruta' : 'cerró su ruta'} ese día. Elige otro furgón o día.`,
    409,
  );

  // Un domicilio, un furgón por día: no se manda un segundo furgón al mismo cliente o dirección
  const other = (
    await rows(
      db,
      `SELECT pa.pedido_id, v.modelo
       FROM parada pa
       JOIN turno t ON t.id = pa.turno_id
       JOIN pedido p ON p.id_pedido = pa.pedido_id
       LEFT JOIN vehiculo v ON v.id = t.vehiculo_id
       WHERE t.fecha = $1 AND t.estado <> 'finalizado' AND t.vehiculo_id IS DISTINCT FROM $2
         AND pa.pedido_id <> $3 AND pa.estado <> 'reprogramada'
         AND (p.id_cliente = $4 OR p.id_direccion_entrega = $5)
       LIMIT 1`,
      [fecha, vehicleId, id, order.id_cliente, order.id_direccion_entrega],
    )
  )[0];
  fail(
    other,
    `${order.nombre} ya tiene PED-${other?.pedido_id} en ${other?.modelo ? vehicleName(other) : 'otro furgón'} ese día. Asígnalo al mismo furgón para no ir dos veces a la misma dirección.`,
    409,
  );

  const load = turn ? await turnLoad(db, turn.id) : 0;
  fail(
    load + remaining > vehicle.capacidad,
    `${name} ya lleva ${load}/${vehicle.capacidad} el ${shortDate(fecha)}: no caben ${remaining} más.`,
    409,
  );

  if (!turn) {
    const chofer =
      vehicle.chofer ??
      (
        await rows(
          db,
          "SELECT username FROM usuario_local WHERE rol='chofer' AND activo ORDER BY id LIMIT 1",
        )
      )[0]?.username;
    fail(!chofer, 'No hay un chofer activo para el furgón', 409);
    turn = await one(
      db,
      'INSERT INTO turno(fecha,nombre,chofer,vehiculo_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [fecha, `Furgón ${vehicle.patente}`, chofer, vehicleId],
    );
  }
  if (current) {
    await db.query('DELETE FROM parada WHERE id=$1', [current.id]);
    await resetRoute(db, current.turno_id);
    await dropEmptyTurn(db, current.turno_id);
  }
  await db.query('INSERT INTO parada(turno_id,pedido_id,cantidad) VALUES ($1,$2,$3)', [
    turn.id,
    id,
    remaining,
  ]);
  await resetRoute(db, turn.id);
  await db.query('UPDATE pedido SET fecha_promesa=$1 WHERE id_pedido=$2', [fecha, id]);
  await audit(db, user, current ? 'Mover pedido de turno' : 'Planificar pedido', id, {
    turno: turn.id,
    vehiculo: vehicleId,
    fecha,
  });
  return { ok: true, turno: turn.id };
}

// Devuelve un pedido planificado a "por planificar" (solo mientras su turno sigue en bodega)
export async function unplanOrder(db, user, id) {
  const current = await unresolvedStop(db, id);
  fail(!current, `PED-${id} no está planificado.`, 409);
  fail(
    current.estado_turno !== 'preparacion',
    `PED-${id} ya salió a ruta y no se puede quitar.`,
    409,
  );
  await db.query('DELETE FROM parada WHERE id=$1', [current.id]);
  await resetRoute(db, current.turno_id);
  await dropEmptyTurn(db, current.turno_id);
  await audit(db, user, 'Quitar pedido del turno', id, { turno: current.turno_id });
  return { ok: true };
}

// Cliente ausente: volver hoy (sigue en la ruta) u otro día (los llenos vuelven a bodega)
export async function retryAbsent(db, user, id, body) {
  fail(!['hoy', 'manana'].includes(body.cuando), 'Indica si se vuelve hoy u otro día');
  const stop = await unresolvedStop(db, id);
  fail(!stop || stop.estado !== 'ausente', `PED-${id} no tiene una ausencia por resolver.`, 409);
  if (body.cuando === 'hoy') {
    await db.query("UPDATE parada SET estado='en_ruta' WHERE id=$1", [stop.id]);
    await changeState(db, user, id, 'En reparto', 'Reintento de entrega hoy');
  } else {
    const order = await getOrder(db, id);
    if (order.tipo !== 'retiro') {
      await move(db, user, {
        tipo: 'TRASLADO',
        cantidad: stop.cantidad,
        origen: 'TRANSITO',
        condicionOrigen: 'LLENO',
        destino: 'BODEGA',
        condicionDestino: 'LLENO',
        pedido: id,
        turno: stop.turno_id,
        observacion: 'Cliente ausente: llenos vuelven a bodega para otro día',
        evento: `reprograma-${stop.id}`,
      });
    }
    await db.query("UPDATE parada SET estado='reprogramada' WHERE id=$1", [stop.id]);
    await changeState(db, user, id, 'Pagado', 'Cliente ausente: queda por planificar otro día');
  }
  await audit(db, user, 'Reprogramar ausencia', id, { cuando: body.cuando });
  return { ok: true };
}

/**
 * Guarda el orden de visita de un turno en bodega (calculado por tiempo de manejo o ajustado a mano).
 * Si las paradas cambiaron desde que se calculó, responde 409 para que el panel recalcule.
 */
export async function saveRoute(db, user, turn, body) {
  permitTurnActor(user, turn);
  fail(turn.estado !== 'preparacion', 'Solo se ordena la ruta antes de salir', 409);
  fail(!Array.isArray(body.orden), 'Orden de paradas inválido');
  const order = body.orden.map((v) => integer(v, 'Pedido', 1, 2147483647));
  const stops = await rows(
    db,
    "SELECT id, pedido_id FROM parada WHERE turno_id=$1 AND estado <> 'reprogramada'",
    [turn.id],
  );
  const expected = stops.map((s) => s.pedido_id).sort((a, b) => a - b);
  fail(
    order.length !== expected.length ||
      [...order].sort((a, b) => a - b).some((v, i) => v !== expected[i]),
    'Las paradas del turno cambiaron; vuelve a calcular la ruta',
    409,
  );
  fail(body.fuente && !['calles', 'aproximada', 'manual'].includes(body.fuente), 'Fuente inválida');
  // Una optimización que empezó antes del ajuste manual no debe reemplazarlo al terminar.
  if (turn.ruta_fuente === 'manual' && body.fuente !== 'manual') {
    return { ok: true, conservada: true };
  }
  const number = (v, max) => {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    fail(!Number.isFinite(n) || n < 0 || n > max, 'Datos de ruta inválidos');
    return n;
  };
  for (const [index, orderId] of order.entries()) {
    await db.query('UPDATE parada SET orden=$1 WHERE turno_id=$2 AND pedido_id=$3', [
      index + 1,
      turn.id,
      orderId,
    ]);
  }
  await db.query('UPDATE turno SET ruta_km=$1,ruta_min=$2,ruta_fuente=$3 WHERE id=$4', [
    number(body.km, 100000),
    number(body.minutos, 100000),
    body.fuente ?? null,
    turn.id,
  ]);
  if (body.fuente === 'manual') {
    await audit(db, user, 'Ordenar paradas a mano', turn.id, { orden: order });
  }
  return { ok: true };
}

// Sin envases pendientes, los retiros aún no realizados ya no hacen falta
export async function cancelRetrievalsWithoutDebt(db, user, clientId, exceptOrderId = null) {
  if ((await pendingReturnsOf(db, clientId)) > 0) return;
  const open = await rows(
    db,
    `SELECT p.id_pedido FROM pedido p JOIN estado_pedido e ON e.id_estado=p.id_estado_actual
     WHERE p.id_cliente=$1 AND p.tipo='retiro' AND p.id_pedido IS DISTINCT FROM $2
       AND e.nombre_estado NOT IN ('Entregado','Cancelado')`,
    [clientId, exceptOrderId],
  );
  for (const { id_pedido: orderId } of open) {
    const stop = await unresolvedStop(db, orderId);
    if (stop && stop.estado_turno !== 'preparacion') continue; // ya va en ruta: el chofer lo cierra
    if (stop) {
      await db.query('DELETE FROM parada WHERE id=$1', [stop.id]);
      await resetRoute(db, stop.turno_id);
      await dropEmptyTurn(db, stop.turno_id);
    }
    await changeState(db, user, orderId, 'Cancelado', 'El cliente ya devolvió sus envases');
  }
}
