import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../db.mjs';
import { getState } from '../service.mjs';
import { getOrder } from '../services/orders.mjs';

let db;

before(async () => {
  db = await openDatabase({ memory: true, password: 'Prueba-local-2026' });
});

after(async () => {
  await db.close();
});

async function measuredState(user) {
  const queries = [];
  const state = await getState(
    {
      async query(sql, params) {
        queries.push(sql);
        return db.query(sql, params);
      },
    },
    user,
  );
  return { state, queries };
}

test('El panel mantiene una cantidad fija de consultas al crecer clientes y pedidos', async () => {
  const user = { username: 'administrativo', rol: 'administrativo' };
  const initial = await measuredState(user);

  await db.query(`
    INSERT INTO cliente(nombre, telefono)
    SELECT 'Cliente adicional ' || n, '5699000' || LPAD(n::TEXT, 4, '0')
    FROM generate_series(1, 12) AS n
  `);
  await db.query(`
    INSERT INTO pedido(id_cliente, id_direccion_entrega, id_estado_actual, cantidad, precio_unitario)
    SELECT p.id_cliente, p.id_direccion_entrega, p.id_estado_actual, p.cantidad, p.precio_unitario
    FROM (SELECT * FROM pedido ORDER BY id_pedido LIMIT 1) p
    CROSS JOIN generate_series(1, 12)
  `);

  const expanded = await measuredState(user);
  assert.equal(expanded.state.clientes.length, initial.state.clientes.length + 12);
  assert.equal(expanded.state.pedidos.length, initial.state.pedidos.length + 12);
  assert.equal(expanded.queries.length, initial.queries.length);

  for (const order of expanded.state.pedidos) {
    assert.deepEqual(order, await getOrder(db, order.id_pedido));
  }
});

test('El estado conserva la privacidad por perfil y el chofer solo consulta su ruta', async () => {
  await db.query("UPDATE cliente SET nota_no_retornados = 'Nota privada de prueba'");
  await db.query("UPDATE pedido SET observacion_autorizacion = 'Coordinación privada'");

  const administrative = await measuredState({ username: 'administrativo', rol: 'administrativo' });
  assert.ok(administrative.state.clientes.every((client) => client.nota_no_retornados));
  assert.ok(administrative.state.pedidos.every((order) => order.observacion_autorizacion));

  const administrator = await measuredState({ username: 'ignacio', rol: 'administrador' });
  assert.ok(administrator.state.clientes.every((client) => !('nota_no_retornados' in client)));
  assert.ok(administrator.state.pedidos.every((order) => !('observacion_autorizacion' in order)));

  const driver = await measuredState({ username: 'chofer', rol: 'chofer' });
  for (const field of [
    'clientes',
    'direcciones',
    'pedidos',
    'pagos',
    'inventario',
    'vehiculos',
    'reportes',
    'cuentas',
    'auditoria',
    'inconsistencias',
  ]) {
    assert.deepEqual(driver.state[field], []);
  }
  assert.ok(driver.queries.length < administrative.queries.length);
  assert.ok(driver.queries.every((sql) => !/FROM (pago|cuenta_bancaria|auditoria)\b/i.test(sql)));
  assert.ok(
    driver.state.retornos.every((pendingReturn) =>
      driver.state.paradas.some((stop) => stop.id_cliente === pendingReturn.cliente_id),
    ),
  );

  const otherDriver = await measuredState({ username: 'otro-chofer', rol: 'chofer' });
  assert.equal(otherDriver.state.turno, null);
  assert.deepEqual(otherDriver.state.paradas, []);
  assert.deepEqual(otherDriver.state.retornos, []);
});
