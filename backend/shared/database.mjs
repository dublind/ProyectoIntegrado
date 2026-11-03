import { fail } from './errors.mjs';

export const one = async (db, sql, params = []) => {
  const row = (await db.query(sql, params)).rows[0];
  fail(!row, 'Registro no encontrado', 404);
  return row;
};

export const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
