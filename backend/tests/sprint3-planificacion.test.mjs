// PBI 102 y PBI 70: planificación por furgón y día con varios turnos abiertos a la vez.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../db.mjs';
import { createServer } from '../server.mjs';

let db, server, base, baseline;
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
    cookies[name] = res.headers.get('set-cookie').split(';')[0];
  }
  // Stock suficiente para varias rutas
  await call(
    '/inventory/0/initial',
    'POST',
    { cantidad: 200, motivo: 'Stock de prueba', evento: randomUUID() },
    'ignacio',
  );
  // Inconsistencias históricas de la semilla: las pruebas solo verifican que no aparezcan nuevas
  baseline = (await call('/state')).inconsistencias.length;
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
const value = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.n;
const phone = () => '569' + String(Math.floor(Math.random() * 90000000) + 10000000);

// Fechas futuras propias de este archivo para no chocar con el turno sembrado de hoy
let dayOffset = 10;
const nextDay = async () => value(`SELECT (CURRENT_DATE + ${dayOffset++})::TEXT AS n`);

async function newClient(comuna = 'Ñuñoa') {
  const c = await call('/clients', 'POST', {
    nombre: 'Cliente ' + randomUUID().slice(0, 8),
    telefono: phone(),
  });
  const d = await call('/addresses', 'POST', {
    id_cliente: c.id_cliente,
    calle: 'Av. Prueba ' + randomUUID().slice(0, 4),
    numero: '100',
    comuna,
    latitud: -33.45,
    longitud: -70.6,
  });
  return { c, d };
}
async function newOrder(cantidad = 2, client) {
  const { c, d } = client ?? (await newClient());
  const p = await call('/orders', 'POST', {
    id_cliente: c.id_cliente,
    id_direccion: d.id_direccion,
    cantidad,
  });
  return { c, d, p };
}
async function pay(p, monto = p.cantidad * Number(p.precio_unitario) + Number(p.recargo ?? 0)) {
  const payment = await call('/payments', 'POST', {
    id_pedido: p.id_pedido,
    medio: 'TRANSFERENCIA',
    monto,
    comprobante: 'COMP-' + randomUUID().slice(0, 8),
    evento: randomUUID(),
  });
  await call(`/payments/${payment.id_pago}/validate`, 'POST', { estado: 'CONFIRMADO' });
}
async function vehicle(capacidad = 20) {
  return call('/vehicles', 'POST', {
    patente: 'PL-' + randomUUID().slice(0, 6),
    modelo: 'Furgón de prueba',
    capacidad,
  });
}
const stateOf = (username = 'administrativo') => call('/state', 'GET', undefined, username);
const turnOf = async (vehiculoId, fecha) =>
  (await stateOf()).turnos.find((t) => t.vehiculo_id === vehiculoId && t.fecha.startsWith?.(fecha));
const stopOf = async (orderId, username = 'chofer') =>
  (await stateOf(username)).paradasTurnos.find(
    (s) => s.pedido_id === orderId && s.estado === 'en_ruta',
  );

