import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { openDatabase } from '../db.mjs';
import { createServer } from '../server.mjs';

// PBI 59, 60, 61, 67, 73 y 76: flujo integral, avisos y fallos de integraciones
let db, server, base, root;
const cookies = {};
// Canal de WhatsApp simulado: falla mientras failures > 0
const channel = { sent: [], failures: 0 };
const sender = async (n) => {
  if (channel.failures > 0) {
    channel.failures--;
    throw new Error('Servicio no disponible');
  }
  channel.sent.push(n);
};

before(async () => {
  db = await openDatabase({ memory: true, password: 'Prueba-local-2026' });
  server = createServer(db, { sender });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  root = `http://127.0.0.1:${server.address().port}`;
  base = root + '/api';
  for (const name of ['ignacio', 'administrativo', 'chofer']) {
    const res = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password: 'Prueba-local-2026' }),
    });
    cookies[name] = res.headers.get('set-cookie').split(';')[0];
  }
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

async function call(path, method = 'GET', body, username = 'administrativo', expected = 200) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookies[username] ?? '' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  assert.equal(res.status, expected, JSON.stringify(data));
  return data;
}
const phone = () => '569' + String(Math.floor(Math.random() * 90000000) + 10000000);
async function newOrder(quantity = 2, telefono = phone()) {
  const c = await call('/clients', 'POST', {
    nombre: 'Cliente ' + randomUUID().slice(0, 8),
    telefono,
  });
  const d = await call('/addresses', 'POST', {
    id_cliente: c.id_cliente,
    calle: 'Calle de prueba',
    numero: '1',
    comuna: 'Santiago',
  });
  const p = await call('/orders', 'POST', {
    id_cliente: c.id_cliente,
    id_direccion: d.id_direccion,
    cantidad: quantity,
  });
  return { c, d, p };
}
async function register(p, medio = 'WEBPAY', evento = randomUUID()) {
  return call('/payments', 'POST', {
    id_pedido: p.id_pedido,
    medio,
    monto: p.cantidad * Number(p.precio_unitario),
    comprobante: 'TEST-' + evento,
    evento,
  });
}
const confirm = (payment) =>
  call(`/payments/${payment.id_pago}/validate`, 'POST', { estado: 'CONFIRMADO' });
const count = async (sql, params) => (await db.query(sql, params)).rows[0].n;
const stopsOf = (id) => count('SELECT COUNT(*)::INT n FROM parada WHERE pedido_id=$1', [id]);
const notices = (evento) =>
  count('SELECT COUNT(*)::INT n FROM notificacion WHERE evento=$1', [evento]);

test('PBI 76/61: pago duplicado o callback repetido libera el pedido una sola vez', async () => {
  const { p } = await newOrder();
  const evento = randomUUID();
  const payment = await register(p, 'WEBPAY', evento);
  assert.equal((await register(p, 'WEBPAY', evento)).id_pago, payment.id_pago);
  await confirm(payment);
  await confirm(payment);
  assert.equal(await stopsOf(p.id_pedido), 1);
  assert.equal(
    await count('SELECT COUNT(*)::INT n FROM pago WHERE id_pedido=$1', [p.id_pedido]),
    1,
  );
  // Un segundo cobro por el mismo pedido ya pagado se rechaza
  await call(
    '/payments',
    'POST',
    { id_pedido: p.id_pedido, medio: 'WEBPAY', monto: 1000, evento: randomUUID() },
    'administrativo',
    409,
  );
  // Aviso al cliente y al administrativo, una vez cada uno
  assert.equal(await notices(`pago-${payment.id_pago}-cliente`), 1);
  assert.equal(await notices(`pago-${payment.id_pago}-interno`), 1);
});

test('PBI 76/61: rechazo o transferencia sin validar no liberan el pedido', async () => {
  const { p } = await newOrder();
  const pending = await register(p, 'TRANSFERENCIA');
  await call(`/orders/${p.id_pedido}/enqueue`, 'POST', {});
  assert.equal(await stopsOf(p.id_pedido), 0);
  await call(`/payments/${pending.id_pago}/validate`, 'POST', {
    estado: 'RECHAZADO',
    motivo: 'Comprobante ilegible',
  });
  await call(`/orders/${p.id_pedido}/enqueue`, 'POST', {});
  assert.equal(await stopsOf(p.id_pedido), 0);
  assert.equal(
    await count(
      "SELECT COUNT(*)::INT n FROM notificacion WHERE pedido_id=$1 AND tipo='PAGO_APROBADO'",
      [p.id_pedido],
    ),
    0,
  );
});

