import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase, root } from '../db.mjs';
import { createServer } from '../server.mjs';

// Matriz de casos de prueba de la EVA3 (sección 5.4 del informe). Un test por caso CP-xx.
// Los casos que dependen de algo que aún no existe quedan como test.todo con su reporte de error.
let db, server, base, truck;
const cookies = {};
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
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const name of ['ignacio', 'administrativo', 'chofer']) {
    const res = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password: 'Prueba-local-2026' }),
    });
    cookies[name] = res.headers.get('set-cookie').split(';')[0];
  }
  // Furgón amplio para que la capacidad no interfiera salvo en CP-10
  truck = await call('/vehicles', 'POST', {
    patente: 'EVA3-01',
    modelo: 'Furgón de pruebas',
    capacidad: 500,
  });
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
const value = async (sql, params) => (await db.query(sql, params)).rows[0]?.n;
const stock = async (location, condition) =>
  Number(
    await value(
      `SELECT COALESCE(SUM(saldo),0)::INT n FROM v_saldo_inventario s JOIN ubicacion u USING(id_ubicacion)
       WHERE u.codigo=$1 AND s.condicion=$2`,
      [location, condition],
    ),
  );

async function newClient() {
  const c = await call('/clients', 'POST', {
    nombre: 'Cliente ' + randomUUID().slice(0, 8),
    telefono: phone(),
  });
  const d = await call('/addresses', 'POST', {
    id_cliente: c.id_cliente,
    calle: 'Av. Prueba',
    numero: String(Math.floor(Math.random() * 9000) + 100),
    comuna: 'Ñuñoa',
    latitud: -33.45,
    longitud: -70.6,
  });
  return { c, d };
}
async function newOrder(cantidad = 2) {
  const { c, d } = await newClient();
  const p = await call('/orders', 'POST', {
    id_cliente: c.id_cliente,
    id_direccion: d.id_direccion,
    cantidad,
  });
  return { c, d, p };
}
async function pay(p, medio = 'TRANSFERENCIA', monto = p.cantidad * Number(p.precio_unitario)) {
  const payment = await call('/payments', 'POST', {
    id_pedido: p.id_pedido,
    medio,
    monto,
    comprobante: 'COMP-' + randomUUID().slice(0, 8),
    evento: randomUUID(),
  });
  await call(`/payments/${payment.id_pago}/validate`, 'POST', { estado: 'CONFIRMADO' });
  return payment;
}
async function stopsOf(orderId) {
  return Number(await value('SELECT COUNT(*)::INT n FROM parada WHERE pedido_id=$1', [orderId]));
}

// Deja un turno en planificación con el furgón amplio
async function planningTurn() {
  let { turno } = await call('/state');
  if (turno?.estado === 'en_ruta') {
    await finishRoute();
    turno = null;
  }
  if (!turno) {
    // Un turno por fecha y nombre: cada turno de prueba usa el día siguiente al último existente.
    // Fechas fijas chocaban con el turno sembrado con CURRENT_DATE según el día en que corre el CI.
    const fecha = await value('SELECT (GREATEST(MAX(fecha), CURRENT_DATE) + 1)::TEXT AS n FROM turno');
    turno = await call('/turns', 'POST', {
      fecha,
      nombre: 'Mañana',
      chofer: 'chofer',
      vehiculo_id: truck.id,
    });
  }
  await call(`/turns/${turno.id}/vehicle`, 'POST', { vehiculo_id: truck.id });
  return turno;
}
// Entrega completa lo que quede en ruta y cierra el turno
async function finishRoute() {
  const { turno, paradas } = await call('/state', 'GET', undefined, 'chofer');
  if (!turno || turno.estado !== 'en_ruta') return;
  for (const s of paradas.filter((s) => s.estado === 'en_ruta')) {
    await call(
      `/stops/${s.id}/deliver`,
      'POST',
      { entregados: s.cantidad, vacios: s.cantidad, evento: randomUUID() },
      'chofer',
    );
  }
  for (const r of (await call('/state')).reportes.filter((r) => !r.clasificado)) {
    await call(`/inventory/${r.id}/classify`, 'POST', {});
  }
  await call(`/turns/${turno.id}/close`, 'POST', {});
}
async function startRoute() {
  const { turno } = await call('/state');
  await call(`/turns/${turno.id}/start`, 'POST', {});
  return turno;
}
const stopFor = async (orderId) =>
  (await call('/state', 'GET', undefined, 'chofer')).paradas.find((s) => s.pedido_id === orderId);

