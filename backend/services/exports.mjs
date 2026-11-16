import { ApiError, fail, permit } from '../shared/errors.mjs';
import { rows } from '../shared/database.mjs';
import { audit } from '../shared/audit.mjs';

// PBI 75: exportación de pedidos y movimientos en CSV para planillas (Excel / Google Sheets).
// - BOM UTF-8 para que Excel muestre bien tildes y eñes.
// - Separador ';' (configuración regional de Chile, donde ',' es separador decimal).
// - Celdas que empiezan con = + - @ tab o retorno se anteponen con ' para evitar inyección de fórmulas.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function range(body) {
  const desde = body.desde ? String(body.desde) : null;
  const hasta = body.hasta ? String(body.hasta) : null;
  fail(desde && !DATE.test(desde), 'Fecha "desde" inválida (AAAA-MM-DD)');
  fail(hasta && !DATE.test(hasta), 'Fecha "hasta" inválida (AAAA-MM-DD)');
  fail(desde && hasta && desde > hasta, 'El rango de fechas está invertido');
  return { desde, hasta };
}

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(columns, data) {
  const lines = [columns.map(([, label]) => csvCell(label)).join(';')];
  for (const row of data) lines.push(columns.map(([key]) => csvCell(row[key])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const ORDER_COLUMNS = [
  ['id_pedido', 'Pedido'],
  ['fecha_creacion', 'Fecha de creación'],
  ['nombre_estado', 'Estado'],
  ['cliente', 'Cliente'],
  ['telefono', 'Teléfono'],
  ['direccion', 'Dirección'],
  ['comuna', 'Comuna'],
  ['tipo_producto', 'Producto'],
  ['cantidad', 'Cantidad'],
  ['entregados', 'Entregados'],
  ['precio_unitario', 'Precio unitario'],
  ['total', 'Total'],
  ['pagado', 'Pagado'],
  ['autorizacion', 'Autorización'],
  ['fecha_promesa', 'Fecha promesa'],
];

const MOVEMENT_COLUMNS = [
  ['id_movimiento', 'Movimiento'],
  ['fecha_hora', 'Fecha y hora'],
  ['tipo', 'Tipo'],
  ['cantidad', 'Cantidad'],
  ['origen', 'Origen'],
  ['condicion_origen', 'Condición origen'],
  ['destino', 'Destino'],
  ['condicion_destino', 'Condición destino'],
  ['id_pedido', 'Pedido'],
  ['responsable', 'Responsable'],
  ['observacion', 'Observación'],
];

export async function exportOrders(db, { desde, hasta }) {
  return rows(
    db,
    `SELECT p.id_pedido, p.fecha_creacion, e.nombre_estado, c.nombre AS cliente, c.telefono,
            d.calle || ' ' || d.numero AS direccion, d.comuna, p.tipo_producto, p.cantidad,
            p.entregados, p.precio_unitario, p.cantidad * p.precio_unitario AS total,
            COALESCE((SELECT SUM(monto) FROM pago
                      WHERE id_pedido = p.id_pedido AND codigo_estado = 'CONFIRMADO'), 0) AS pagado,
            p.autorizacion, p.fecha_promesa
     FROM pedido p
     JOIN estado_pedido e ON e.id_estado = p.id_estado_actual
     JOIN cliente c ON c.id_cliente = p.id_cliente
     JOIN direccion d ON d.id_direccion = p.id_direccion_entrega
     WHERE ($1::date IS NULL OR p.fecha_creacion >= $1::date)
       AND ($2::date IS NULL OR p.fecha_creacion < $2::date + 1)
     ORDER BY p.id_pedido`,
    [desde, hasta],
  );
}

export async function exportMovements(db, { desde, hasta, tipo, ubicacion }) {
  return rows(
    db,
    `SELECT m.id_movimiento, m.fecha_hora, m.codigo_tipo_movimiento AS tipo, m.cantidad,
            uo.codigo AS origen, m.condicion_origen, ud.codigo AS destino, m.condicion_destino,
            m.id_pedido, m.responsable, m.observacion
     FROM movimiento_inventario m
     JOIN ubicacion uo ON uo.id_ubicacion = m.id_ubicacion_origen
     JOIN ubicacion ud ON ud.id_ubicacion = m.id_ubicacion_destino
     WHERE ($1::date IS NULL OR m.fecha_hora >= $1::date)
       AND ($2::date IS NULL OR m.fecha_hora < $2::date + 1)
       AND ($3::text IS NULL OR m.codigo_tipo_movimiento = $3)
       AND ($4::text IS NULL OR uo.codigo = $4 OR ud.codigo = $4)
     ORDER BY m.id_movimiento`,
    [desde, hasta, tipo, ubicacion],
  );
}

// GET /api/export/orders y /api/export/movements → { file: { name, type, body } }
export async function handleExport(db, user, method, _id, _action, body, context) {
  fail(method !== 'GET', 'Método no permitido', 405);
  const kind = context.resource;
  const { desde, hasta } = range(body);
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === 'orders') {
    permit(user, 'administrador', 'administrativo');
    const data = await exportOrders(db, { desde, hasta });
    await audit(db, user, 'Exportar pedidos', 'pedido', { desde, hasta, filas: data.length });
    return { file: { name: `pedidos-${stamp}.csv`, body: toCsv(ORDER_COLUMNS, data) } };
  }
  if (kind === 'movements') {
    // El libro de movimientos es información de control de stock: solo el administrador
    permit(user, 'administrador');
    const tipo = body.tipo ? String(body.tipo).toUpperCase() : null;
    const ubicacion = body.ubicacion ? String(body.ubicacion).toUpperCase() : null;
    const data = await exportMovements(db, { desde, hasta, tipo, ubicacion });
    await audit(db, user, 'Exportar movimientos', 'movimiento_inventario', {
      desde,
      hasta,
      tipo,
      ubicacion,
      filas: data.length,
    });
    return { file: { name: `movimientos-${stamp}.csv`, body: toCsv(MOVEMENT_COLUMNS, data) } };
  }
  throw new ApiError(404, 'Ruta no encontrada');
}
