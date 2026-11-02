import { one } from './database.mjs';

export async function audit(db, user, accion, entidad, datos = {}) {
  await db.query('INSERT INTO auditoria(actor,accion,entidad,datos) VALUES ($1,$2,$3,$4)', [
    user.username,
    accion,
    String(entidad),
    JSON.stringify(datos),
  ]);
}

export async function changeState(db, user, id, state, obs) {
  const e = await one(db, 'SELECT id_estado FROM estado_pedido WHERE nombre_estado=$1', [state]);
  await db.query('UPDATE pedido SET id_estado_actual=$1 WHERE id_pedido=$2', [e.id_estado, id]);
  await db.query(
    'INSERT INTO historial_estado_pedido(id_pedido,id_estado,responsable,observacion) VALUES ($1,$2,$3,$4)',
    [id, e.id_estado, user.username, obs],
  );
}
