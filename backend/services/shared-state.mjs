import { ApiError, fail } from '../shared/errors.mjs';
import { one } from '../shared/database.mjs';

// Estado compartido entre el panel y la app del chofer: todos los dispositivos con sesión
// ven y modifican el mismo estado. Concurrencia optimista: quien escribe envía la versión
// sobre la que trabajó; si otro dispositivo guardó antes, recibe 409 con el estado vigente.
export async function handleSharedState(db, user, method, body) {
  if (method === 'GET') {
    const row = await one(
      db,
      'SELECT version, actualizado_en, actualizado_por FROM estado_compartido WHERE id=1',
    );
    // Sin cambios desde la versión que ya tiene el cliente: no se reenvía el estado completo
    if (body.version !== undefined && Number(body.version) === row.version) {
      return { version: row.version, sinCambios: true };
    }
    return one(
      db,
      'SELECT version, datos, actualizado_en, actualizado_por FROM estado_compartido WHERE id=1',
    );
  }
  fail(method !== 'POST', 'Método no permitido', 405);
  fail(!Number.isInteger(body.version) || body.version < 0, 'Versión inválida');
  fail(
    !body.datos || typeof body.datos !== 'object' || Array.isArray(body.datos),
    'Estado inválido',
  );
  const updated = (
    await db.query(
      `UPDATE estado_compartido
       SET version = version + 1, datos = $2, actualizado_en = now(), actualizado_por = $3
       WHERE id = 1 AND version = $1
       RETURNING version, actualizado_en, actualizado_por`,
      [body.version, JSON.stringify(body.datos), user.username],
    )
  ).rows[0];
  if (!updated) {
    const current = await one(
      db,
      'SELECT version, datos, actualizado_en, actualizado_por FROM estado_compartido WHERE id=1',
    );
    const error = new ApiError(409, 'Otro usuario actualizó los datos');
    error.payload = current;
    throw error;
  }
  return updated;
}