test('Varios furgones el mismo día: cupo, un domicilio por día, mover y quitar pedidos', async () => {
  const fecha = await nextDay();
  const a = await vehicle(20);
  const b = await vehicle(3);
  const o1 = await newOrder(2);
  const o2 = await newOrder(2);
  await pay(o1.p);
  await pay(o2.p);

  const r1 = await call(`/orders/${o1.p.id_pedido}/plan`, 'POST', { vehiculo_id: a.id, fecha });
  const r2 = await call(`/orders/${o2.p.id_pedido}/plan`, 'POST', { vehiculo_id: b.id, fecha });
  assert.notEqual(r1.turno, r2.turno, 'cada furgón tiene su propio turno ese día');
  const turns = (await stateOf()).turnos.filter((t) => [r1.turno, r2.turno].includes(t.id));
  assert.equal(turns.length, 2);
  assert.ok(turns.every((t) => t.estado === 'preparacion'));

  // Mismo cliente en otro furgón el mismo día: rechazado
  const sameClient = await newOrder(1, o1);
  await pay(sameClient.p);
  const conflict = await call(
    `/orders/${sameClient.p.id_pedido}/plan`,
    'POST',
    { vehiculo_id: b.id, fecha },
    'administrativo',
    409,
  );
  assert.match(conflict.error, /mismo furgón/);
  await call(`/orders/${sameClient.p.id_pedido}/plan`, 'POST', { vehiculo_id: a.id, fecha });

  // Capacidad diaria del furgón B (3): ya lleva 2
  const big = await newOrder(2);
  await pay(big.p);
  const full = await call(
    `/orders/${big.p.id_pedido}/plan`,
    'POST',
    { vehiculo_id: b.id, fecha },
    'administrativo',
    409,
  );
  assert.match(full.error, /no caben/);

  // La capacidad no puede bajar de lo planificado
  await call(
    `/vehicles/${b.id}`,
    'PATCH',
    { patente: b.patente, modelo: b.modelo, capacidad: 1 },
    'administrativo',
    409,
  );

  // Sin pagar no se planifica
  const unpaid = await newOrder(1);
  await call(
    `/orders/${unpaid.p.id_pedido}/plan`,
    'POST',
    { vehiculo_id: a.id, fecha },
    'administrativo',
    409,
  );

  // Mover o2 al furgón A deja vacío el turno de B, que se elimina
  await call(`/orders/${o2.p.id_pedido}/plan`, 'POST', { vehiculo_id: a.id, fecha });
  assert.equal(await value('SELECT COUNT(*)::INT n FROM turno WHERE id=$1', [r2.turno]), 0);
  await call(`/orders/${o2.p.id_pedido}/unplan`, 'POST', {});
  assert.equal(
    await value('SELECT COUNT(*)::INT n FROM parada WHERE pedido_id=$1', [o2.p.id_pedido]),
    0,
  );
});

test('Orden de visita guardado (PBI 70): se respeta en la ruta y se invalida al cambiar paradas', async () => {
  const fecha = await nextDay();
  const v = await vehicle(20);
  const orders = [];
  for (let i = 0; i < 3; i++) {
    const o = await newOrder(1);
    await pay(o.p);
    await call(`/orders/${o.p.id_pedido}/plan`, 'POST', { vehiculo_id: v.id, fecha });
    orders.push(o.p.id_pedido);
  }
  const turn = await turnOf(v.id, fecha);
  // Orden con paradas que no son del turno: 409 para recalcular
  await call(
    `/turns/${turn.id}/route`,
    'POST',
    { orden: orders.slice(0, 2) },
    'administrativo',
    409,
  );
  const manual = [orders[2], orders[0], orders[1]];
  await call(`/turns/${turn.id}/route`, 'POST', {
    orden: manual,
    km: 12.5,
    minutos: 40,
    fuente: 'manual',
  });
  const state = await stateOf();
  const stops = state.paradasTurnos.filter((s) => s.turno_id === turn.id);
  assert.deepEqual(
    stops.map((s) => s.pedido_id),
    manual,
  );
  assert.equal(Number(state.turnos.find((t) => t.id === turn.id).ruta_km), 12.5);

  // Un pedido nuevo en el turno borra el orden guardado
  const extra = await newOrder(1);
  await pay(extra.p);
  await call(`/orders/${extra.p.id_pedido}/plan`, 'POST', { vehiculo_id: v.id, fecha });
  const after = (await stateOf()).turnos.find((t) => t.id === turn.id);
  assert.equal(after.ruta_km, null);

  // El chofer del turno puede iniciarlo desde su app; otro perfil sin permiso no
  await call(`/turns/${turn.id}/start`, 'POST', {}, 'chofer');
  await call(`/turns/${turn.id}/route`, 'POST', { orden: [] }, 'administrativo', 409);
  // Otro chofer no opera esta ruta; se cierra entregando todo
  for (const id of [...orders, extra.p.id_pedido]) {
    const stop = await stopOf(id);
    await call(
      `/stops/${stop.id}/deliver`,
      'POST',
      { entregados: 1, vacios: 1, evento: randomUUID() },
      'chofer',
    );
  }
  await call(`/turns/${turn.id}/close`, 'POST', {}, 'chofer');
});