test('CP-01: registrar cliente con dos direcciones', async () => {
  const { c } = await newClient();
  await call('/addresses', 'POST', {
    id_cliente: c.id_cliente,
    calle: 'Los Leones',
    numero: '2341',
    comuna: 'Providencia',
    etiqueta: 'Oficina',
  });
  const saved = await call(`/clients/${c.id_cliente}`);
  assert.equal(saved.direcciones.length, 2);
  assert.ok(saved.direcciones.every((d) => d.id_cliente === c.id_cliente));
});

test('CP-02: teléfono o dirección inválidos no guardan nada (mensaje desde la API)', async () => {
  const clients = await value('SELECT COUNT(*)::INT n FROM cliente');
  const error = await call(
    '/clients',
    'POST',
    { nombre: 'Sin teléfono válido', telefono: 'abc' },
    'administrativo',
    400,
  );
  assert.equal(error.error, 'Teléfono inválido');
  assert.equal(await value('SELECT COUNT(*)::INT n FROM cliente'), clients);
  const { c } = await newClient();
  const addresses = await value('SELECT COUNT(*)::INT n FROM direccion');
  const bad = await call(
    '/addresses',
    'POST',
    { id_cliente: c.id_cliente, calle: '', comuna: 'Ñuñoa' },
    'administrativo',
    400,
  );
  assert.match(bad.error, /Calle/);
  assert.equal(await value('SELECT COUNT(*)::INT n FROM direccion'), addresses);
});

test('CP-03: total = cantidad × precio y la base rechaza valores inconsistentes', async () => {
  const { p } = await newOrder(3);
  const order = (await call('/state')).pedidos.find((x) => x.id_pedido === p.id_pedido);
  assert.equal(order.cantidad * Number(order.precio_unitario), 10500);
  // No se puede cobrar más que el total ni dejar un precio inválido en la base
  await call(
    '/payments',
    'POST',
    {
      id_pedido: p.id_pedido,
      medio: 'TRANSFERENCIA',
      monto: 10501,
      comprobante: 'X',
      evento: randomUUID(),
    },
    'administrativo',
    409,
  );
  await assert.rejects(
    db.query('UPDATE pedido SET precio_unitario=0 WHERE id_pedido=$1', [p.id_pedido]),
  );
  await assert.rejects(db.query('UPDATE pedido SET cantidad=0 WHERE id_pedido=$1', [p.id_pedido]));
});

test('CP-04: el pedido solo avanza por estados válidos y cada cambio queda registrado', async () => {
  await planningTurn();
  const { p } = await newOrder(1);
  // Sin pago no entra a la ruta: no puede saltar de Pendiente a En reparto
  await call(`/orders/${p.id_pedido}/enqueue`, 'POST', {});
  assert.equal(await stopsOf(p.id_pedido), 0);
  await pay(p);
  await startRoute();
  const stop = await stopFor(p.id_pedido);
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    { entregados: 1, vacios: 1, evento: randomUUID() },
    'chofer',
  );
  // Una parada ya resuelta no se puede volver a marcar
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    { ausente: true, evento: randomUUID() },
    'chofer',
    409,
  );
  const detail = await call(`/orders/${p.id_pedido}`);
  assert.deepEqual(
    detail.historial.map((h) => h.nombre_estado),
    ['Pendiente', 'Pagado', 'En reparto', 'Entregado'],
  );
  assert.ok(detail.historial.every((h) => h.responsable && h.fecha_cambio));
  await finishRoute();
});

