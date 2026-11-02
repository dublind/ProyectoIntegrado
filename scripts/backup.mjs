import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { openDatabase, root } from '../backend/db.mjs';
// Con el servidor detenido, exporta y verifica restauración en memoria. Nunca
// reemplaza ni elimina el directorio original de datos.
try{
 const pid=Number(await readFile(root+'/.local/server.pid','utf8'));
 try{process.kill(pid,0);throw new Error('Detén el servidor antes de respaldar la base local.');}catch(e){if(e.code!=='ESRCH')throw e;}
}catch(e){if(e.code!=='ENOENT')throw e;}
await stat(root+'/.local/postgres');
const db=await openDatabase();
const before=await db.query('SELECT COUNT(*)::INT AS clientes FROM cliente');
const dump=await db.dumpDataDir('gzip');
await mkdir(root+'/.local/backups',{recursive:true});
const filename=root+'/.local/backups/postgres-'+new Date().toISOString().replaceAll(':','-')+'.tar.gz';
await writeFile(filename,Buffer.from(await dump.arrayBuffer()));
const restored=await PGlite.create({loadDataDir:dump});
const after=await restored.query('SELECT COUNT(*)::INT AS clientes FROM cliente');
if(before.rows[0].clientes!==after.rows[0].clientes)throw new Error('La verificación de restauración falló');
await restored.close();await db.close();
console.log('Respaldo verificado:',filename);