test('Dos rutas abiertas: cada cierre descarga solo su furgón', async () => {
  const fecha = await nextDay();
  const a = await vehicle(20);
  const b = await vehicle(20);
  const oa = await newOrder(3);
  const ob = await newOrder(4);
  await pay(oa.p);
  await pay(ob.p);
  const { turno: ta } = await call(`/orders/${oa.p.id_pedido}/plan`, 'POST', {
    vehiculo_id: a.id,
    fecha,
  });
  const { turno: tb } = await call(`/orders/${ob.p.id_pedido}/plan`, 'POST', {
    vehiculo_id: b.id,
    fecha,
  });
  await call(`/turns/${ta}/start`, 'POST', {}, 'chofer');
  await call(`/turns/${tb}/start`, 'POST', {}, 'chofer');

  const stop = await stopOf(oa.p.id_pedido);
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    { entregados: 3, vacios: 3, evento: randomUUID() },
    'chofer',
  );
  const before = (await stateOf()).turnos.find((t) => t.id === tb);
  assert.equal(before.llenos_a_bordo, 4);

  const closed = await call(`/turns/${ta}/close`, 'POST', {}, 'chofer');
  assert.equal(closed.vacios, 3);
  assert.equal(closed.llenos, 0);
  const state = await stateOf();
  assert.equal(state.stock.transitoLlenos, 4, 'el furgón B sigue con sus 4 llenos');
  assert.equal(state.turnos.find((t) => t.id === tb).estado, 'en_ruta');

  const stopB = await stopOf(ob.p.id_pedido);
  await call(
    `/stops/${stopB.id}/deliver`,
    'POST',
    { entregados: 4, vacios: 4, evento: randomUUID() },
    'chofer',
  );
  await call(`/turns/${tb}/close`, 'POST', {}, 'administrativo');
  assert.equal((await stateOf()).stock.transitoLlenos, 0);
  assert.equal((await stateOf()).inconsistencias.length, baseline);
});

test('Ausencia: volver otro día devuelve los llenos a bodega y el pedido queda por planificar', async () => {
  const fecha = await nextDay();
  const v = await vehicle(20);
  const o = await newOrder(2);
  await pay(o.p);
  const { turno } = await call(`/orders/${o.p.id_pedido}/plan`, 'POST', {
    vehiculo_id: v.id,
    fecha,
  });
  const fullBefore = (await stateOf()).stock.llenosBodega;
  await call(`/turns/${turno}/start`, 'POST', {}, 'chofer');
  const stop = await stopOf(o.p.id_pedido);
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    { ausente: true, evento: randomUUID() },
    'chofer',
  );
  await call(`/orders/${o.p.id_pedido}/retry`, 'POST', { cuando: 'manana' });
  const state = await stateOf();
  assert.equal(state.stock.llenosBodega, fullBefore);
  assert.equal(state.turnos.find((t) => t.id === turno).llenos_a_bordo, 0);
  assert.equal(state.paradasTurnos.find((s) => s.id === stop.id).estado, 'reprogramada');
  assert.equal(state.pedidos.find((p) => p.id_pedido === o.p.id_pedido).nombre_estado, 'Pagado');
  // Se planifica para otro día sin volver a cobrar
  await call(`/orders/${o.p.id_pedido}/plan`, 'POST', {
    vehiculo_id: v.id,
    fecha: await nextDay(),
  });
  await call(`/turns/${turno}/close`, 'POST', {}, 'chofer');
});

test('Retiro de envases sin pedido nuevo: se planifica, se recoge y resuelve los pendientes', async () => {
  const fecha = await nextDay();
  const v = await vehicle(20);
  const o = await newOrder(3);
  await pay(o.p);
  const { turno } = await call(`/orders/${o.p.id_pedido}/plan`, 'POST', {
    vehiculo_id: v.id,
    fecha,
  });
  await call(`/turns/${turno}/start`, 'POST', {}, 'chofer');
  let stop = await stopOf(o.p.id_pedido);
  // Entregó 3 y recibió 1: quedan 2 pendientes
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    { entregados: 3, vacios: 1, evento: randomUUID() },
    'chofer',
  );
  await call(`/turns/${turno}/close`, 'POST', {}, 'chofer');

  const retiro = await call('/orders/retrieval', 'POST', { id_cliente: o.c.id_cliente });
  assert.equal(retiro.tipo, 'retiro');
  assert.equal(retiro.cantidad, 2);
  await call('/orders/retrieval', 'POST', { id_cliente: o.c.id_cliente }, 'administrativo', 409);

  const day2 = await nextDay();
  const plan = await call(`/orders/${retiro.id_pedido}/plan`, 'POST', {
    vehiculo_id: v.id,
    fecha: day2,
  });
  const fullBefore = (await stateOf()).stock.llenosBodega;
  await call(`/turns/${plan.turno}/start`, 'POST', {}, 'chofer');
  assert.equal((await stateOf()).stock.llenosBodega, fullBefore, 'un retiro no carga llenos');
  stop = await stopOf(retiro.id_pedido);
  await call(`/stops/${stop.id}/deliver`, 'POST', { vacios: 2, evento: randomUUID() }, 'chofer');
  let state = await stateOf();
  assert.ok(!state.retornos.some((r) => r.cliente_id === o.c.id_cliente));
  assert.equal(
    state.pedidos.find((p) => p.id_pedido === retiro.id_pedido).nombre_estado,
    'Entregado',
  );
  const closed = await call(`/turns/${plan.turno}/close`, 'POST', {}, 'chofer');
  assert.equal(closed.vacios, 2);
  state = await stateOf();
  assert.equal(state.inconsistencias.length, baseline);
});

