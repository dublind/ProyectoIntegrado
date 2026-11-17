import type {
  Actividad, Cliente, CuentaBancaria, EstadoPedido, InventarioBodega, NotificacionInterna, Pedido,
  RegistroEnvase, RegistroRotura, TurnoDespacho, Vehiculo
} from '../types';
import type { Row } from '../services/api';
import { geocodificarSimulado } from '../utils/geo';
import { ahoraISO, hoyISO } from '../utils/formato';
import { normalizarTelefono } from '../utils/validacion';

/**
 * Traduce el estado de la API (modelo SQL de Agustín) al modelo de la interfaz de Fabián.
 * Funciones puras: no guardan nada en el navegador. La fuente de verdad es el servidor.
 */

export interface ResultadoAuditoria {
  ok: boolean;
  controles: { nombre: string; ok: boolean; detalle: string }[];
}

export interface EstadoUI {
  clientes: Cliente[];
  pedidos: Pedido[];
  vehiculos: Vehiculo[];
  cuentasBancarias: CuentaBancaria[];
  registrosEnvases: RegistroEnvase[];
  roturasBodega: RegistroRotura[];
  notificacionesInternas: NotificacionInterna[];
  turnos: TurnoDespacho[];
  paradas: Record<string, Pedido[]>; // paradas de cada turno, en orden de visita
  inventario: InventarioBodega;
  actividad: Actividad[];
  inconsistencias: Row[];
  rotosEnBodegaDeRotos: number;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

// Fecha del servidor (ISO con zona) a fecha y hora local "YYYY-MM-DD HH:mm"
export function fechaLocal(valor: unknown): string {
  if (!valor) return '';
  const d = new Date(String(valor));
  return Number.isNaN(d.getTime()) ? String(valor) : ahoraISO(d);
}

// Columna DATE (llega como medianoche UTC): se conserva el día tal cual
export function soloFecha(valor: unknown): string {
  return valor ? String(valor).slice(0, 10) : '';
}

export const codigoPedido = (id: unknown, tipo?: string) => `${tipo === 'retiro' ? 'RET' : 'PED'}-${id}`;

const telefonoVisible = (t: string) => normalizarTelefono(t ?? '') ?? t ?? '';

const textoDireccion = (r: Row) => [r.calle, r.numero].filter(v => v !== null && v !== undefined && String(v).trim()).join(' ');

function coordenadas(r: Row, direccion: string, comuna: string) {
  return r.latitud !== null && r.latitud !== undefined && r.longitud !== null && r.longitud !== undefined
    ? { lat: Number(r.latitud), lng: Number(r.longitud) }
    : geocodificarSimulado(direccion, comuna);
}

// Monto a pagar: bidones más recargo de delivery (un retiro no se cobra)
export const montoPedido = (o: Row) =>
  o.tipo === 'retiro' ? 0 : num(o.cantidad) * num(o.precio_unitario) + num(o.recargo);

const medioDe = (o: Row, pagos: Row[]): Pedido['medioPago'] => {
  const medio = o.medio_preferido ?? pagos.find(p => p.id_pedido === o.id_pedido)?.medio;
  return String(medio ?? '').toUpperCase() === 'WEBPAY' ? 'webpay' : 'transferencia';
};

const ESTADO_PARADA: Record<string, EstadoPedido> = {
  planificada: 'programado',
  en_ruta: 'en_despacho',
  ausente: 'ausente',
  entregada: 'entregado',
  parcial: 'parcial'
};
const SIN_RESOLVER = ['planificada', 'en_ruta', 'ausente'];

function promesa(estado: EstadoPedido, fechaTurno: string | undefined, hoy: string) {
  if (estado === 'pendiente_pago') return 'Mañana';
  if (estado === 'pagado') return 'Por planificar';
  if (!fechaTurno) return '';
  return fechaTurno === hoy ? 'Hoy' : `Programado ${fechaTurno.slice(8, 10)}-${fechaTurno.slice(5, 7)}`;
}

const TITULO_AVISO: Record<string, string> = {
  ROTURA: 'Rotura informada en ruta',
  RETIRO_PENDIENTE: 'Envases por retirar',
  NO_RETORNARON: 'Envases no retornados (30 días)',
  BAJA_ELEGIBLE: 'Baja disponible (60 días)',
  PAGO_APROBADO: 'Pago aprobado',
  SOLICITUD: 'Nueva solicitud por WhatsApp'
};

// Texto legible de cada acción registrada en la auditoría del servidor
function textoActividad(a: Row, pedidos: Map<number, Row>): { texto: string; tipo: Actividad['tipo'] } | null {
  const d = (a.datos ?? {}) as Row;
  const pedido = (id: unknown) => {
    const o = pedidos.get(Number(id));
    return o ? `${codigoPedido(o.id_pedido, o.tipo)} (${o.nombre})` : `pedido N° ${id}`;
  };
  switch (a.accion) {
    case 'Crear pedido': return { texto: `Nuevo pedido ${pedido(a.entidad)}.`, tipo: 'info' };
    case 'Revisar pago': return { texto: `Pago ${d.estado === 'RECHAZADO' ? 'rechazado' : 'validado'} (N° ${a.entidad}).`, tipo: d.estado === 'RECHAZADO' ? 'error' : 'exito' };
    case 'Planificar pedido': return { texto: `${pedido(a.entidad)} planificado para el ${soloFecha(d.fecha).slice(8, 10)}-${soloFecha(d.fecha).slice(5, 7)}.`, tipo: 'info' };
    case 'Mover pedido de turno': return { texto: `${pedido(a.entidad)} movido de furgón o día.`, tipo: 'info' };
    case 'Quitar pedido del turno': return { texto: `${pedido(a.entidad)} vuelve a por planificar.`, tipo: 'info' };
    case 'Agregado al turno activo': return { texto: `${pedido(a.entidad)} entró al turno en preparación.`, tipo: 'info' };
    case 'Iniciar turno': return { texto: `Carga confirmada: ${num(d.llenos)} llenos salen a ruta.`, tipo: 'exito' };
    case 'Registrar entrega': {
      const extra = [num(d.broken) ? `${num(d.broken)} roto(s)` : '', num(d.delivered) > num(d.empties) ? `${num(d.delivered) - num(d.empties)} vacío(s) pendiente(s)` : '']
        .filter(Boolean).join(', ');
      return { texto: `Entregados ${num(d.delivered)} en ${d.pedido ? pedido(d.pedido) : 'parada'}${extra ? ` · ${extra}` : ''}.`, tipo: extra ? 'alerta' : 'exito' };
    }
    case 'Registrar retiro': return { texto: `Retiro de ${num(d.empties)} envase(s) en ${pedido(d.pedido)}.`, tipo: 'exito' };
    case 'Cliente ausente': return { texto: `Cliente ausente en ${d.pedido ? pedido(d.pedido) : 'una parada'}. Coordinar regreso.`, tipo: 'error' };
    case 'Reprogramar ausencia': return { texto: `${pedido(a.entidad)}: reintento ${d.cuando === 'hoy' ? 'hoy' : 'en otro día'}.`, tipo: 'info' };
    case 'Cerrar turno': return { texto: `Ruta cerrada en bodega: ${num(d.vacios)} vacíos y ${num(d.llenos)} llenos ingresados.`, tipo: 'exito' };
    case 'Clasificar roto': return { texto: `Rotura clasificada a la bodega de rotos (reporte ${a.entidad}).`, tipo: 'info' };
    case 'Programar retiro': return { texto: `Retiro de ${num(d.cantidad)} envase(s) queda por planificar.`, tipo: 'info' };
    case 'Movimiento de inventario': return { texto: a.entidad === 'fill' ? `Embotellados ${num(d.cantidad)} vacíos.` : a.entidad === 'writeoff' ? `Baja física de ${num(d.cantidad)} roto(s).` : `Ingreso de ${num(d.cantidad)} envases.`, tipo: 'info' };
    case 'Baja de no retornados': return { texto: `Baja por no retorno de ${num(d.cantidad)} envase(s).`, tipo: 'alerta' };
    case 'Guardar vehículo': return { texto: `Capacidad diaria actualizada: ${num(d.capacidad)} bidones.`, tipo: 'info' };
    case 'Autorizar pedido': return { texto: `${pedido(a.entidad)} autorizado ${d.decision === 'SIN_RETORNO' ? 'sin retorno' : 'con retorno'}.`, tipo: 'info' };
    default: return null; // registros técnicos (revisión de plazos, guardar cliente o dirección...)
  }
}

export function mapearEstado(api: Row, hoy = hoyISO()): EstadoUI {
  const clientesApi: Row[] = api.clientes ?? [];
  const pedidosApi: Row[] = api.pedidos ?? [];
  const direcciones: Row[] = api.direcciones ?? [];
  const pagos: Row[] = api.pagos ?? [];
  const retornos: Row[] = api.retornos ?? [];
  const historialRetornos: Row[] = api.historialRetornos ?? [];
  const turnosApi: Row[] = api.turnos ?? [];
  const paradasApi: Row[] = api.paradasTurnos ?? [];
  const choferes = new Map<string, string>((api.choferes ?? []).map((c: Row) => [c.username, c.nombre]));
  const pedidosPorId = new Map<number, Row>(pedidosApi.map(o => [Number(o.id_pedido), o]));
  const turnoPorId = new Map<number, Row>(turnosApi.map(t => [Number(t.id), t]));

  // Envases pendientes por cliente (fichas y alertas)
  const deuda = new Map<number, number>();
  retornos.forEach(r => deuda.set(Number(r.cliente_id), (deuda.get(Number(r.cliente_id)) ?? 0) + num(r.cantidad)));

  // ---------------------------------------------------------------- Clientes
  const ultimaDireccion = new Map<number, Row>();
  direcciones.filter(d => d.activo !== false).forEach(d => {
    const actual = ultimaDireccion.get(Number(d.id_cliente));
    if (!actual || Number(d.id_direccion) > Number(actual.id_direccion)) ultimaDireccion.set(Number(d.id_cliente), d);
  });
  const ultimoPedido = new Map<number, Row>();
  pedidosApi.filter(o => o.tipo !== 'retiro').forEach(o => {
    const actual = ultimoPedido.get(Number(o.id_cliente));
    if (!actual || Number(o.id_pedido) > Number(actual.id_pedido)) ultimoPedido.set(Number(o.id_cliente), o);
  });
  const clientes: Cliente[] = clientesApi.filter(c => c.activo !== false).map(c => {
    const d = ultimaDireccion.get(Number(c.id_cliente));
    const direccion = d ? textoDireccion(d) : '';
    const comuna = d?.comuna ?? '';
    const u = ultimoPedido.get(Number(c.id_cliente));
    return {
      id: String(c.id_cliente),
      nombre: c.nombre,
      telefono: telefonoVisible(c.telefono),
      direccion,
      comuna,
      coords: d ? coordenadas(d, direccion, comuna) : undefined,
      deudaEnvases: deuda.get(Number(c.id_cliente)) ?? 0,
      notaNoRetornados: c.nota_no_retornados ?? undefined,
      ultimoPedido: u ? { cantidadBidones: num(u.cantidad), tipoProducto: u.tipo_producto, fecha: fechaLocal(u.fecha_creacion).slice(0, 10) } : undefined
    };
  });

  // ---------------------------------------------------------------- Paradas por pedido
  const paradasPorPedido = new Map<number, Row[]>();
  paradasApi.forEach(s => paradasPorPedido.set(Number(s.pedido_id), [...(paradasPorPedido.get(Number(s.pedido_id)) ?? []), s]));
  const turnoAbierto = (s: Row) => turnoPorId.get(Number(s.turno_id))?.estado !== 'finalizado';

  // Datos base de un pedido (desde el pedido o, para el chofer, desde su parada)
  function base(o: Row): Pedido {
    const direccion = textoDireccion(o);
    const deudaCliente = deuda.get(Number(o.id_cliente)) ?? 0;
    return {
      id: String(o.id_pedido ?? o.pedido_id),
      codigo: codigoPedido(o.id_pedido ?? o.pedido_id, o.tipo),
      tipo: o.tipo === 'retiro' ? 'retiro' : 'entrega',
      clienteId: String(o.id_cliente),
      clienteNombre: o.nombre,
      telefono: telefonoVisible(o.telefono),
      direccion,
      comuna: o.comuna ?? '',
      coords: coordenadas(o, direccion, o.comuna ?? ''),
      cantidadBidones: o.tipo === 'retiro' ? 0 : num(o.cantidad ?? o.cantidad_pedido),
      retiroEnvases: o.tipo === 'retiro' ? num(o.cantidad ?? o.cantidad_pedido) : undefined,
      tipoProducto: o.tipo_producto ?? 'Agua Purificada 20L',
      precioUnitario: o.tipo === 'retiro' ? 0 : num(o.precio_unitario),
      recargoDelivery: num(o.recargo),
      total: montoPedido({ ...o, cantidad: o.cantidad ?? o.cantidad_pedido }),
      estado: 'pendiente_pago',
      medioPago: medioDe(o, pagos),
      fechaCreacion: fechaLocal(o.fecha_creacion),
      promesaEntrega: '',
      autorizacion: o.autorizacion,
      requiereAutorizacion: o.autorizacion === 'PENDIENTE',
      tieneAlertaDeuda: deudaCliente > 0,
      deudaEnvasesPendiente: deudaCliente
    };
  }

  // Vista de una parada: datos del pedido con lo que pasó en esa visita
  function vistaParada(s: Row): Pedido | null {
    if (s.estado === 'reprogramada') return null;
    const t = turnoPorId.get(Number(s.turno_id));
    const o = pedidosPorId.get(Number(s.pedido_id)) ?? s;
    const v = base(o);
    const resuelta = !SIN_RESOLVER.includes(s.estado);
    const estado: EstadoPedido = t?.estado === 'preparacion' ? 'programado' : ESTADO_PARADA[s.estado] ?? 'programado';
    const retiro = v.tipo === 'retiro';
    const noDevueltos = !retiro && resuelta ? Math.max(0, num(s.entregados) - num(s.vacios)) : 0;
    return {
      ...v,
      paradaId: String(s.id),
      turnoId: String(s.turno_id),
      estado,
      cantidadBidones: retiro ? 0 : num(s.cantidad),
      retiroEnvases: retiro ? num(s.cantidad) : undefined,
      retiroRealizado: retiro && resuelta ? num(s.vacios) : undefined,
      cantidadEntregada: resuelta && !retiro ? num(s.entregados) : undefined,
      envasesNoDevueltos: resuelta ? noDevueltos : undefined,
      aceptacionParcial: s.aceptacion_parcial || undefined,
      promesaEntrega: promesa(estado, soloFecha(t?.fecha), hoy),
      incidencia: s.estado === 'ausente'
        ? { tipo: 'ausente', detalle: 'Cliente ausente: la oficina coordina el regreso.', fecha: '', resuelto: false }
        : s.estado === 'parcial' && num(s.rotos)
          ? { tipo: 'roto', detalle: `${num(s.rotos)} botellón(es) roto(s) en el trayecto; entrega parcial aceptada.`, fecha: '', resuelto: false }
          : noDevueltos ? { tipo: 'pendiente', detalle: `${noDevueltos} vacío(s) no devuelto(s).`, fecha: '', resuelto: false } : undefined
    };
  }

  // ---------------------------------------------------------------- Pedidos (vista por pedido)
  const pedidos: Pedido[] = pedidosApi.map(o => {
    const v = base(o);
    const paradas = paradasPorPedido.get(Number(o.id_pedido)) ?? [];
    const activa = paradas.filter(s => turnoAbierto(s) && SIN_RESOLVER.includes(s.estado)).at(-1);
    const resueltaAbierta = paradas.filter(s => turnoAbierto(s) && ['entregada', 'parcial'].includes(s.estado)).at(-1);
    const pagado = num(o.pagado) >= montoPedido(o);
    const entregados = num(o.entregados);
    const retiro = v.tipo === 'retiro';
    const vista = activa ? vistaParada(activa) : resueltaAbierta ? vistaParada(resueltaAbierta) : null;

    // Turno en bodega de un día que ya pasó (nunca salió): el pedido vuelve a la cola para replanificarlo
    const turnoActiva = activa ? turnoPorId.get(Number(activa.turno_id)) : undefined;
    const vencido = turnoActiva?.estado === 'preparacion' && soloFecha(turnoActiva.fecha) < hoy;

    let estado: EstadoPedido;
    if (o.nombre_estado === 'Cancelado') estado = 'cancelado';
    else if (vencido) estado = 'pagado';
    else if (vista) estado = vista.estado;
    else if (retiro ? o.nombre_estado === 'Entregado' : entregados >= num(o.cantidad)) estado = 'entregado';
    else if (pagado || retiro) estado = 'pagado';
    else estado = 'pendiente_pago';

    // Saldo de una entrega parcial: queda por planificar con su pago original
    const saldo = !retiro && estado === 'pagado' && entregados > 0;
    const abierto = ['pendiente_pago', 'pagado', 'programado', 'en_despacho', 'ausente'].includes(estado);
    return {
      ...v,
      ...(vista ?? {}),
      paradaId: activa ? String(activa.id) : undefined,
      turnoId: activa ? String(activa.turno_id) : undefined,
      estado,
      cantidadBidones: retiro ? 0 : saldo ? num(o.cantidad) - entregados : estado === 'parcial' ? num(o.cantidad) : (vista?.cantidadBidones ?? v.cantidadBidones),
      cantidadEntregada: estado === 'parcial' ? entregados : vista?.cantidadEntregada,
      pedidoOrigenCodigo: saldo ? v.codigo : undefined,
      promesaEntrega: vencido
        ? `Turno del ${soloFecha(turnoActiva?.fecha).slice(8, 10)}-${soloFecha(turnoActiva?.fecha).slice(5, 7)} sin salir`
        : vista ? vista.promesaEntrega : promesa(estado, undefined, hoy) || (estado === 'entregado' ? 'Entregado' : ''),
      tieneAlertaDeuda: abierto && v.tieneAlertaDeuda,
      deudaEnvasesPendiente: abierto ? v.deudaEnvasesPendiente : 0
    };
  });

  // ---------------------------------------------------------------- Vehículos y turnos
  const vehiculos: Vehiculo[] = (api.vehiculos ?? []).map((v: Row) => ({
    id: String(v.id),
    patente: v.patente,
    modelo: v.modelo,
    capacidadMax: num(v.capacidad),
    chofer: v.chofer ?? undefined,
    choferAsignado: choferes.get(v.chofer) ?? v.chofer ?? 'Sin chofer',
    activo: v.activo !== false
  }));
  const capacidad = new Map(vehiculos.map(v => [v.id, v.capacidadMax]));

  const paradas: Record<string, Pedido[]> = {};
  const turnos: TurnoDespacho[] = turnosApi.map(t => {
    const id = String(t.id);
    const propias = paradasApi.filter(s => Number(s.turno_id) === Number(t.id));
    const vistas = propias.map(vistaParada).filter((p): p is Pedido => !!p);
    paradas[id] = vistas;
    const conOrden = propias.filter(s => s.estado !== 'reprogramada');
    const ordenGuardado = conOrden.length > 0 && conOrden.every(s => s.orden !== null && s.orden !== undefined);
    const llenos = num(t.llenos_a_bordo);
    const vacios = num(t.vacios_a_bordo);
    return {
      id,
      fecha: soloFecha(t.fecha),
      turno: 'Mañana',
      vehiculoId: t.vehiculo_id ? String(t.vehiculo_id) : '',
      choferNombre: choferes.get(t.chofer) ?? t.chofer,
      chofer: t.chofer,
      patente: t.patente ?? undefined,
      pedidosIds: vistas.map(p => p.id),
      capacidadMax: num(t.capacidad) || capacidad.get(String(t.vehiculo_id)) || 0,
      botellonesCargados: llenos + vacios,
      llenosABordo: llenos,
      vaciosABordo: vacios,
      estado: t.estado,
      ordenParadas: ordenGuardado ? vistas.map(p => p.id) : undefined,
      rutaKm: t.ruta_km === null || t.ruta_km === undefined ? undefined : Number(t.ruta_km),
      rutaMin: t.ruta_min === null || t.ruta_min === undefined ? undefined : Number(t.ruta_min),
      rutaFuente: t.ruta_fuente ?? undefined
    };
  });

  // ---------------------------------------------------------------- Envases pendientes e historial
  const registrosEnvases: RegistroEnvase[] = [
    ...retornos.map(r => ({ r, estado: 'pendiente' as const })),
    ...historialRetornos.map(r => ({ r, estado: (r.estado === 'baja' ? 'baja' : 'retirado') as RegistroEnvase['estado'] }))
  ].map(({ r, estado }) => ({
    id: String(r.id),
    clienteId: String(r.cliente_id),
    clienteNombre: r.nombre,
    pedidoCodigo: r.pedido_id ? codigoPedido(r.pedido_id, pedidosPorId.get(Number(r.pedido_id))?.tipo) : '—',
    cantidad: num(r.cantidad),
    fechaOrigen: fechaLocal(r.fecha).slice(0, 10),
    estado,
    fechaResolucion: r.fecha_resolucion ? fechaLocal(r.fecha_resolucion) : undefined
  }));

  // ---------------------------------------------------------------- Inventario
  const stock: Row = api.stock ?? {};
  const pendientes = retornos.reduce((n, r) => n + num(r.cantidad), 0);
  const bajasNoRetorno = historialRetornos.filter(r => r.estado === 'baja').reduce((n, r) => n + num(r.cantidad), 0);
  const inventario: InventarioBodega = {
    llenosCentral: num(stock.llenosBodega),
    vaciosCentral: num(stock.vaciosBodega),
    enTransito: num(stock.transitoLlenos) + num(stock.transitoVacios),
    pendientesDevolucion: pendientes,
    rotosBodega: num(stock.rotosBodega),
    noRetornaron30d: retornos.filter(r => r.estado === 'no_retornaron').reduce((n, r) => n + num(r.cantidad), 0),
    bajasDefinitivas60d: num(stock.bajas) + bajasNoRetorno
  };

  // ---------------------------------------------------------------- Bodega de rotos
  // Las bajas se aplican a los reportes clasificados más antiguos (la baja física no es por reporte)
  const reportes: Row[] = [...(api.reportes ?? [])].sort((a, b) => Number(a.id) - Number(b.id));
  let bajasPorAsignar = num(stock.bajas);
  const roturasBodega: RegistroRotura[] = reportes.map(r => {
    const o = pedidosPorId.get(Number(r.pedido_id));
    let estado: RegistroRotura['estado'] = 'por_clasificar';
    if (r.clasificado) {
      if (bajasPorAsignar >= num(r.cantidad)) {
        estado = 'baja_definitiva';
        bajasPorAsignar -= num(r.cantidad);
      } else estado = 'pendiente_baja';
    }
    return {
      id: `rot-${r.id}`,
      reporteId: String(r.id),
      pedidoId: r.pedido_id ? String(r.pedido_id) : '',
      codigoPedido: r.pedido_id ? codigoPedido(r.pedido_id, o?.tipo) : '—',
      clienteNombre: o?.nombre ?? '',
      producto: o?.tipo_producto ?? 'Bidón 20L',
      cantidad: num(r.cantidad),
      detalle: r.detalle,
      fecha: fechaLocal(r.fecha),
      estado
    };
  }).reverse();
  // Rotos en bodega sin reporte (registros previos al sistema o rotos detectados en bodega)
  const conReporte = roturasBodega.filter(r => r.estado === 'pendiente_baja').reduce((n, r) => n + r.cantidad, 0);
  const sinDetalle = inventario.rotosBodega - conReporte;
  if (sinDetalle > 0) {
    roturasBodega.push({
      id: 'rot-previos', pedidoId: '', codigoPedido: 'Registro previo', clienteNombre: 'Sin detalle disponible',
      producto: 'Bidón 20L', cantidad: sinDetalle, detalle: 'Rotos en bodega sin reporte individual.', fecha: '', estado: 'pendiente_baja'
    });
  }

  // ---------------------------------------------------------------- Avisos internos y actividad
  const nombreCliente = new Map<number, string>(clientesApi.map(c => [Number(c.id_cliente), c.nombre]));
  const notificacionesInternas: NotificacionInterna[] = (api.avisos ?? []).map((a: Row) => ({
    id: String(a.id),
    tipo: a.tipo,
    destinatario: a.destino,
    pedidoId: a.pedido_id ? String(a.pedido_id) : '',
    clienteNombre: nombreCliente.get(Number(a.cliente_id)) ?? '',
    titulo: TITULO_AVISO[a.tipo] ?? 'Aviso interno',
    mensaje: a.mensaje,
    fecha: fechaLocal(a.creado),
    leida: false
  }));

  const actividad: Actividad[] = (api.auditoria ?? []).flatMap((a: Row) => {
    const t = textoActividad(a, pedidosPorId);
    if (!t) return [];
    return [{ id: `aud-${a.id}`, texto: t.texto, tipo: t.tipo, origen: choferes.has(a.actor) ? 'chofer' : 'panel', fecha: fechaLocal(a.fecha) } as Actividad];
  });

  const cuentasBancarias: CuentaBancaria[] = (api.cuentas ?? []).map((c: Row) => ({
    id: String(c.id),
    banco: c.nombre,
    tipoCuenta: '',
    numeroCuenta: c.numero,
    titular: '',
    rut: '',
    email: '',
    comprobantesProcesados: num(c.comprobantes),
    activa: !!c.activa
  }));

  return {
    clientes, pedidos, vehiculos, cuentasBancarias, registrosEnvases, roturasBodega, notificacionesInternas,
    turnos, paradas, inventario, actividad, inconsistencias: api.inconsistencias ?? [],
    rotosEnBodegaDeRotos: num(stock.rotosEnBodegaDeRotos)
  };
}

const PROBLEMAS: Record<string, string> = {
  SALDO_NEGATIVO: 'saldo negativo',
  MOVIMIENTO_SIN_RESPONSABLE: 'movimiento sin responsable',
  RUTA_NO_ESPERADA: 'movimiento con ruta no esperada',
  CONDICION_NO_ESPERADA: 'condición de envase no esperada',
  UNIDADES_DESDE_EXTERIOR_SIN_INGRESO: 'unidades sin ingreso registrado',
  ENTREGA_SIN_PEDIDO: 'entrega sin pedido',
  ENTREGADO_MAS_DE_LO_PEDIDO: 'entregado más de lo pedido',
  ENTREGAS_NO_CUADRAN: 'entregas que no cuadran con el libro',
  TRANSITO_SIN_TURNO_EN_RUTA: 'envases en tránsito sin ruta abierta'
};

/**
 * Cuadratura: el libro de movimientos del servidor (v_inconsistencias) y la coherencia
 * entre furgones, inventario y planificación.
 */
export function auditar(e: EstadoUI, cargaTurno: (t: TurnoDespacho) => number, cargaPlanificada: (t: TurnoDespacho) => number): ResultadoAuditoria {
  const inv = e.inventario;
  const porProblema = new Map<string, number>();
  e.inconsistencias.forEach(i => porProblema.set(i.problema, (porProblema.get(i.problema) ?? 0) + 1));
  const aBordo = e.turnos.filter(t => t.estado === 'en_ruta').reduce((n, t) => n + cargaTurno(t), 0);
  const sobreCapacidad = e.turnos.filter(t => t.estado === 'preparacion' && cargaPlanificada(t) > t.capacidadMax);
  const negativos = (Object.entries(inv) as [string, number][]).filter(([, v]) => v < 0).map(([k]) => k);
  const deudaFichas = e.clientes.reduce((n, c) => n + c.deudaEnvases, 0);

  const controles = [
    {
      nombre: 'Libro de movimientos cuadrado',
      ok: e.inconsistencias.length === 0,
      detalle: e.inconsistencias.length
        ? [...porProblema.entries()].map(([p, n]) => `${n} ${PROBLEMAS[p] ?? p}`).join(' · ')
        : 'Sin inconsistencias en el servidor'
    },
    {
      nombre: 'Furgones = inventario en tránsito',
      ok: aBordo === inv.enTransito,
      detalle: `Inventario ${inv.enTransito} · furgones en ruta ${aBordo}`
    },
    {
      nombre: 'Pendientes = fichas de clientes',
      ok: deudaFichas === inv.pendientesDevolucion,
      detalle: `${inv.pendientesDevolucion} pendientes · ${deudaFichas} en fichas`
    },
    {
      nombre: 'Turnos dentro de su capacidad',
      ok: sobreCapacidad.length === 0,
      detalle: sobreCapacidad.length ? `${sobreCapacidad.length} turno(s) sobre su capacidad diaria` : `${e.turnos.filter(t => t.estado !== 'finalizado').length} turno(s) abiertos`
    },
    {
      nombre: 'Sin cantidades negativas',
      ok: negativos.length === 0,
      detalle: negativos.length ? negativos.join(', ') : 'Todas ≥ 0'
    }
  ];
  return { ok: controles.every(c => c.ok), controles };
}
