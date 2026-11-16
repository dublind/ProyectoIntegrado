import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
/**
 * PostgreSQL gestionado (Railway u otro) con la misma interfaz que PGlite:
 * query(sql, params) → { rows }, exec(sql), transaction(fn), close().
 * Los tipos se parsean igual que en PGlite para que los servicios no cambien.
 */
async function openPostgres(connectionString) {
  const { default: pg } = await import('pg');
  const { types } = pg;
  types.setTypeParser(20, (v) => {
    const n = BigInt(v);
    return n < Number.MIN_SAFE_INTEGER || n > Number.MAX_SAFE_INTEGER ? n : Number(n);
  });
  types.setTypeParser(1082, (v) => new Date(v));
  const local = /@(localhost|127\.0\.0\.1|[^@/]*\.railway\.internal)(:\d+)?\//.test(
    connectionString,
  );
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 5),
    ssl: process.env.PGSSL === 'disable' || local ? false : { rejectUnauthorized: false },
  });
  pool.on('error', (e) => console.error('PostgreSQL:', e.message));
  const wrap = (client) => ({
    query: (sql, params = []) => client.query(sql, params),
    // Sin parámetros pg usa el protocolo simple, que admite varias sentencias (scripts .sql)
    exec: (sql) => client.query(sql),
  });
  return {
    ...wrap(pool),
    mode: 'PostgreSQL',
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    // Candado de sesión en una conexión dedicada (en el pool podría liberarse en otra)
    async withLock(fn) {
      const client = await pool.connect();
      try {
        await client.query('SELECT pg_advisory_lock(424242)');
        return await fn();
      } finally {
        await client.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function openDatabase({ memory = false, password, dataDir, connectionString } = {}) {
  const url = memory ? undefined : (connectionString ?? process.env.DATABASE_URL);
  let db;
  if (url) {
    db = await openPostgres(url);
  } else {
    const directory = dataDir ?? path.resolve(root, process.env.DATA_DIR || '.local/postgres');
    if (!memory) await mkdir(directory, { recursive: true });
    db = new PGlite(memory ? undefined : directory);
    await db.waitReady;
    db.mode = 'PGlite';
  }
  // Base nueva: modelo de Agustín + extensión del Sprint 1 + usuarios iniciales.
  // En PostgreSQL gestionado un candado evita que dos instancias la creen a la vez.
  if (db.withLock) await db.withLock(() => initialize(db, { memory, password, url }));
  else await initialize(db, { memory, password, url });
  return db;
}

async function initialize(db, { memory, password, url }) {
  if (!(await db.query("SELECT to_regclass('public.schema_local') AS version")).rows[0].version) {
    // En la nube la contraseña inicial es obligatoria y nunca se escribe en disco ni en los logs
    if (url && !password && !process.env.DEMO_PASSWORD)
      throw new Error('Define DEMO_PASSWORD para crear los usuarios iniciales en PostgreSQL');
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
      if (!memory && !url) {
        await mkdir(root + '/.local', { recursive: true });
        await writeFile(
          root + '/.local/credenciales.txt',
          `Solo desarrollo local. Datos de prueba.\nUsuarios: ignacio (administrador), administrativo, chofer\nContraseña temporal: ${localPassword}\nURL: http://127.0.0.1:5173\n`,
        );
      }
    });
  }
  // Cambios posteriores al Sprint 1: idempotentes, se aplican también sobre bases ya creadas
  for (const file of ['sprint2-avisos.sql', 'sprint3-cuadratura.sql']) {
    await db.exec(await readFile(root + '/database/' + file, 'utf8'));
  }
}