test('CP-07: confirmación repetida o rechazada no cambia el estado', async () => {
  const { p } = await newOrder(1);
  const evento = randomUUID();
  const body = { id_pedido: p.id_pedido, medio: 'WEBPAY', monto: 3500, evento };
  const payment = await call('/payments', 'POST', body);
  assert.equal((await call('/payments', 'POST', body)).id_pago, payment.id_pago);
  await call(`/payments/${payment.id_pago}/validate`, 'POST', {
    estado: 'RECHAZADO',
    motivo: 'Transacción rechazada',
  });
  assert.equal((await call(`/orders/${p.id_pedido}`)).nombre_estado, 'Pendiente');
  // Un pago ya rechazado no se puede confirmar después
  await call(
    `/payments/${payment.id_pago}/validate`,
    'POST',
    { estado: 'CONFIRMADO' },
    'administrativo',
    409,
  );
  assert.equal((await call(`/orders/${p.id_pedido}`)).nombre_estado, 'Pendiente');
  const ok = await pay(p, 'WEBPAY');
  await call(`/payments/${ok.id_pago}/validate`, 'POST', { estado: 'CONFIRMADO' });
  const detail = await call(`/orders/${p.id_pedido}`);
  assert.equal(detail.historial.filter((h) => h.nombre_estado === 'Pagado').length, 1);
});

test('CP-08: la transferencia sin validar retiene el pedido', async () => {
  await planningTurn();
  const { p } = await newOrder(1);
  const payment = await call('/payments', 'POST', {
    id_pedido: p.id_pedido,
    medio: 'TRANSFERENCIA',
    monto: 3500,
    comprobante: 'C-08',
    evento: randomUUID(),
  });
  await call(`/orders/${p.id_pedido}/enqueue`, 'POST', {});
  assert.equal(await stopsOf(p.id_pedido), 0);
  await call(`/payments/${payment.id_pago}/validate`, 'POST', { estado: 'CONFIRMADO' });
  assert.equal(await stopsOf(p.id_pedido), 1);
});

test('CP-09: el comprobante 46 usa la siguiente cuenta y queda registro', async () => {
  const active = (await db.query('SELECT * FROM cuenta_bancaria WHERE activa')).rows[0];
  await db.query('UPDATE cuenta_bancaria SET comprobantes=44 WHERE id=$1', [active.id]);
  await pay((await newOrder(1)).p);
  const next = (await db.query('SELECT * FROM cuenta_bancaria WHERE activa')).rows[0];
  assert.notEqual(next.id, active.id);
  assert.equal(
    Number(await value('SELECT comprobantes n FROM cuenta_bancaria WHERE id=$1', [active.id])),
    45,
  );
  const p46 = await pay((await newOrder(1)).p);
  assert.equal(
    Number(await value('SELECT cuenta_id n FROM pago WHERE id_pago=$1', [p46.id_pago])),
    next.id,
  );
  assert.ok(
    Number(
      await value(
        "SELECT COUNT(*)::INT n FROM auditoria WHERE accion='Rotación tras 45 comprobantes'",
      ),
    ) >= 1,
  );
});

test('CP-10: capacidad del vehículo y turno sin vehículo', async () => {
  const turno = await planningTurn();
  await pay((await newOrder(2)).p);
  await call(`/turns/${turno.id}/vehicle`, 'POST', { vehiculo_id: null });
  // Se planifica sin vehículo, pero no puede salir
  const blocked = await call(`/turns/${turno.id}/start`, 'POST', {}, 'administrativo', 409);
  assert.match(blocked.error, /vehículo/);
  const small = await call('/vehicles', 'POST', {
    patente: 'CHICO-1',
    modelo: 'Pequeño',
    capacidad: 1,
  });
  await call(
    `/turns/${turno.id}/vehicle`,
    'POST',
    { vehiculo_id: small.id },
    'administrativo',
    409,
  );
  await call(`/turns/${turno.id}/vehicle`, 'POST', { vehiculo_id: truck.id });
});

test('CP-11: no se carga más que los llenos en bodega y la salida los pasa a tránsito', async () => {
  await planningTurn();
  const full = await stock('BODEGA', 'LLENO');
  const { p: big } = await newOrder(full + 1);
  await pay(big);
  assert.equal(await stopsOf(big.id_pedido), 0);
  const { turno, paradas } = await call('/state');
  const load = paradas.reduce((n, s) => n + s.cantidad, 0);
  assert.ok(load > 0 && load <= full);
  await call(`/turns/${turno.id}/start`, 'POST', {});
  assert.equal(await stock('BODEGA', 'LLENO'), full - load);
  assert.equal(await stock('TRANSITO', 'LLENO'), load);
  await finishRoute();
});

