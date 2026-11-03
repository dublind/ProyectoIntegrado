import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import http from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, root } from './db.mjs';
import { execute, ApiError, fail } from './service.mjs';
import { dispatchNotifications } from './services/notifications.mjs';
import { receiveMessages, verifySignature, verifySubscription } from './services/whatsapp.mjs';

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('--- ESCANEA ESTE CÓDIGO QR CON TU CELULAR ---');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('¡Conexión exitosa con WhatsApp lista para el Sprint!');
});

client.on('message', async (msg) => {
  console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`);

  if (msg.body.toLowerCase().includes('solicitud') || msg.body.toLowerCase().includes('agua')) {
    try {
      const fakeWebhookBody = {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: msg.id._serialized,
                      from: msg.from.replace('@c.us', ''),
                      type: 'text',
                      text: { body: msg.body },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const localDb = await openDatabase();
      try {
        await localDb.transaction((tx) => receiveMessages(tx, fakeWebhookBody));
      } finally {
        await localDb.close();
      }
      console.log(`[Base de Datos] Mensaje de ${msg.from} guardado de forma exitosa.`);
      await msg.reply(
        '¡Hola! Recibimos tu solicitud de agua purificada. Procesando en el sistema...',
      );
    } catch (error) {
      console.error('Error al intentar guardar la solicitud en la base de datos:', error);
      await msg.reply(
        '¡Hola! Recibimos tu mensaje, pero estamos experimentando problemas técnicos para registrarlo.',
      );
    }
  }
});

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) client.initialize();

// options.sender reemplaza el canal de WhatsApp (pruebas); sin él se usan las variables de entorno
export function createServer(db, options = {}) {
  const sessions = new Map(),
    attempts = new Map();
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
    };
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const method = req.method;
      if (url.pathname === '/api/health')
        return send(200, { ok: true, mode: 'PostgreSQL local', version: 1 });
      if (!url.pathname.startsWith('/api/')) {
        const pathname = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const base = path.resolve(root, 'frontend/dist');
        let file = path.resolve(base, pathname);
        fail(
          !file.startsWith(base + path.sep) && file !== path.join(base, 'index.html'),
          'Ruta inválida',
          404,
        );
        let data;
        try {
          data = await readFile(file);
        } catch {
          file = path.join(base, 'index.html');
          data = await readFile(file);
        }
        const mime = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.webmanifest': 'application/manifest+json',
        };
        res.writeHead(200, {
          'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
        });
        return res.end(data);
      }
      if (method !== 'GET') {
        const origin = req.headers.origin;
        fail(
          origin &&
            ![
              'http://127.0.0.1:5173',
              'http://localhost:5173',
              'http://127.0.0.1:8787',
              'http://localhost:8787',
            ].includes(origin),
          'Origen no autorizado',
          403,
        );
        fail(req.headers['sec-fetch-site'] === 'cross-site', 'Solicitud de otro sitio', 403);
      }
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        fail(raw.length > 65536, 'Solicitud demasiado grande', 413);
      }
      let body = {};
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          throw new ApiError(400, 'JSON inválido');
        }
      }
      // Webhook de WhatsApp (Meta): no usa sesión, se valida con token y firma
      if (url.pathname === '/api/whatsapp/webhook') {
        if (method === 'GET') {
          const challenge = verifySubscription(url.searchParams, process.env.WHATSAPP_VERIFY_TOKEN);
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end(challenge);
        }
        fail(method !== 'POST', 'Método no permitido', 405);
        verifySignature(
          raw,
          req.headers['x-hub-signature-256'],
          process.env.WHATSAPP_APP_SECRET,
          req.socket.remoteAddress,
        );
        return send(200, await db.transaction((tx) => receiveMessages(tx, body)));
      }
      if (url.pathname === '/api/auth/login') {
        fail(method !== 'POST', 'Método no permitido', 405);
        const key = req.socket.remoteAddress;
        const now = Date.now();
        let attempt = attempts.get(key);
        if (!attempt || now - attempt.start > 60000) attempt = { start: now, count: 0 };
        attempt.count++;
        attempts.set(key, attempt);
        fail(attempt.count > 20, 'Espera un minuto antes de volver a intentar', 429);
        const user = (
          await db.query('SELECT * FROM usuario_local WHERE username=$1 AND activo', [
            String(body.username ?? ''),
          ])
        ).rows[0];
        const [salt, stored] = (
          user?.hash ?? '00000000000000000000000000000000:' + Buffer.alloc(64).toString('hex')
        ).split(':');
        const hash = scryptSync(String(body.password ?? ''), salt, 64);
        fail(
          !user || !timingSafeEqual(hash, Buffer.from(stored, 'hex')),
          'Usuario o contraseña incorrectos',
          401,
        );
        const token = randomBytes(32).toString('hex');
        const publicUser = { username: user.username, nombre: user.nombre, rol: user.rol };
        sessions.set(token, { user: publicUser, expires: now + 8 * 3600000 });
        res.setHeader(
          'Set-Cookie',
          `pi_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800`,
        );
        return send(200, publicUser);
      }
      const token = req.headers.cookie
        ?.split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith('pi_session='))
        ?.slice(11);
      const session = sessions.get(token);
      fail(!session || session.expires < Date.now(), 'Inicia sesión para continuar', 401);
      if (url.pathname === '/api/auth/me') return send(200, session.user);
      if (url.pathname === '/api/auth/logout') {
        fail(method !== 'POST', 'Método no permitido', 405);
        sessions.delete(token);
        res.setHeader('Set-Cookie', 'pi_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');
        return send(200, { ok: true });
      }
      fail(!['GET', 'POST', 'PATCH', 'DELETE'].includes(method), 'Método no permitido', 405);
      const result = await db.transaction((tx) =>
        execute(
          tx,
          session.user,
          method,
          url.pathname,
          method === 'GET' ? Object.fromEntries(url.searchParams) : body,
          options,
        ),
      );
      return send(200, result);
    } catch (error) {
      if (error instanceof ApiError) return send(error.status, { error: error.message });
      if (error.code?.startsWith('23'))
        return send(409, { error: 'Los datos no cumplen las restricciones del modelo' });
      console.error('Error interno:', error.message);
      send(500, { error: 'No se pudo completar la operación' });
    }
  });
}
if (isMainModule) {
  try {
    process.loadEnvFile(root + '/.env');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await mkdir(root + '/.local', { recursive: true });
  const lock = root + '/.local/server.pid';
  try {
    const pid = Number(await readFile(lock, 'utf8'));
    try {
      process.kill(pid, 0);
      console.error('Ya hay una instancia local activa.');
      process.exit(1);
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await writeFile(lock, String(process.pid));
  const db = await openDatabase();
  const server = createServer(db);
  server.listen(Number(process.env.PORT ?? 8787), '127.0.0.1', () =>
    console.log('API local: http://127.0.0.1:8787 — credenciales en .local/credenciales.txt'),
  );
  server.on('error', async (e) => {
    console.error(e.message);
    await db.close();
    await unlink(lock).catch(() => {});
    process.exit(1);
  });
  // Envía los avisos pendientes a clientes cada minuto (con reintentos controlados)
  const dispatcher = setInterval(() => {
    dispatchNotifications(db).catch((e) => console.error('Avisos:', e.message));
  }, 60000);
  dispatcher.unref();
  const stop = () =>
    server.close(async () => {
      clearInterval(dispatcher);
      await db.close();
      await unlink(lock).catch(() => {});
      process.exit(0);
    });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
