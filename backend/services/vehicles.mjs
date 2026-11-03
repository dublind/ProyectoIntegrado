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
    const turn = (
      await rows(db, "SELECT * FROM turno WHERE vehiculo_id=$1 AND estado <> 'finalizado'", [id])
    )[0];
    if (turn) {
      const used = Number(
        (
          await one(db, 'SELECT COALESCE(SUM(cantidad),0) AS n FROM parada WHERE turno_id=$1', [
            turn.id,
          ])
        ).n,
      );
      fail(capacity < used, 'Capacidad inferior a la carga asignada', 409);
    }
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
          'INSERT INTO vehiculo(patente,modelo,capacidad) VALUES ($1,$2,$3) RETURNING *',
          params,
        )
      : await one(
          db,
          'UPDATE vehiculo SET patente=$1,modelo=$2,capacidad=$3 WHERE id=$4 RETURNING *',
          [...params, id],
        );
  await audit(db, user, 'Guardar vehículo', vehicle.id);
  return vehicle;
}
