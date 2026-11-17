import { rows } from '../shared/database.mjs';
import { listOrders } from './orders.mjs';
import { ageReturns } from './returns.mjs';

// Turnos visibles: los abiertos y los de ayer en adelante (margen por la hora del servidor en UTC)
const TURNS_QUERY = `
  SELECT t.*, v.patente, v.modelo, v.capacidad,
         COALESCE(c.llenos, 0)::INT AS llenos_a_bordo,
         COALESCE(c.vacios, 0)::INT AS vacios_a_bordo
  FROM turno t
  LEFT JOIN vehiculo v ON v.id = t.vehiculo_id
  LEFT JOIN v_carga_turno c ON c.turno_id = t.id
  WHERE (t.estado <> 'finalizado' OR t.fecha >= CURRENT_DATE - 1)`;

// Paradas de varios turnos en una sola consulta, en el orden de visita guardado
// (o geográfico mientras no exista uno)
async function listStops(db, turnIds) {
  return rows(
    db,
    `SELECT pa.*, c.nombre, c.telefono, d.calle, d.numero, d.comuna,
            d.latitud, d.longitud, p.id_cliente, p.tipo_producto, p.autorizacion,
            p.tipo, p.cantidad AS cantidad_pedido, p.entregados AS entregados_pedido,
            p.fecha_creacion, p.precio_unitario, p.recargo, p.medio_preferido,
            p.id_direccion_entrega,
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
     WHERE pa.turno_id = ANY($1::INT[])
     ORDER BY pa.turno_id, pa.orden NULLS LAST, d.latitud NULLS LAST, d.longitud NULLS LAST, pa.id`,
    [turnIds],
  );
}

// Turno principal para los clientes del modelo de un solo turno: primero el que está en ruta
const mainTurn = (turns) =>
  turns.find((t) => t.estado === 'en_ruta') ?? turns.find((t) => t.estado !== 'finalizado') ?? null;

export async function getState(db, user) {
  await ageReturns(db);

  const isDriver = user.rol === 'chofer';
  const isAdministrative = user.rol === 'administrativo';
  // El chofer solo ve sus turnos
  const turns = await rows(
    db,
    `${TURNS_QUERY} ${isDriver ? 'AND t.chofer = $1' : ''} ORDER BY t.fecha, t.id`,
    isDriver ? [user.username] : [],
  );
  const allStops = await listStops(
    db,
    turns.map((t) => t.id),
  );
  const turn = mainTurn(turns);
  const stops = turn ? allStops.filter((stop) => stop.turno_id === turn.id) : [];
  const pendingReturns = await rows(
    db,
    `SELECT r.*, c.nombre, EXTRACT(DAY FROM now() - r.fecha)::INTEGER AS dias
     FROM retorno_pendiente r
     JOIN cliente c ON c.id_cliente = r.cliente_id
     WHERE r.estado IN ('pendiente', 'no_retornaron')
     ORDER BY r.fecha`,
  );
  const drivers = await rows(
    db,
    "SELECT username, nombre FROM usuario_local WHERE rol='chofer' AND activo ORDER BY id",
  );

  // El chofer solo necesita su ruta; evitar cargar el panel administrativo.
  if (isDriver) {
    const routeClients = new Set(allStops.map((stop) => stop.id_cliente));
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
      historialRetornos: [],
      vehiculos: [],
      choferes: drivers,
      turno: turn,
      paradas: stops,
      turnos: turns,
      paradasTurnos: allStops,
      stock: null,
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

  // Saldos por ubicación y condición: disponibles, en furgones, rotos y bajas por separado
  const balances = await rows(
    db,
    `SELECT u.codigo, s.condicion, SUM(s.saldo)::INTEGER AS saldo
     FROM v_saldo_inventario s JOIN ubicacion u USING (id_ubicacion)
     GROUP BY u.codigo, s.condicion`,
  );
  const balance = (codigo, condicion) =>
    balances
      .filter((b) => b.codigo === codigo && (!condicion || b.condicion === condicion))
      .reduce((n, b) => n + Number(b.saldo), 0);

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
    stock: {
      llenosBodega: balance('BODEGA', 'LLENO'),
      vaciosBodega: balance('BODEGA', 'VACIO'),
      rotosBodega: balance('BODEGA', 'ROTO') + balance('ROTOS', 'ROTO'),
      rotosEnBodegaDeRotos: balance('ROTOS', 'ROTO'),
      transitoLlenos: balance('TRANSITO', 'LLENO'),
      transitoVacios: balance('TRANSITO', 'VACIO'),
      bajas: balance('EXTERNO', 'ROTO'),
    },
    retornos: pendingReturns,
    historialRetornos: await rows(
      db,
      `SELECT r.*, c.nombre FROM retorno_pendiente r JOIN cliente c ON c.id_cliente = r.cliente_id
       WHERE r.estado IN ('retirado', 'baja')
       ORDER BY r.fecha_resolucion DESC NULLS LAST, r.id DESC LIMIT 200`,
    ),
    vehiculos: await rows(db, 'SELECT * FROM vehiculo ORDER BY id'),
    choferes: drivers,
    turno: turn,
    paradas: stops,
    turnos: turns,
    paradasTurnos: allStops,
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
