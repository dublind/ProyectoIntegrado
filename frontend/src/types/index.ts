export type EstadoPedido =
  | 'pendiente_pago'
  | 'pagado'
  | 'programado' // planificado en un furgón y día, aún en bodega
  | 'en_despacho'
  | 'entregado'
  | 'parcial'
  | 'ausente'
  | 'cancelado';

export type MedioPago = 'webpay' | 'transferencia';

export interface Coordenadas {
  lat: number;
  lng: number;
}

export interface Cliente {
  id: string;
  notaNoRetornados?: string; // mensaje persistente por baja a 60 días (solo administrativo)
  nombre: string;
  telefono: string;
  direccion: string;
  comuna: string;
  coords?: Coordenadas;
  deudaEnvases: number; // botellones pendientes (derivado de registrosEnvases activos)
  ultimoPedido?: {
    cantidadBidones: number;
    tipoProducto: string;
    fecha: string;
  };
}

export interface Pedido {
  id: string;
  codigo: string;
  paradaId?: string; // parada del turno (vistas por turno y app del chofer)
  turnoId?: string;
  requiereAutorizacion?: boolean; // cliente con envases no retornados: el administrativo decide
  autorizacion?: 'LIBRE' | 'PENDIENTE' | 'CON_RETORNO' | 'SIN_RETORNO';
  pendienteSincronizar?: boolean; // acción del chofer guardada sin conexión
  tipo?: 'entrega' | 'retiro'; // retiro: parada solo para recoger envases pendientes (sin llenos ni cobro)
  retiroEnvases?: number; // vacíos a recoger en una parada de retiro
  retiroRealizado?: number; // vacíos efectivamente recogidos en la parada de retiro
  clienteId: string;
  clienteNombre: string;
  telefono: string;
  direccion: string;
  comuna: string;
  coords?: Coordenadas;
  cantidadBidones: number;
  tipoProducto: string;
  precioUnitario: number;
  recargoDelivery?: number; // según el tramo de la comuna (tope $5.000)
  total: number; // bidones + recargo de delivery
  estado: EstadoPedido;
  medioPago: MedioPago;
  fechaCreacion: string; // "YYYY-MM-DD HH:mm"
  promesaEntrega: string; // "Mañana"
  linkWebpay?: string;
  comprobanteTransferencia?: string;
  cuentaBancariaId?: string;
  tieneAlertaDeuda: boolean;
  deudaEnvasesPendiente: number;
  // Resultado de la visita del chofer
  cantidadEntregada?: number;
  envasesNoDevueltos?: number;
  aceptacionParcial?: boolean;
  saldoProgramado?: boolean; // el saldo de un parcial ya se envió al turno siguiente
  pedidoOrigenCodigo?: string; // si es saldo de un parcial, código del pedido original
  incidencia?: {
    tipo: 'pendiente' | 'ausente' | 'roto';
    detalle: string;
    fecha: string;
    resuelto: boolean;
  };
}

// Rotura física registrada en la bodega de rotos (PBI 68). Se conserva como historial tras la baja.
export interface RegistroRotura {
  id: string;
  reporteId?: string; // reporte del chofer (falta en roturas previas sin detalle)
  pedidoId: string;
  codigoPedido: string;
  clienteNombre: string;
  producto: string;
  cantidad: number;
  detalle: string;
  fecha: string;
  // por_clasificar: el chofer la informó y la oficina aún no la pasa a la bodega de rotos
  estado: 'por_clasificar' | 'pendiente_baja' | 'baja_definitiva';
}

// Aviso interno generado al informar una rotura (para administración y el cliente del pedido)
export interface NotificacionInterna {
  id: string;
  tipo: string; // ROTURA, RETIRO_PENDIENTE, NO_RETORNARON, BAJA_ELEGIBLE, PAGO_APROBADO, SOLICITUD...
  destinatario: string; // perfil que debe atenderlo
  pedidoId: string;
  clienteNombre: string;
  titulo: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
}

// Envase vacío que el cliente no devolvió (PBI 72: cliente, fecha y antigüedad)
export interface RegistroEnvase {
  id: string;
  clienteId: string;
  clienteNombre: string;
  pedidoCodigo: string;
  cantidad: number;
  fechaOrigen: string; // YYYY-MM-DD
  estado: 'pendiente' | 'retirado' | 'baja';
  fechaResolucion?: string;
}

export interface Vehiculo {
  id: string;
  patente: string;
  modelo: string;
  capacidadMax: number; // N_max parametrizable (ej: 12, 20 o más)
  choferAsignado: string; // nombre del chofer
  chofer?: string; // usuario del chofer
  activo: boolean;
}

export interface TurnoDespacho {
  id: string;
  fecha: string;
  turno: 'Mañana' | 'Tarde';
  vehiculoId: string;
  choferNombre: string;
  chofer?: string; // usuario del chofer del turno
  patente?: string; // furgón del turno (la app del chofer no recibe la lista de vehículos)
  pedidosIds: string[];
  capacidadMax: number;
  botellonesCargados: number; // envases a bordo (llenos + vacíos intercambiados)
  llenosABordo?: number;
  vaciosABordo?: number;
  estado: 'preparacion' | 'en_ruta' | 'finalizado';
  // Orden óptimo de paradas por tiempo de manejo (ids de pedido), calculado al planificar
  ordenParadas?: string[];
  rutaKm?: number;
  rutaMin?: number;
  rutaFuente?: 'calles' | 'aproximada' | 'manual'; // calles: OSRM; aproximada: cálculo local; manual: orden del planificador
}

export interface CuentaBancaria {
  id: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titular: string;
  rut: string;
  email: string;
  comprobantesProcesados: number; // sin uso: la rotación automática entre cuentas se eliminó
  activa: boolean;
}

export interface InventarioBodega {
  llenosCentral: number;
  vaciosCentral: number;
  enTransito: number;
  pendientesDevolucion: number;
  rotosBodega: number;
  noRetornaron30d: number;
  bajasDefinitivas60d: number;
}

// Registro de lo que pasa en la operación (visible en el panel y sincronizado entre pestañas)
export interface Actividad {
  id: string;
  texto: string;
  origen: 'panel' | 'chofer';
  tipo: 'info' | 'exito' | 'alerta' | 'error';
  fecha: string; // YYYY-MM-DD HH:mm
}