test('PBI 76: sin stock de llenos el pedido pagado no entra a la ruta', async () => {
  const big = await call('/vehicles', 'POST', {
    patente: 'GRANDE-1',
    modelo: 'Camión',
    capacidad: 5000,
  });
  await call('/turns/1/vehicle', 'POST', { vehiculo_id: big.id });
  const stock = Number(
    (await call('/state')).inventario.find((i) => i.categoria === 'LLENO')?.cantidad ?? 0,
  );
  const { p } = await newOrder(stock + 1);
  await confirm(await register(p));
  assert.equal(await stopsOf(p.id_pedido), 0);
  await call('/turns/1/vehicle', 'POST', { vehiculo_id: 1 });
});

test('PBI 60/73: avisos de despacho y entrega con reintento controlado', async () => {
  // Lo que ya estaba en la ruta del turno 1 se resuelve para dejar solo este pedido
  const { p, c } = await newOrder(1);
  const payment = await register(p);
  await confirm(payment);
  await call('/turns/1/start', 'POST', {});
  assert.equal(await notices(`despacho-1-${p.id_pedido}`), 1);

  const state = await call('/state', 'GET', undefined, 'chofer');
  for (const stop of state.paradas) {
    await call(
      `/stops/${stop.id}/deliver`,
      'POST',
      {
        entregados: stop.cantidad,
        vacios: stop.cantidad,
        evento: randomUUID(),
      },
      'chofer',
    );
  }
  const stop = state.paradas.find((s) => s.pedido_id === p.id_pedido);
  assert.equal(await notices(`entrega-${stop.id}`), 1);

  // Primer envío falla: queda pendiente con intento, error y próxima hora; el segundo envía
  channel.failures = 1000;
  const first = await call('/notifications/0/dispatch', 'POST', {});
  assert.ok(first.reintentos >= 1);
  const failed = (
    await db.query('SELECT * FROM notificacion WHERE evento=$1', [
      `pago-${payment.id_pago}-cliente`,
    ])
  ).rows[0];
  assert.equal(failed.estado, 'pendiente');
  assert.equal(failed.intentos, 1);
  assert.equal(failed.ultimo_error, 'Servicio no disponible');
  assert.ok(new Date(failed.proximo_intento) > new Date());
  channel.failures = 0;
  await db.query('UPDATE notificacion SET proximo_intento=now() WHERE id=$1', [failed.id]);
  await call('/notifications/0/dispatch', 'POST', {});
  const sent = (await db.query('SELECT * FROM notificacion WHERE id=$1', [failed.id])).rows[0];
  assert.equal(sent.estado, 'enviado');
  assert.equal(sent.intentos, 2);
  assert.ok(channel.sent.some((n) => n.destino === c.telefono && n.mensaje.includes('mañana')));
  // La promesa no compromete una hora exacta
  assert.doesNotMatch(sent.mensaje, /\d{1,2}:\d{2}/);
  await call('/turns/1/close', 'POST', {});
});

test('PBI 73: tras 5 fallos el aviso queda fallido y solo un reintento manual lo reactiva', async () => {
  const { p } = await newOrder(1);
  const payment = await register(p);
  await confirm(payment);
  const id = (
    await db.query('SELECT id FROM notificacion WHERE evento=$1', [
      `pago-${payment.id_pago}-cliente`,
    ])
  ).rows[0].id;
  await db.query("UPDATE notificacion SET estado='enviado' WHERE canal='WHATSAPP' AND id<>$1", [
    id,
  ]);
  channel.failures = 10;
  for (let i = 0; i < 5; i++) {
    await db.query('UPDATE notificacion SET proximo_intento=now() WHERE id=$1', [id]);
    await call('/notifications/0/dispatch', 'POST', {});
  }
  let row = (await db.query('SELECT * FROM notificacion WHERE id=$1', [id])).rows[0];
  assert.equal(row.estado, 'fallido');
  assert.equal(row.intentos, 5);
  await call('/notifications/0/dispatch', 'POST', {});
  assert.equal(
    (await db.query('SELECT intentos FROM notificacion WHERE id=$1', [id])).rows[0].intentos,
    5,
  );
  channel.failures = 0;
  await call(`/notifications/${id}/retry`, 'POST', {});
  await call('/notifications/0/dispatch', 'POST', {});
  row = (await db.query('SELECT * FROM notificacion WHERE id=$1', [id])).rows[0];
  assert.equal(row.estado, 'enviado');
  await call(`/notifications/${id}/retry`, 'POST', {}, 'chofer', 403);
});

