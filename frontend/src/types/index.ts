export type EstadoPedido =
  | 'pendiente_pago'
  | 'pagado'
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
  choferAsignado: string;
  activo: boolean;
}

export interface TurnoDespacho {
  id: string;
  fecha: string;
  turno: 'Mañana' | 'Tarde';
  vehiculoId: string;
  choferNombre: string;
  pedidosIds: string[];
  capacidadMax: number;
  botellonesCargados: number; // envases a bordo (llenos + vacíos intercambiados)
  estado: 'preparacion' | 'en_ruta' | 'finalizado';
}

export interface CuentaBancaria {
  id: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  titular: string;
  rut: string;
  email: string;
  comprobantesProcesados: number; // regla de 45 comprobantes
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
