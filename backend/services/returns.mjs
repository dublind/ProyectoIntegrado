import { ApiError, fail, permit } from '../shared/errors.mjs';
import { text, eventKey } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit } from '../shared/audit.mjs';
import { move } from './inventory.mjs';
import { notify, resolvePendingReturnAlert } from './notifications.mjs';
import { cancelRetrievalsWithoutDebt } from './planning.mjs';

export async function ageReturns(db, user) {
  const expired = await rows(
    db,
    `UPDATE retorno_pendiente r SET estado='no_retornaron'
     FROM cliente c
     WHERE c.id_cliente = r.cliente_id AND r.estado='pendiente' AND r.fecha <= now() - interval '30 days'
     RETURNING r.*, c.nombre`,
  );
  for (const r of expired) {
    await notify(db, {
      evento: `no-retornaron-${r.id}`,
      tipo: 'NO_RETORNARON',
      canal: 'INTERNO',
      destino: 'administrativo',
      pedido: r.pedido_id,
      cliente: r.cliente_id,
      mensaje: `${r.nombre}: ${r.cantidad} envase(s) cumplieron 30 días sin retirarse y pasan a no retornados.`,
    });
  }
  // A los 60 días se muestra elegible; solo la acción del administrador ejecuta la baja.
  const eligible = await rows(
    db,
    `SELECT r.*, c.nombre FROM retorno_pendiente r JOIN cliente c ON c.id_cliente = r.cliente_id
     WHERE r.estado='no_retornaron' AND r.fecha <= now() - interval '60 days'`,
  );
  for (const r of eligible) {
    await notify(db, {
      evento: `baja-elegible-${r.id}`,
      tipo: 'BAJA_ELEGIBLE',
      canal: 'INTERNO',
      destino: 'administrador',
      pedido: r.pedido_id,
      cliente: r.cliente_id,
      mensaje: `${r.nombre}: ${r.cantidad} envase(s) cumplieron 60 días sin retirarse. Revisa y registra la baja.`,
    });
  }
  if (user) {
    await audit(db, user, 'Revisión de plazos', 'retornos');
  }
}

export async function handleReturns(db, user, method, id, action, body) {
  if (action === 'age') {
    permit(user, 'administrador', 'administrativo');
    await ageReturns(db, user);
    return { ok: true };
  }

  const pendingReturn = await one(db, 'SELECT * FROM retorno_pendiente WHERE id=$1 FOR UPDATE', [
    id,
  ]);

  if (action === 'collect') {
    return collectReturn(db, user, id, body, pendingReturn);
  }

  if (action === 'writeoff') {
    return writeOffReturn(db, user, id, body, pendingReturn);
  }
  throw new ApiError(404, 'Ruta no encontrada');
}

async function collectReturn(db, user, id, body, pendingReturn) {
  permit(user, 'chofer', 'administrador');
  const key = body?.evento ? eventKey(body) : 'retiro-' + id;

  const movimientosAnteriores = await rows(
    db,
    'SELECT codigo_tipo_movimiento, observacion FROM movimiento_inventario WHERE evento=$1',
    [key],
  );

  if (movimientosAnteriores.length > 0) {
    const anterior = movimientosAnteriores[0];

    fail(
      anterior.codigo_tipo_movimiento !== 'DEVOLUCION' ||
        anterior.observacion !== 'Retirado: incidencia ' + id,
      'Identificador de evento ya utilizado',
      409,
    );

    return { ok: true };
  }

  if (pendingReturn.estado === 'retirado' && pendingReturn.retirado_por === user.username) {
    return { ok: true };
  }

  const cantidadRetirada = body?.cantidad ?? pendingReturn.cantidad;

  fail(
    !Number.isInteger(cantidadRetirada) ||
      cantidadRetirada <= 0 ||
      cantidadRetirada > pendingReturn.cantidad,
    'Cantidad de devolución inválida',
    400,
  );

  fail(
    cantidadRetirada < pendingReturn.cantidad && !body?.evento,
    'El retiro parcial requiere un identificador de evento',
    400,
  );

  fail(!['pendiente', 'no_retornaron'].includes(pendingReturn.estado), 'Retorno ya resuelto', 409);
  // Turno en ruta del chofer que pasa por este cliente (con varios furgones, el que lo visita)
  const turn = (
    await rows(
      db,
      `SELECT t.* FROM turno t
       WHERE t.estado='en_ruta' AND ($1::TEXT IS NULL OR t.chofer=$1)
         AND EXISTS (SELECT 1 FROM parada pa JOIN pedido p ON p.id_pedido=pa.pedido_id
                     WHERE pa.turno_id=t.id AND p.id_cliente=$2)
       ORDER BY t.id LIMIT 1`,
      [user.rol === 'chofer' ? user.username : null, pendingReturn.cliente_id],
    )
  )[0];
  if (!turn) {
    await one(
      db,
      "SELECT 1 FROM turno WHERE estado='en_ruta' AND ($1::TEXT IS NULL OR chofer=$1) LIMIT 1",
      [user.rol === 'chofer' ? user.username : null],
    );
    fail(true, 'Cliente fuera de tu ruta', 403);
  }
  const vehicle = await one(db, 'SELECT * FROM vehiculo WHERE id=$1', [turn.vehiculo_id]);
  const board = (
    await rows(db, 'SELECT llenos, vacios FROM v_carga_turno WHERE turno_id=$1', [turn.id])
  )[0];
  fail(
    Number(board?.llenos ?? 0) + Number(board?.vacios ?? 0) + cantidadRetirada > vehicle.capacidad,
    'Retiro excede la capacidad del vehículo; coordina con administración',
    409,
  );
  await move(db, user, {
    tipo: 'DEVOLUCION',
    cantidad: cantidadRetirada,
    origen: 'RETORNOS',
    condicionOrigen: 'VACIO',
    destino: 'TRANSITO',
    condicionDestino: 'VACIO',
    pedido: pendingReturn.pedido_id,
    turno: turn.id,
    observacion: 'Retirado: incidencia ' + id,
    evento: key,
  });
  const cantidadPendiente = pendingReturn.cantidad - cantidadRetirada;

  if (cantidadPendiente > 0) {
    await db.query('UPDATE retorno_pendiente SET cantidad=$2 WHERE id=$1', [id, cantidadPendiente]);

    await audit(db, user, 'Retiro parcial de botellones', id, {
      retirados: cantidadRetirada,
      pendientes: cantidadPendiente,
    });
  } else {
    await db.query(
      "UPDATE retorno_pendiente SET estado='retirado',fecha_resolucion=now(),retirado_por=$2 WHERE id=$1",
      [id, user.username],
    );

    await audit(db, user, 'Resolver retiro pendiente', id);
    await resolvePendingReturnAlert(db, id);
    await cancelRetrievalsWithoutDebt(db, user, pendingReturn.cliente_id);
  }

  return { ok: true };
}