test('Vacíos de entregas anteriores en la misma visita y rotura con aviso a la oficina', async () => {
  const fecha = await nextDay();
  const v = await vehicle(20);
  const first = await newOrder(2);
  await pay(first.p);
  let plan = await call(`/orders/${first.p.id_pedido}/plan`, 'POST', { vehiculo_id: v.id, fecha });
  await call(`/turns/${plan.turno}/start`, 'POST', {}, 'chofer');
  let stop = await stopOf(first.p.id_pedido);
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    { entregados: 2, vacios: 0, evento: randomUUID() },
    'chofer',
  );
  await call(`/turns/${plan.turno}/close`, 'POST', {}, 'chofer');

  // Segundo pedido del mismo cliente: devuelve 2 del pedido y 2 de antes; un botellón llega roto
  const second = await newOrder(3, first);
  await pay(second.p);
  plan = await call(`/orders/${second.p.id_pedido}/plan`, 'POST', {
    vehiculo_id: v.id,
    fecha: await nextDay(),
  });
  await call(`/turns/${plan.turno}/start`, 'POST', {}, 'chofer');
  stop = await stopOf(second.p.id_pedido);
  await call(
    `/stops/${stop.id}/deliver`,
    'POST',
    {
      entregados: 2,
      rotos: 1,
      vacios: 2,
      retiros: 2,
      aceptacion_parcial: true,
      detalle: 'Fisurado en el traslado',
      evento: randomUUID(),
    },
    'chofer',
  );
  let state = await stateOf();
  assert.ok(!state.retornos.some((r) => r.cliente_id === first.c.id_cliente));
  assert.ok(state.avisos.some((a) => a.tipo === 'ROTURA' && a.pedido_id === second.p.id_pedido));
  assert.ok(
    state.notificaciones.some((n) => n.tipo === 'ROTURA' && n.pedido_id === second.p.id_pedido),
  );

  // El cierre espera la clasificación de la oficina
  const blocked = await call(`/turns/${plan.turno}/close`, 'POST', {}, 'chofer', 409);
  assert.match(blocked.error, /clasificar/);
  const report = state.reportes.find((r) => r.pedido_id === second.p.id_pedido);
  assert.equal(report.parada_id, stop.id);
  await call(`/inventory/${report.id}/classify`, 'POST', {});
  const closed = await call(`/turns/${plan.turno}/close`, 'POST', {}, 'chofer');
  assert.equal(closed.vacios, 4);
  state = await stateOf();
  assert.equal(state.reportes.find((r) => r.id === report.id).clasificado_por, 'administrativo');
  assert.equal(state.inconsistencias.length, baseline);
});

test('Recargo de delivery por comuna lo calcula el servidor y forma parte del monto a pagar', async () => {
  const client = await newClient('Maipú');
  const { p } = await newOrder(2, client);
  assert.equal(Number(p.recargo), 0, 'sin pedirlo, no hay recargo (compatibilidad)');
  const o = await call('/orders', 'POST', {
    id_cliente: client.c.id_cliente,
    id_direccion: client.d.id_direccion,
    cantidad: 2,
    con_recargo: true,
    medio_preferido: 'WEBPAY',
  });
  assert.equal(Number(o.recargo), 5000);
  // Pagar solo los bidones no alcanza para planificar
  await pay(o, 7000);
  const v = await vehicle(20);
  await call(
    `/orders/${o.id_pedido}/plan`,
    'POST',
    { vehiculo_id: v.id, fecha: await nextDay() },
    'administrativo',
    409,
  );
  await pay(o, 5000);
  await call(`/orders/${o.id_pedido}/plan`, 'POST', { vehiculo_id: v.id, fecha: await nextDay() });
});
