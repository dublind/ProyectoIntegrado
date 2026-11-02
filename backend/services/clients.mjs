import { fail, permit } from '../shared/errors.mjs';
import { text } from '../shared/validation.mjs';
import { one, rows } from '../shared/database.mjs';
import { audit } from '../shared/audit.mjs';

export async function handleClients(db, user, method, id, action, body) {
  permit(user, 'administrador', 'administrativo');

  if (method === 'GET') {
    if (id) {
      const client = await one(
        db,
        'SELECT id_cliente,rut,nombre,telefono,email,activo FROM cliente WHERE id_cliente=$1',
        [id],
      );
      client.direcciones = await rows(
        db,
        'SELECT * FROM direccion WHERE id_cliente=$1 AND activo',
        [id],
      );
      client.ultimo_pedido =
        (
          await rows(
            db,
            'SELECT * FROM pedido WHERE id_cliente=$1 ORDER BY fecha_creacion DESC,id_pedido DESC LIMIT 1',
            [id],
          )
        )[0] ?? null;
      return client;
    }
    return rows(
      db,
      'SELECT id_cliente,rut,nombre,telefono,email,activo FROM cliente WHERE ($1::TEXT IS NULL OR nombre ILIKE $1 OR telefono ILIKE $1) ORDER BY id_cliente',
      [body.q ? `%${String(body.q).slice(0, 100)}%` : null],
    );
  }

  const nombre = text(body.nombre, 'Nombre', 100);
  const telefono = text(body.telefono, 'Teléfono', 20).replace(/[\s()-]/g, '');
  fail(!/^\+?\d{8,15}$/.test(telefono), 'Teléfono inválido');

  const rut = body.rut ? String(body.rut).trim().toUpperCase().replace(/[.\s]/g, '') : null;
  const email = body.email ? String(body.email).trim().toLowerCase() : null;

  fail(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Email inválido');

  fail(
    (
      await rows(
        db,
        'SELECT 1 FROM cliente WHERE id_cliente<>$1 AND (telefono=$2 OR ($3::TEXT IS NOT NULL AND rut=$3))',
        [method === 'PATCH' ? id : 0, telefono, rut],
      )
    ).length,
    'Ya existe un cliente con ese teléfono o RUT',
    409,
  );

  const client =
    method === 'POST'
      ? await one(
          db,
          'INSERT INTO cliente(nombre,telefono,rut,email) VALUES ($1,$2,$3,$4) RETURNING *',
          [nombre, telefono, rut, email],
        )
      : await one(
          db,
          'UPDATE cliente SET nombre=$1,telefono=$2,rut=$3,email=$4 WHERE id_cliente=$5 RETURNING *',
          [nombre, telefono, rut, email, id],
        );

  await audit(db, user, 'Guardar cliente', client.id_cliente);
  return client;
}
