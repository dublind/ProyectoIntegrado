import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export async function openDatabase({ memory = false, password, dataDir } = {}) {
  const directory = dataDir ?? path.resolve(root, process.env.DATA_DIR || '.local/postgres');
  if (!memory) await mkdir(directory, { recursive: true });
  const db = new PGlite(memory ? undefined : directory);
  await db.waitReady;
  if (!(await db.query("SELECT to_regclass('public.schema_local') AS version")).rows[0].version) {
    const source = await readFile(root + '/database/source/agustin-original.sql', 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(source);
      await tx.exec(await readFile(root + '/database/extension-sprint1.sql', 'utf8'));
      const localPassword =
        password || process.env.DEMO_PASSWORD || `Agua-${randomBytes(6).toString('hex')}`;
      for (const [username, nombre, rol] of [
        ['ignacio', 'Ignacio Salinas', 'administrador'],
        ['administrativo', 'Administración de pedidos', 'administrativo'],
        ['chofer', 'Chofer de prueba', 'chofer'],
      ]) {
        await tx.query('INSERT INTO usuario_local(username,nombre,rol,hash) VALUES ($1,$2,$3,$4)', [
          username,
          nombre,
          rol,
          hashPassword(localPassword),
        ]);
        await tx.query(
          'INSERT INTO operador(username,nombre) VALUES ($1,$2) ON CONFLICT (username) DO NOTHING',
          [username, nombre],
        );
      }
      if (!memory) {
        await mkdir(root + '/.local', { recursive: true });
        await writeFile(
          root + '/.local/credenciales.txt',
          `Solo desarrollo local. Datos de prueba.\nUsuarios: ignacio (administrador), administrativo, chofer\nContraseña temporal: ${localPassword}\nURL: http://127.0.0.1:5173\n`,
        );
      }
    });
  }
  // Cambios posteriores al Sprint 1: idempotentes, se aplican también sobre bases ya creadas
  for (const file of ['sprint2-avisos.sql']) {
    await db.exec(await readFile(root + '/database/' + file, 'utf8'));
  }
  return db;
}
