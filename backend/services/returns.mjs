import { ApiError, fail, permit } from '../shared/errors.mjs';
import { text } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit } from '../shared/audit.mjs';
import { getBalance, move } from './inventory.mjs';

export async function ageReturns(db, user) {
  await db.query(
    "UPDATE retorno_pendiente SET estado='no_retornaron' WHERE estado='pendiente' AND fecha <= now() - interval '30 days'",
  );
  // A los 60 días se muestra elegible; solo la acción del administrador ejecuta la baja.
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

  const pendingReturn = await one(db, 'SELECT * FROM retorno_pendiente WHERE id=$1', [id]);

  if (action === 'collect') {
    return collectReturn(db, user, id, pendingReturn);
  }

  if (action === 'writeoff') {
    return writeOffReturn(db, user, id, body, pendingReturn);
  }
  throw new ApiError(404, 'Ruta no encontrada');
}

async function collectReturn(db, user, id, pendingReturn) {
  permit(user, 'chofer');
  if (pendingReturn.estado === 'retirado' && pendingReturn.retirado_por === user.username) {
    return { ok: true };
  }
  fail(!['pendiente', 'no_retornaron'].includes(pendingReturn.estado), 'Retorno ya resuelto', 409);
  const turn = await one(db, "SELECT * FROM turno WHERE estado='en_ruta' AND chofer=$1", [
    user.username,
  ]);
  fail(
    !(
      await rows(
        db,
        'SELECT 1 FROM parada pa JOIN pedido p ON p.id_pedido=pa.pedido_id WHERE pa.turno_id=$1 AND p.id_cliente=$2',
        [turn.id, pendingReturn.cliente_id],
      )
    ).length,
    'Cliente fuera de tu ruta',
    403,
  );
  const vehicle = await one(db, 'SELECT * FROM vehiculo WHERE id=$1', [turn.vehiculo_id]);
  fail(
    (await getBalance(db, 'TRANSITO', 'LLENO')) +
      (await getBalance(db, 'TRANSITO', 'VACIO')) +
      pendingReturn.cantidad >
      vehicle.capacidad,
    'Retiro excede la capacidad del vehículo; coordina con administración',
    409,
  );
  await move(db, user, {
    tipo: 'DEVOLUCION',
    cantidad: pendingReturn.cantidad,
    origen: 'RETORNOS',
    condicionOrigen: 'VACIO',
    destino: 'TRANSITO',
    condicionDestino: 'VACIO',
    pedido: pendingReturn.pedido_id,
    observacion: 'Retirado: incidencia ' + id,
    evento: 'retiro-' + id,
  });
  await db.query(
    "UPDATE retorno_pendiente SET estado='retirado',fecha_resolucion=now(),retirado_por=$2 WHERE id=$1",
    [id, user.username],
  );
  await audit(db, user, 'Resolver retiro pendiente', id);
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
  await audit(db, user, 'Baja de no retornados', id, {
    evidencia: evidence,
    cantidad: pendingReturn.cantidad,
  });
  return { ok: true };
}
