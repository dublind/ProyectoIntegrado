import { rows } from '../shared/database.mjs';
import { listOrders } from './orders.mjs';
import { ageReturns } from './returns.mjs';

async function listStops(db, turnId) {
  return rows(
    db,
    `SELECT pa.*, c.nombre, c.telefono, d.calle, d.numero, d.comuna,
            d.latitud, d.longitud, p.id_cliente, p.tipo_producto, p.autorizacion,
            (
              SELECT COALESCE(SUM(r.cantidad), 0)
              FROM retorno_pendiente r
              WHERE r.cliente_id = p.id_cliente
                AND r.estado IN ('pendiente', 'no_retornaron')
            ) AS retiro_pendiente
     FROM parada pa
     JOIN pedido p ON p.id_pedido = pa.pedido_id
     JOIN cliente c ON c.id_cliente = p.id_cliente
     JOIN direccion d ON d.id_direccion = p.id_direccion_entrega
     WHERE pa.turno_id = $1
     ORDER BY d.latitud NULLS LAST, d.longitud NULLS LAST, pa.id`,
    [turnId],
  );
}

export async function getState(db, user) {
  await ageReturns(db);

  const isDriver = user.rol === 'chofer';
  const isAdministrative = user.rol === 'administrativo';
  const activeTurn =
    (await rows(db, "SELECT * FROM turno WHERE estado <> 'finalizado'"))[0] ?? null;
  const turn = isDriver && activeTurn?.chofer !== user.username ? null : activeTurn;
  const stops = turn ? await listStops(db, turn.id) : [];
  const pendingReturns = await rows(
    db,
    `SELECT r.*, c.nombre, EXTRACT(DAY FROM now() - r.fecha)::INTEGER AS dias
     FROM retorno_pendiente r
     JOIN cliente c ON c.id_cliente = r.cliente_id
     WHERE r.estado IN ('pendiente', 'no_retornaron')
     ORDER BY r.fecha`,
  );

  // El chofer solo necesita su ruta; evitar cargar el panel administrativo.
  if (isDriver) {
    const routeClients = new Set(stops.map((stop) => stop.id_cliente));
    return {
      user,
      clientes: [],
      direcciones: [],
      pedidos: [],
      pagos: [],
      inventario: [],
      retornos: pendingReturns.filter((pendingReturn) =>
        routeClients.has(pendingReturn.cliente_id),
      ),
      vehiculos: [],
      turno: turn,
      paradas: stops,
      reportes: [],
      cuentas: [],
      auditoria: [],
      inconsistencias: [],
      avisos: [],
      notificaciones: [],
      solicitudes: [],
      modo: 'local',
    };
  }

  // Incluir la nota privada en la misma consulta y solo para el administrativo.
  const clients = await rows(
    db,
    `SELECT id_cliente, rut, nombre, telefono, email, activo
            ${isAdministrative ? ', nota_no_retornados' : ''}
     FROM cliente
     ORDER BY id_cliente`,
  );
  const orders = await listOrders(db);
  if (!isAdministrative) {
    for (const currentOrder of orders) {
      delete currentOrder.observacion_autorizacion;
    }
  }

  return {
    user,
    clientes: clients,
    direcciones: await rows(db, 'SELECT * FROM direccion ORDER BY id_direccion'),
    pedidos: orders,
    pagos: await rows(db, 'SELECT * FROM v_pago_detalle ORDER BY id_pago DESC'),
    inventario: await rows(
      db,
      `SELECT categoria, SUM(saldo)::INTEGER AS cantidad
       FROM v_inventario_clasificado
       WHERE tipo_ubicacion <> $1
       GROUP BY categoria`,
      ['CLIENTE'],
    ),
    retornos: pendingReturns,
    vehiculos: await rows(db, 'SELECT * FROM vehiculo ORDER BY id'),
    turno: turn,
    paradas: stops,
    reportes: await rows(db, 'SELECT * FROM reporte_rotura ORDER BY id DESC'),
    cuentas: await rows(db, 'SELECT * FROM cuenta_bancaria ORDER BY id'),
    auditoria: await rows(db, 'SELECT * FROM auditoria ORDER BY id DESC LIMIT 100'),
    inconsistencias: await rows(db, 'SELECT * FROM v_inconsistencias'),
    // Avisos internos activos para el perfil (el administrador también ve los del administrativo)
    avisos: await rows(
      db,
      `SELECT id, tipo, mensaje, pedido_id, cliente_id, creado, destino
       FROM notificacion
       WHERE canal='INTERNO' AND estado <> 'leido' AND destino = ANY($1)
       ORDER BY creado DESC, id DESC LIMIT 50`,
      [isAdministrative ? ['administrativo'] : ['administrativo', 'administrador']],
    ),
    notificaciones: await rows(
      db,
      `SELECT id, tipo, destino, pedido_id, mensaje, estado, intentos, ultimo_error, creado, enviado
       FROM notificacion WHERE canal='WHATSAPP' ORDER BY id DESC LIMIT 50`,
    ),
    solicitudes: await rows(
      db,
      "SELECT * FROM solicitud_whatsapp WHERE estado='nueva' ORDER BY recibido, id",
    ),
    modo: 'local',
  };
}