test('CP-12: entregados y vacíos actualizan pedido e inventario una sola vez, con usuario y hora', async () => {
  await planningTurn();
  const { p } = await newOrder(2);
  await pay(p);
  await startRoute();
  const stop = await stopFor(p.id_pedido);
  const body = { entregados: 2, vacios: 2, evento: randomUUID() };
  await call(`/stops/${stop.id}/deliver`, 'POST', body, 'chofer');
  await call(`/stops/${stop.id}/deliver`, 'POST', body, 'chofer');
  const moves = (
    await db.query(
      "SELECT * FROM movimiento_inventario WHERE id_pedido=$1 AND codigo_tipo_movimiento IN ('ENTREGA','DEVOLUCION')",
      [p.id_pedido],
    )
  ).rows;
  assert.equal(moves.length, 2);
  assert.ok(moves.every((m) => m.responsable === 'chofer' && m.fecha_hora));
  assert.equal(
    Number(await value('SELECT entregados n FROM pedido WHERE id_pedido=$1', [p.id_pedido])),
    2,
  );
  await finishRoute();
});

test('CP-13: vacío no retirado genera alerta, se incluye en el próximo despacho y se retira una vez', async () => {
  await planningTurn();
  const { c, d, p } = await newOrder(2);
  await pay(p);
  await startRoute();
  const stop = await stopFor(p.id_pedido);
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    { entregados: 2, vacios: 0, evento: randomUUID() },
    'chofer',
  );
  let state = await call('/state');
  const pending = state.retornos.find((r) => r.pedido_id === p.id_pedido);
  assert.ok(
    state.avisos.some(
      (a) => a.tipo === 'RETIRO_PENDIENTE' && a.pedido_id === p.id_pedido && a.creado,
    ),
  );
  await finishRoute();
  // Próximo pedido del mismo cliente: la parada trae el retiro pendiente
  await planningTurn();
  const next = await call('/orders', 'POST', {
    id_cliente: c.id_cliente,
    id_direccion: d.id_direccion,
    cantidad: 1,
  });
  await pay(next);
  await startRoute();
  assert.equal(Number((await stopFor(next.id_pedido)).retiro_pendiente), 2);
  await call(`/returns/${pending.id}/collect`, 'POST', {}, 'chofer');
  await call(`/returns/${pending.id}/collect`, 'POST', {}, 'chofer');
  assert.equal(
    Number(
      await value('SELECT COUNT(*)::INT n FROM movimiento_inventario WHERE evento=$1', [
        `retiro-${pending.id}`,
      ]),
    ),
    1,
  );
  state = await call('/state');
  assert.ok(
    !state.avisos.some((a) => a.tipo === 'RETIRO_PENDIENTE' && a.pedido_id === p.id_pedido),
  );
  await finishRoute();
});

test('CP-14 (sistema): la ecuación de stock cuadra con el libro de movimientos', async () => {
  // La comparación con el conteo físico de la bodega se hace en terreno (queda pendiente)
  const state = await call('/state');
  const total = state.inventario.reduce((n, r) => n + r.cantidad, 0);
  assert.equal(
    total,
    Number(
      await value(
        "SELECT COALESCE(SUM(saldo),0)::INT n FROM v_inventario_clasificado WHERE tipo_ubicacion <> 'CLIENTE'",
      ),
    ),
  );
  assert.deepEqual(state.inconsistencias, []);
});

