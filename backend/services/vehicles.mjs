import { fail, permit } from '../shared/errors.mjs';
import { integer, text } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit } from '../shared/audit.mjs';

export async function handleVehicles(db, user, method, id, action, body) {
  permit(user, 'administrador', 'administrativo');

  if (method === 'DELETE') {
    fail(
      (await rows(db, "SELECT 1 FROM turno WHERE vehiculo_id=$1 AND estado='en_ruta'", [id]))
        .length,
      'Vehículo en ruta',
      409,
    );
    await db.query(
      "UPDATE turno SET vehiculo_id=NULL WHERE vehiculo_id=$1 AND estado='preparacion'",
      [id],
    );
    await db.query('UPDATE vehiculo SET activo=FALSE WHERE id=$1', [id]);
    await audit(db, user, 'Desactivar vehículo', id);
    return { ok: true };
  }

  const capacity = integer(body.capacidad, 'Capacidad', 1, 10000);
  if (id) {
    // La capacidad no puede quedar bajo lo ya planificado en ningún día abierto de este furgón
    const used = (
      await rows(
        db,
        `SELECT t.fecha, COALESCE(SUM(pa.cantidad),0)::INT AS n
         FROM turno t LEFT JOIN parada pa ON pa.turno_id=t.id AND pa.estado <> 'reprogramada'
         WHERE t.vehiculo_id=$1 AND t.estado <> 'finalizado'
         GROUP BY t.id, t.fecha ORDER BY n DESC LIMIT 1`,
        [id],
      )
    )[0];
    fail(
      used && capacity < used.n,
      `Capacidad inferior a la carga asignada (${used?.n} bidones planificados)`,
      409,
    );
  }
  let chofer = null;
  if (body.chofer) {
    chofer = (
      await one(
        db,
        "SELECT username FROM usuario_local WHERE username=$1 AND rol='chofer' AND activo",
        [String(body.chofer)],
      )
    ).username;
  }

  const params = [
    text(body.patente, 'Patente', 15).toUpperCase(),
    text(body.modelo, 'Modelo', 100),
    capacity,
  ];
  const vehicle =
    method === 'POST'
      ? await one(
          db,
          `INSERT INTO vehiculo(patente,modelo,capacidad,chofer)
           VALUES ($1,$2,$3,COALESCE($4,(SELECT username FROM usuario_local WHERE rol='chofer' AND activo ORDER BY id LIMIT 1)))
           RETURNING *`,
          [...params, chofer],
        )
      : await one(
          db,
          'UPDATE vehiculo SET patente=$1,modelo=$2,capacidad=$3,chofer=COALESCE($5,chofer) WHERE id=$4 RETURNING *',
          [...params, id, chofer],
        );
  await audit(db, user, 'Guardar vehículo', vehicle.id, { capacidad: capacity });
  return vehicle;
}
