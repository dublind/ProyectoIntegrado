import { randomUUID } from 'node:crypto';
import { ApiError, fail, permit } from '../shared/errors.mjs';
import { integer, text, eventKey } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit } from '../shared/audit.mjs';

export async function getBalance(db, location, condition) {
  return Number(
    (
      await one(
        db,
        'SELECT COALESCE(SUM(saldo),0) AS n FROM v_saldo_inventario s JOIN ubicacion u USING(id_ubicacion) WHERE u.codigo=$1 AND s.condicion=$2',
        [location, condition],
      )
    ).n,
  );
}

export async function move(
  db,
  user,
  {
    tipo,
    cantidad,
    origen,
    condicionOrigen,
    destino,
    condicionDestino,
    pedido = null,
    observacion,
    evento,
  },
) {
  integer(cantidad, 'Cantidad');
  fail(!observacion?.trim(), 'Se requiere motivo del movimiento');
  if (
    evento &&
    (await rows(db, 'SELECT id_movimiento FROM movimiento_inventario WHERE evento=$1', [evento]))
      .length
  ) {
    return;
  }
  const from = await one(db, 'SELECT * FROM ubicacion WHERE codigo=$1', [origen]);
  const to = await one(db, 'SELECT * FROM ubicacion WHERE codigo=$1', [destino]);
  if (from.tipo !== 'EXTERNA') {
    fail((await getBalance(db, origen, condicionOrigen)) < cantidad, 'Stock insuficiente', 409);
  }
  await db.query(
    `INSERT INTO movimiento_inventario(codigo_tipo_movimiento,id_producto,cantidad,id_ubicacion_origen,condicion_origen,id_ubicacion_destino,condicion_destino,id_pedido,responsable,observacion,evento)
  VALUES ($1,(SELECT id_producto FROM producto WHERE codigo='BIDON'),$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      tipo,
      cantidad,
      from.id_ubicacion,
      condicionOrigen,
      to.id_ubicacion,
      condicionDestino,
      pedido,
      user.username,
      observacion,
      evento ?? randomUUID(),
    ],
  );
}

export async function handleInventory(db, user, method, id, action, body) {
  if (action === 'classify') {
    permit(user, 'administrador', 'administrativo');
    const report = await one(db, 'SELECT * FROM reporte_rotura WHERE id=$1', [id]);
    if (report.clasificado) {
      return { ok: true };
    }
    await move(db, user, {
      tipo: 'ROTURA',
      cantidad: report.cantidad,
      origen: 'TRANSITO',
      condicionOrigen: 'LLENO',
      destino: 'ROTOS',
      condicionDestino: 'ROTO',
      pedido: report.pedido_id,
      observacion: 'Clasificación administrativa de reporte ' + id,
      evento: 'clasificar-' + id,
    });
    await db.query('UPDATE reporte_rotura SET clasificado=TRUE WHERE id=$1', [id]);
    await audit(db, user, 'Clasificar roto', id);
    return { ok: true };
  }

  permit(user, 'administrador');
  const count = integer(body.cantidad, 'Cantidad');

  if (action === 'writeoff') {
    fail(
      body.revisado !== true || body.eliminado !== true,
      'Confirma revisión y eliminación física',
    );
    await move(db, user, {
      tipo: 'BAJA',
      cantidad: count,
      origen: body.origen === 'BODEGA' ? 'BODEGA' : 'ROTOS',
      condicionOrigen: 'ROTO',
      destino: 'EXTERNO',
      condicionDestino: 'ROTO',
      observacion: text(body.motivo, 'Motivo de baja', 300),
      evento: eventKey(body),
    });
  } else if (action === 'fill') {
    await move(db, user, {
      tipo: 'LLENADO',
      cantidad: count,
      origen: 'BODEGA',
      condicionOrigen: 'VACIO',
      destino: 'BODEGA',
      condicionDestino: 'LLENO',
      observacion: 'Embotellación registrada por administrador',
      evento: eventKey(body),
    });
  } else if (action === 'initial') {
    await move(db, user, {
      tipo: 'INGRESO',
      cantidad: count,
      origen: 'EXTERNO',
      condicionOrigen: 'LLENO',
      destino: 'BODEGA',
      condicionDestino: 'LLENO',
      observacion: text(body.motivo, 'Motivo de ingreso', 300),
      evento: eventKey(body),
    });
  } else {
    throw new ApiError(404, 'Operación desconocida');
  }
  await audit(db, user, 'Movimiento de inventario', action, { cantidad: count });
  return { ok: true };
}