test('PBI 73: sin credenciales de WhatsApp no se gastan intentos y el motivo queda a la vista', async () => {
  const local = createServer(db, { sender: null });
  await new Promise((resolve) => local.listen(0, '127.0.0.1', resolve));
  try {
    // Las sesiones son propias de cada servidor
    const login = await fetch(`http://127.0.0.1:${local.address().port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'administrativo', password: 'Prueba-local-2026' }),
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const { p } = await newOrder(1);
    const payment = await register(p);
    await confirm(payment);
    const res = await fetch(
      `http://127.0.0.1:${local.address().port}/api/notifications/0/dispatch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: '{}',
      },
    );
    assert.ok((await res.json()).sinCanal >= 1);
    const row = (
      await db.query('SELECT * FROM notificacion WHERE evento=$1', [
        `pago-${payment.id_pago}-cliente`,
      ])
    ).rows[0];
    assert.equal(row.estado, 'pendiente');
    assert.equal(row.intentos, 0);
    assert.match(row.ultimo_error, /sin credenciales/);
  } finally {
    await new Promise((resolve) => local.close(resolve));
  }
});

test('PBI 67/76: retiro pendiente alerta una vez con fecha, pasa a no retornados a los 30 días y se resuelve al retirar', async () => {
  const { c, p } = await newOrder(2);
  await confirm(await register(p));
  // El turno 1 se cerró en la prueba de despacho; este turno toma los pedidos pagados pendientes
  const turn = await call('/turns', 'POST', {
    fecha: '2026-11-03',
    nombre: 'Mañana',
    chofer: 'chofer',
    vehiculo_id: 1,
  });
  assert.ok(await stopsOf(p.id_pedido));
  await call(`/turns/${turn.id}/start`, 'POST', {});
  const stop = (await call('/state', 'GET', undefined, 'chofer')).paradas.find(
    (s) => s.pedido_id === p.id_pedido,
  );
  const body = { entregados: 2, vacios: 0, evento: randomUUID() };
  await call(`/stops/${stop.id}/deliver`, 'POST', body, 'chofer');
  await call(`/stops/${stop.id}/deliver`, 'POST', body, 'chofer');

  let state = await call('/state');
  const pending = state.retornos.find((r) => r.pedido_id === p.id_pedido);
  assert.equal(pending.cantidad, 2);
  assert.equal(pending.responsable, 'chofer');
  const alert = state.avisos.find(
    (a) => a.tipo === 'RETIRO_PENDIENTE' && a.pedido_id === p.id_pedido,
  );
  assert.ok(alert?.creado);
  assert.equal(await notices(`retiro-${pending.id}`), 1);

  // Día 30: no retornados, con un solo aviso aunque el panel se consulte varias veces
  await db.query("UPDATE retorno_pendiente SET fecha=now()-interval '31 days' WHERE id=$1", [
    pending.id,
  ]);
  await call('/state');
  await call('/state');
  state = await call('/state');
  assert.equal(state.retornos.find((r) => r.id === pending.id).estado, 'no_retornaron');
  assert.equal(await notices(`no-retornaron-${pending.id}`), 1);

  // Retirarlo en la ruta resuelve la alerta y registra el retorno físico una vez
  await call(`/returns/${pending.id}/collect`, 'POST', {}, 'chofer');
  await call(`/returns/${pending.id}/collect`, 'POST', {}, 'chofer');
  state = await call('/state');
  assert.ok(!state.retornos.some((r) => r.id === pending.id));
  assert.ok(
    !state.avisos.some((a) => a.pedido_id === p.id_pedido && a.tipo === 'RETIRO_PENDIENTE'),
  );
  assert.equal(
    await count('SELECT COUNT(*)::INT n FROM movimiento_inventario WHERE evento=$1', [
      `retiro-${pending.id}`,
    ]),
    1,
  );
  assert.ok(c.id_cliente);
  for (const other of (await call('/state', 'GET', undefined, 'chofer')).paradas.filter(
    (s) => s.estado === 'en_ruta',
  )) {
    await call(
      `/stops/${other.id}/deliver`,
      'POST',
      { ausente: true, evento: randomUUID() },
      'chofer',
    );
  }
  await call(`/turns/${turn.id}/close`, 'POST', {});
});

