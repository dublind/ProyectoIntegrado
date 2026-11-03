import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../db.mjs';
import { createServer } from '../server.mjs';
let db, server, base;
const cookies = {};
before(async () => {
  db = await openDatabase({ memory: true, password: 'Prueba-local-2026' });
  server = createServer(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const name of ['ignacio', 'administrativo', 'chofer']) {
    const res = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: name, password: 'Prueba-local-2026' }),
    });
    assert.equal(res.status, 200);
    cookies[name] = res.headers.get('set-cookie').split(';')[0];
    assert.match(res.headers.get('set-cookie'), /HttpOnly/);
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
async function newClient() {
  const c = await call('/clients', 'POST', {
    nombre: 'Cliente prueba ' + randomUUID(),
    telefono: '569' + String(Math.floor(Math.random() * 90000000) + 10000000),
  });
  const d = await call('/addresses', 'POST', {
    id_cliente: c.id_cliente,
    calle: 'Calle de prueba',
    numero: '123',
    comuna: 'Santiago',
    latitud: -33.4,
    longitud: -70.6,
  });
  return { c, d };
}
async function newOrder(quantity = 2) {
  const { c, d } = await newClient();
  const p = await call('/orders', 'POST', {
    id_cliente: c.id_cliente,
    id_direccion: d.id_direccion,
    cantidad: quantity,
  });
  return { c, d, p };
}
async function pay(p) {
  const b = {
    id_pedido: p.id_pedido,
    medio: 'TRANSFERENCIA',
    monto: p.cantidad * Number(p.precio_unitario),
    comprobante: 'TEST-' + randomUUID(),
    evento: randomUUID(),
  };
  const payment = await call('/payments', 'POST', b);
  await call(`/payments/${payment.id_pago}/validate`, 'POST', { estado: 'CONFIRMADO' });
  return { payment, b };
}
test('PBI 50/51/52: ejecutar el SQL original de Agustín conserva claves, pago y saldos de ejemplo', async () => {
  const tables = (
    await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
  ).rows.map((r) => r.table_name);
  for (const name of [
    'cliente',
    'direccion',
    'pedido',
    'historial_estado_pedido',
    'pago',
    'operador',
    'movimiento_inventario',
  ])
    assert.ok(tables.includes(name));
  const inventory = (
    await db.query(
      'SELECT categoria,SUM(saldo)::INT n FROM v_inventario_clasificado GROUP BY categoria',
    )
  ).rows;
  assert.equal(inventory.find((r) => r.categoria === 'LLENO').n, 80);
  assert.equal(inventory.find((r) => r.categoria === 'VACIO').n, 14);
  assert.equal(inventory.find((r) => r.categoria === 'ROTO').n, 1);
  assert.equal((await db.query('SELECT * FROM v_inconsistencias')).rows.length, 0);
  await assert.rejects(
    db.query(
      "INSERT INTO pago(id_pedido,id_medio_pago,monto,codigo_estado) VALUES (2,1,1000,'CONFIRMADO')",
    ),
    /ck_pago_coherencia_estado/,
  );
  await assert.rejects(
    db.query(
      "INSERT INTO movimiento_inventario(codigo_tipo_movimiento,id_producto,cantidad,id_ubicacion_origen,condicion_origen,id_ubicacion_destino,condicion_destino) VALUES ('DESPACHO',1,-1,2,'LLENO',3,'LLENO')",
    ),
    /ck_mov_cantidad_positiva/,
  );
});
test('PBI 55: autenticación real y restricciones en API, independientemente de la interfaz', async () => {
  const r = await fetch(base + '/state');
  assert.equal(r.status, 401);
  await call(
    '/auth/login',
    'POST',
    { username: 'ignacio', password: 'incorrecta' },
    'ignacio',
    401,
  );
  await call(
    '/clients',
    'POST',
    { nombre: 'No permitido', telefono: '56911112222' },
    'chofer',
    403,
  );
  await call('/inventory/0/writeoff', 'POST', { cantidad: 1 }, 'administrativo', 403);
  const driver = await call('/state', 'GET', undefined, 'chofer');
  assert.deepEqual(driver.pagos, []);
  assert.deepEqual(driver.inventario, []);
  assert.deepEqual(driver.cuentas, []);
});
test('PBI 56: alta, consulta, actualización, varias direcciones y duplicados evidentes', async () => {
  const { c, d } = await newClient();
  const updated = await call('/clients/' + c.id_cliente, 'PATCH', {
    nombre: 'Cliente editado',
    telefono: c.telefono,
    email: 'prueba@example.test',
  });
  assert.equal(updated.nombre, 'Cliente editado');
  const other = await call('/addresses', 'POST', {
    id_cliente: c.id_cliente,
    calle: 'Otra calle',
    numero: '456',
    comuna: 'Providencia',
  });
  assert.notEqual(other.id_direccion, d.id_direccion);
  await call(
    '/clients',
    'POST',
    { nombre: 'Duplicado', telefono: c.telefono },
    'administrativo',
    409,
  );
  const found = await call('/clients?q=Cliente%20editado');
  assert.equal(found.length, 1);
  const foreign = await newClient();
  await call(
    '/orders',
    'POST',
    { id_cliente: c.id_cliente, id_direccion: foreign.d.id_direccion, cantidad: 2 },
    'administrativo',
    400,
  );
  await call(
    '/addresses/' + d.id_direccion,
    'PATCH',
    { id_cliente: foreign.c.id_cliente, calle: 'Otra', comuna: 'Santiago' },
    'administrativo',
    409,
  );
});
test('Pago confirmado es idempotente, deja autor y rota cuenta exactamente al comprobante 45', async () => {
  const { p } = await newOrder();
  await db.query('UPDATE cuenta_bancaria SET comprobantes=44 WHERE activa');
  const { payment, b } = await pay(p);
  const again = await call('/payments', 'POST', b);
  assert.equal(again.id_pago, payment.id_pago);
  await call(`/payments/${payment.id_pago}/validate`, 'POST', { estado: 'CONFIRMADO' });
  const counters = (await db.query('SELECT * FROM cuenta_bancaria ORDER BY id')).rows;
  assert.equal(counters[0].comprobantes, 45);
  assert.equal(counters[1].activa, true);
  assert.equal(counters[1].comprobantes, 0);
  const row = (await db.query('SELECT * FROM v_pago_detalle WHERE id_pago=$1', [payment.id_pago]))
    .rows[0];
  assert.equal(row.validado_por, 'administrativo');
  assert.ok(row.fecha_validacion);
  assert.equal(
    (await db.query('SELECT COUNT(*)::INT n FROM parada WHERE pedido_id=$1', [p.id_pedido])).rows[0]
      .n,
    1,
  );
});
test('No retornados: autorización sin retorno no agrega stock y nota interna queda restringida', async () => {
  const { c, d } = await newClient();
  await db.query(
    "INSERT INTO retorno_pendiente(cliente_id,cantidad,fecha,evento,responsable) VALUES ($1,1,now()-interval '61 days',$2,'chofer')",
    [c.id_cliente, randomUUID()],
  );
  const before = await call('/state');
  const r = before.retornos.find((r) => r.cliente_id === c.id_cliente);
  assert.equal(r.estado, 'no_retornaron');
  await call(
    `/returns/${r.id}/writeoff`,
    'POST',
    { evidencia: 'Revisión de incidencia no recuperada' },
    'administrativo',
    403,
  );
  await call(
    `/returns/${r.id}/writeoff`,
    'POST',
    { evidencia: 'Revisión del registro y coordinación agotada' },
    'ignacio',
  );
  const p = await call('/orders', 'POST', {
    id_cliente: c.id_cliente,
    id_direccion: d.id_direccion,
    cantidad: 1,
  });
  assert.equal(p.autorizacion, 'PENDIENTE');
  const inventory = JSON.stringify((await call('/state')).inventario);
  await call(`/orders/${p.id_pedido}/authorize`, 'POST', {
    decision: 'SIN_RETORNO',
    motivo: 'Coordinado por WhatsApp; excepción autorizada',
  });
  assert.equal(JSON.stringify((await call('/state')).inventario), inventory);
  assert.ok(
    (await call('/state')).clientes.find((c2) => c2.id_cliente === c.id_cliente).nota_no_retornados,
  );
  assert.equal(
    (await call('/state', 'GET', undefined, 'ignacio')).clientes.find(
      (c2) => c2.id_cliente === c.id_cliente,
    ).nota_no_retornados,
    undefined,
  );
});
test('Vehículo opcional en planificación, capacidad y stock bloquean salida indebida', async () => {
  await call('/turns/1/vehicle', 'POST', { vehiculo_id: null });
  await call('/turns/1/start', 'POST', {}, 'administrativo', 409);
  const tiny = await call('/vehicles', 'POST', {
    patente: 'TEST-01',
    modelo: 'Pequeño',
    capacidad: 1,
  });
  await call('/turns/1/vehicle', 'POST', { vehiculo_id: tiny.id }, 'administrativo', 409);
  await call('/turns/1/vehicle', 'POST', { vehiculo_id: 1 });
  const { p } = await newOrder(1000);
  await pay(p);
  assert.equal(
    (await db.query('SELECT COUNT(*)::INT n FROM parada WHERE pedido_id=$1', [p.id_pedido])).rows[0]
      .n,
    0,
  );
});
test('Entrega parcial, roto y vacío pendiente: saldo original, stock físico, permisos y próxima visita', async () => {
  const { p } = await newOrder(2);
  await pay(p);
  await call('/turns/1/start', 'POST', {});
  let state = await call('/state');
  const stop = state.paradas.find((s) => s.pedido_id === p.id_pedido);
  assert.ok(stop);
  const body = { entregados: 1, rotos: 1, vacios: 0, evento: randomUUID() };
  await call(`/stops/${stop.id}/deliver`, 'POST', body, 'chofer', 400);
  body.aceptacion_parcial = true;
  await call(`/stops/${stop.id}/deliver`, 'POST', body, 'chofer');
  await call(`/stops/${stop.id}/deliver`, 'POST', body, 'chofer');
  state = await call('/state');
  const pend = state.retornos.find((r) => r.pedido_id === p.id_pedido);
  assert.equal(pend.cantidad, 1);
  const report = state.reportes.find((r) => r.pedido_id === p.id_pedido);
  assert.ok(report);
  const beforePhysical = state.inventario.reduce((n, r) => n + r.cantidad, 0);
  await call(`/inventory/${report.id}/classify`, 'POST', {}, 'administrativo');
  state = await call('/state');
  assert.equal(
    state.inventario.reduce((n, r) => n + r.cantidad, 0),
    beforePhysical,
  );
  await call(
    '/inventory/0/writeoff',
    'POST',
    {
      cantidad: 1,
      origen: 'ROTOS',
      revisado: true,
      eliminado: true,
      motivo: 'Inspeccionado y eliminado físicamente',
      evento: randomUUID(),
    },
    'ignacio',
  );
  assert.equal(
    (await call('/state')).inventario.reduce((n, r) => n + r.cantidad, 0),
    beforePhysical - 1,
  );
  for (const s of state.paradas.filter((s) => s.id !== stop.id))
    await call(`/stops/${s.id}/deliver`, 'POST', { ausente: true, evento: randomUUID() }, 'chofer');
  await call('/turns/1/close', 'POST', {});
  const next = await call('/turns', 'POST', {
    fecha: '2026-10-15',
    nombre: 'Mañana',
    chofer: 'chofer',
    vehiculo_id: 1,
  });
  state = await call('/state');
  const remainder = state.paradas.find((s) => s.pedido_id === p.id_pedido);
  assert.equal(remainder.cantidad, 1);
  assert.equal(Number(remainder.retiro_pendiente), 1);
  await call(`/turns/${next.id}/start`, 'POST', {});
  await call(`/returns/${pend.id}/collect`, 'POST', {}, 'chofer');
  assert.ok(!(await call('/state')).retornos.some((r) => r.id === pend.id));
  const original = (
    await db.query('SELECT SUM(monto) n FROM pago WHERE id_pedido=$1 AND codigo_estado=$2', [
      p.id_pedido,
      'CONFIRMADO',
    ])
  ).rows[0];
  assert.equal(Number(original.n), 7000);
});
test('Acciones de otro sitio se rechazan y cerrar sesión invalida su cookie', async () => {
  const cross = await fetch(base + '/clients', {
    method: 'POST',
    headers: {
      Cookie: cookies.administrativo,
      Origin: 'https://example.invalid',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal(cross.status, 403);
  await call('/auth/logout', 'POST', {}, 'chofer');
  await call('/state', 'GET', undefined, 'chofer', 401);
});
test('Respaldo de PostgreSQL se restaura conservando modelo, clientes y movimientos', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const before = (await db.query('SELECT COUNT(*)::INT n FROM movimiento_inventario')).rows[0].n;
  const dump = await db.dumpDataDir('gzip');
  const restored = await PGlite.create({ loadDataDir: dump });
  assert.equal(
    (await restored.query('SELECT COUNT(*)::INT n FROM movimiento_inventario')).rows[0].n,
    before,
  );
  assert.equal(
    (await restored.query('SELECT COUNT(*)::INT n FROM cliente')).rows[0].n,
    (await db.query('SELECT COUNT(*)::INT n FROM cliente')).rows[0].n,
  );
  await assert.rejects(
    restored.query('UPDATE movimiento_inventario SET cantidad=1 WHERE id_movimiento=1'),
    /inmutable/,
  );
  await restored.close();
});