test('CP-15: escalamiento a 30 y 60 días con baja exclusiva del administrador', async () => {
  const { c } = await newClient();
  const r = (
    await db.query(
      "INSERT INTO retorno_pendiente(cliente_id,cantidad,fecha,evento,responsable) VALUES ($1,1,now()-interval '31 days',$2,'chofer') RETURNING *",
      [c.id_cliente, randomUUID()],
    )
  ).rows[0];
  let state = await call('/state');
  assert.equal(state.retornos.find((x) => x.id === r.id).estado, 'no_retornaron');
  await call(`/returns/${r.id}/writeoff`, 'POST', { evidencia: 'Revisión' }, 'ignacio', 409);
  await db.query("UPDATE retorno_pendiente SET fecha=now()-interval '61 days' WHERE id=$1", [r.id]);
  state = await call('/state', 'GET', undefined, 'ignacio');
  assert.ok(state.avisos.some((a) => a.tipo === 'BAJA_ELEGIBLE' && a.cliente_id === c.id_cliente));
  await call(`/returns/${r.id}/writeoff`, 'POST', { evidencia: 'Revisión' }, 'administrativo', 403);
  await call(
    `/returns/${r.id}/writeoff`,
    'POST',
    { evidencia: 'Coordinación agotada por WhatsApp' },
    'ignacio',
  );
  const ficha = (await call('/state')).clientes.find((x) => x.id_cliente === c.id_cliente);
  assert.match(ficha.nota_no_retornados, /No retornados/);
});

test.todo('CP-16: exportar pedidos y movimientos (no implementado, ER-04, PBI 75)');

test('CP-17 (API): permisos por perfil', async () => {
  const driver = await call('/state', 'GET', undefined, 'chofer');
  assert.deepEqual(driver.pagos, []);
  assert.deepEqual(driver.cuentas, []);
  const denied = await call('/clients', 'GET', undefined, 'chofer', 403);
  assert.equal(denied.error, 'Acción no permitida para tu perfil');
  const writeoff = {
    cantidad: 1,
    origen: 'ROTOS',
    motivo: 'x',
    revisado: true,
    eliminado: true,
    evento: randomUUID(),
  };
  await call('/inventory/0/writeoff', 'POST', writeoff, 'chofer', 403);
  await call('/inventory/0/writeoff', 'POST', writeoff, 'administrativo', 403);
  await call(
    '/payments',
    'POST',
    { id_pedido: 1, medio: 'WEBPAY', monto: 1, evento: randomUUID() },
    'chofer',
    403,
  );
});

test('CP-18: inyección SQL y XSS se guardan como texto', async () => {
  const before = Number(await value('SELECT COUNT(*)::INT n FROM cliente'));
  const sql = await call('/clients', 'POST', { nombre: "' OR 1=1 --", telefono: phone() });
  const xss = await call('/clients', 'POST', {
    nombre: '<script>alert(1)</script>',
    telefono: phone(),
  });
  assert.equal(Number(await value('SELECT COUNT(*)::INT n FROM cliente')), before + 2);
  assert.equal((await call(`/clients/${sql.id_cliente}`)).nombre, "' OR 1=1 --");
  assert.equal((await call(`/clients/${xss.id_cliente}`)).nombre, '<script>alert(1)</script>');
  // La interfaz no inserta HTML sin escapar (las vistas están organizadas en subcarpetas)
  const vistas = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e =>
    e.isDirectory() ? vistas(path.join(dir, e.name)) : e.name.endsWith('.vue') ? [path.join(dir, e.name)] : []))).flat();
  const archivos = [
    ...await vistas(path.join(root, 'frontend/src/views')),
    ...await vistas(path.join(root, 'frontend/src/components')),
    ...await vistas(path.join(root, 'frontend/src/layouts'))
  ];
  assert.ok(archivos.length > 0);
  for (const file of archivos) {
    assert.doesNotMatch(await readFile(file, 'utf8'), /v-html/, file);
  }
});

test.todo('CP-19: bloqueo tras 5 intentos y MFA del administrador (no implementado, ER-05)');
test.todo('CP-20: escrituras simultáneas con control de versión 409 (no implementado, ER-06)');

test('CP-22: un fallo de envío se reintenta y el cliente recibe un solo aviso', async () => {
  await db.query(
    "UPDATE notificacion SET estado='enviado' WHERE canal='WHATSAPP' AND estado='pendiente'",
  );
  const payment = await pay((await newOrder(1)).p);
  const evento = `pago-${payment.id_pago}-cliente`;
  channel.failures = 1;
  await call('/notifications/0/dispatch', 'POST', {});
  await db.query('UPDATE notificacion SET proximo_intento=now() WHERE evento=$1', [evento]);
  await call('/notifications/0/dispatch', 'POST', {});
  await call('/notifications/0/dispatch', 'POST', {});
  const row = (await db.query('SELECT * FROM notificacion WHERE evento=$1', [evento])).rows[0];
  assert.equal(row.estado, 'enviado');
  assert.equal(row.intentos, 2);
  assert.equal(channel.sent.filter((n) => n.evento === evento).length, 1);
});