function metaPayload(id, from, text, name = 'Cliente WhatsApp') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ wa_id: from, profile: { name } }],
              messages: [{ id, from, type: 'text', timestamp: '1730000000', text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}
const webhook = (payload, headers = {}) =>
  fetch(root + '/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });

test('PBI 59: mensaje de WhatsApp propone un pedido, el reintento no lo duplica y se convierte una vez', async () => {
  const { c, d } = await newOrder(1, '56933334444');
  const payload = metaPayload(
    'wamid.' + randomUUID(),
    '56933334444',
    'Hola, necesito 3 bidones para mañana',
  );
  assert.equal((await webhook(payload)).status, 200);
  assert.equal((await webhook(payload)).status, 200);
  let state = await call('/state');
  const requests = state.solicitudes.filter((s) => s.telefono === '56933334444');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].cantidad, 3);
  assert.equal(requests[0].cliente_id, c.id_cliente);
  assert.ok(state.avisos.some((a) => a.tipo === 'SOLICITUD_WHATSAPP'));

  const order = await call('/orders', 'POST', {
    id_cliente: c.id_cliente,
    id_direccion: d.id_direccion,
    cantidad: requests[0].cantidad,
    solicitud_id: requests[0].id,
  });
  state = await call('/state');
  assert.ok(!state.solicitudes.some((s) => s.id === requests[0].id));
  const converted = (
    await db.query('SELECT * FROM solicitud_whatsapp WHERE id=$1', [requests[0].id])
  ).rows[0];
  assert.equal(converted.estado, 'convertida');
  assert.equal(converted.pedido_id, order.id_pedido);
  // Una solicitud ya convertida no genera un segundo pedido
  await call(
    '/orders',
    'POST',
    {
      id_cliente: c.id_cliente,
      id_direccion: d.id_direccion,
      cantidad: 1,
      solicitud_id: requests[0].id,
    },
    'administrativo',
    404,
  );

  // Número desconocido: queda como solicitud sin cliente, para crearlo al convertir
  await webhook(metaPayload('wamid.' + randomUUID(), '56900001111', 'Quiero agua'));
  const unknown = (await call('/state')).solicitudes.find((s) => s.telefono === '56900001111');
  assert.equal(unknown.cliente_id, null);
  await call(`/requests/${unknown.id}/discard`, 'POST', {});
  assert.ok(!(await call('/state')).solicitudes.some((s) => s.id === unknown.id));
});

test('PBI 59: verificación de Meta y firma del cuerpo', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = 'token-de-prueba';
  process.env.WHATSAPP_APP_SECRET = 'secreto-de-prueba';
  try {
    const ok = await fetch(
      root +
        '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=token-de-prueba&hub.challenge=12345',
    );
    assert.equal(await ok.text(), '12345');
    const wrong = await fetch(
      root + '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1',
    );
    assert.equal(wrong.status, 403);

    const body = JSON.stringify(metaPayload('wamid.' + randomUUID(), '56955556666', 'Necesito 2'));
    assert.equal((await webhook(body, { 'X-Hub-Signature-256': 'sha256=falsa' })).status, 403);
    assert.equal((await webhook(body)).status, 403);
    const signature =
      'sha256=' + createHmac('sha256', 'secreto-de-prueba').update(body).digest('hex');
    assert.equal((await webhook(body, { 'X-Hub-Signature-256': signature })).status, 200);
  } finally {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
  }
});