async function writeOffReturn(db, user, id, body, pendingReturn) {
  permit(user, 'administrador');
  fail(!['pendiente', 'no_retornaron'].includes(pendingReturn.estado), 'Incidencia resuelta', 409);
  fail(
    new Date(pendingReturn.fecha).getTime() > Date.now() - 60 * 86400000,
    'Todavía no han transcurrido 60 días',
    409,
  );
  const evidence = text(body.evidencia, 'Revisión del administrador', 300);
  await db.query("UPDATE retorno_pendiente SET estado='baja',fecha_resolucion=now() WHERE id=$1", [
    id,
  ]);
  await db.query(
    "UPDATE cliente SET nota_no_retornados=COALESCE(nota_no_retornados || E'\n','') || $1 WHERE id_cliente=$2",
    [
      `No retornados: ${pendingReturn.cantidad} botellón(es), incidencia ${id}. Coordinar por WhatsApp antes de autorizar otro pedido.`,
      pendingReturn.cliente_id,
    ],
  );
  await db.query("UPDATE notificacion SET estado='leido' WHERE evento = ANY($1)", [
    [`retiro-${id}`, `no-retornaron-${id}`, `baja-elegible-${id}`],
  ]);
  await audit(db, user, 'Baja de no retornados', id, {
    evidencia: evidence,
    cantidad: pendingReturn.cantidad,
  });
  await cancelRetrievalsWithoutDebt(db, user, pendingReturn.cliente_id);
  return { ok: true };
}

/**
 * Retira envases pendientes de un cliente, los más antiguos primero, y los sube al furgón del turno.
 * Un retiro parcial deja el resto pendiente con su fecha original.
 */
export async function collectFifo(db, user, { clientId, cantidad, turnId, evento }) {
  const pendingReturns = await rows(
    db,
    "SELECT * FROM retorno_pendiente WHERE cliente_id=$1 AND estado IN ('pendiente','no_retornaron') ORDER BY fecha, id FOR UPDATE",
    [clientId],
  );
  let left = cantidad;
  for (const r of pendingReturns) {
    if (left <= 0) break;
    const take = Math.min(r.cantidad, left);
    await move(db, user, {
      tipo: 'DEVOLUCION',
      cantidad: take,
      origen: 'RETORNOS',
      condicionOrigen: 'VACIO',
      destino: 'TRANSITO',
      condicionDestino: 'VACIO',
      pedido: r.pedido_id,
      turno: turnId,
      observacion: 'Retirado: incidencia ' + r.id,
      evento: `${evento}-r${r.id}`,
    });
    if (take === r.cantidad) {
      await db.query(
        "UPDATE retorno_pendiente SET estado='retirado',fecha_resolucion=now(),retirado_por=$2 WHERE id=$1",
        [r.id, user.username],
      );
      await resolvePendingReturnAlert(db, r.id);
    } else {
      await db.query('UPDATE retorno_pendiente SET cantidad=$2 WHERE id=$1', [
        r.id,
        r.cantidad - take,
      ]);
    }
    left -= take;
  }
  await audit(db, user, 'Retiro de envases pendientes', clientId, { retirados: cantidad - left });
  return cantidad - left;
}