test('CP-23: el respaldo se restaura y los saldos coinciden', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const saldos =
    'SELECT categoria, SUM(saldo)::INT n FROM v_inventario_clasificado GROUP BY categoria ORDER BY categoria';
  const restored = await PGlite.create({ loadDataDir: await db.dumpDataDir('gzip') });
  assert.deepEqual((await restored.query(saldos)).rows, (await db.query(saldos)).rows);
  await restored.close();
});

test('CP-25: si WhatsApp falla, el pedido queda en su estado y el error se informa', async () => {
  const { p } = await newOrder(1);
  await pay(p);
  const estado = (await call(`/orders/${p.id_pedido}`)).nombre_estado;
  channel.failures = 1000;
  await call('/notifications/0/dispatch', 'POST', {});
  channel.failures = 0;
  assert.equal((await call(`/orders/${p.id_pedido}`)).nombre_estado, estado);
  const shown = (await call('/state')).notificaciones.find((n) => n.pedido_id === p.id_pedido);
  assert.equal(shown.ultimo_error, 'Servicio no disponible');
  assert.equal(shown.estado, 'pendiente');
});

test('CP-27: entrega parcial por rotura deja continuidad por 1 con el mismo pago', async () => {
  await planningTurn();
  const { p } = await newOrder(3);
  await pay(p);
  await startRoute();
  const stop = await stopFor(p.id_pedido);
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    {
      entregados: 2,
      rotos: 1,
      vacios: 2,
      aceptacion_parcial: true,
      detalle: 'Bidón fisurado',
      evento: randomUUID(),
    },
    'chofer',
  );
  await finishRoute();
  await planningTurn();
  const remainder = (await call('/state')).paradas.find((s) => s.pedido_id === p.id_pedido);
  assert.equal(remainder.cantidad, 1);
  assert.equal(
    Number(
      await value(
        "SELECT COUNT(*)::INT n FROM pago WHERE id_pedido=$1 AND codigo_estado='CONFIRMADO'",
        [p.id_pedido],
      ),
    ),
    1,
  );
  assert.equal(
    Number(await value('SELECT SUM(monto) n FROM pago WHERE id_pedido=$1', [p.id_pedido])),
    10500,
  );
});

test('CP-28: cliente ausente queda pendiente de entrega y se reprograma', async () => {
  await planningTurn();
  const { p } = await newOrder(2);
  await pay(p);
  await startRoute();
  const stop = await stopFor(p.id_pedido);
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    { ausente: true, evento: randomUUID() },
    'chofer',
  );
  assert.equal((await call(`/orders/${p.id_pedido}`)).nombre_estado, 'Ausente');
  assert.equal(
    Number(await value('SELECT entregados n FROM pedido WHERE id_pedido=$1', [p.id_pedido])),
    0,
  );
  assert.equal(
    Number(
      await value('SELECT COUNT(*)::INT n FROM retorno_pendiente WHERE pedido_id=$1', [
        p.id_pedido,
      ]),
    ),
    0,
  );
  await finishRoute();
  await planningTurn();
  assert.equal((await call('/state')).paradas.find((s) => s.pedido_id === p.id_pedido).cantidad, 2);
});

test('CP-24: con 500 pedidos el panel responde en menos de 2 s', async () => {
  const { c, d } = await newClient();
  await db.query(
    `INSERT INTO pedido(id_cliente,id_direccion_entrega,id_estado_actual,cantidad,tipo_producto,autorizacion)
     SELECT $1,$2,(SELECT id_estado FROM estado_pedido WHERE nombre_estado='Pendiente'),1,'Bidón de agua purificada 20L','LIBRE'
     FROM generate_series(1,500)`,
    [c.id_cliente, d.id_direccion],
  );
  const start = performance.now();
  const state = await call('/state');
  const ms = performance.now() - start;
  assert.ok(state.pedidos.length >= 500);
  assert.ok(ms < 2000, `El panel tardó ${Math.round(ms)} ms`);
});
