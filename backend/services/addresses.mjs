import { fail, permit } from '../shared/errors.mjs';
import { integer, text } from '../shared/validation.mjs';
import { one } from '../shared/database.mjs';
import { audit } from '../shared/audit.mjs';

export async function handleAddresses(db, user, method, id, action, body) {
  permit(user, 'administrador', 'administrativo');
  const cid = integer(body.id_cliente, 'Cliente');
  await one(db, 'SELECT id_cliente FROM cliente WHERE id_cliente=$1', [cid]);

  const coordinate = (value, min, max) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const n = Number(value);
    fail(!Number.isFinite(n) || n < min || n > max, 'Coordenadas inválidas');
    return n;
  };

  const params = [
    cid,
    text(body.calle, 'Calle'),
    String(body.numero ?? '').trim(),
    text(body.comuna, 'Comuna', 80),
    text(body.ciudad ?? 'Santiago', 'Ciudad', 80),
    text(body.etiqueta ?? 'Domicilio', 'Etiqueta', 30),
    coordinate(body.latitud, -90, 90),
    coordinate(body.longitud, -180, 180),
  ];

  if (method === 'PATCH') {
    const address = await one(db, 'SELECT * FROM direccion WHERE id_direccion=$1', [id]);
    fail(address.id_cliente !== cid, 'No se puede cambiar el propietario de una dirección', 409);
  }

  const result =
    method === 'POST'
      ? await one(
          db,
          'INSERT INTO direccion(id_cliente,calle,numero,comuna,ciudad,etiqueta,latitud,longitud) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
          params,
        )
      : await one(
          db,
          'UPDATE direccion SET calle=$2,numero=$3,comuna=$4,ciudad=$5,etiqueta=$6,latitud=$7,longitud=$8 WHERE id_direccion=$9 AND id_cliente=$1 RETURNING *',
          [...params, id],
        );

  await audit(db, user, 'Guardar dirección', result.id_direccion);
  return result;
}
