export type EstadoPedido = 
  | 'pendiente_pago' 
  | 'pagado' 
  | 'en_despacho' 
  | 'entregado' 
  | 'parcial' 
  | 'ausente' 
  | 'cancelado';

export type MedioPago = 'webpay' | 'transferencia';

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  direccion: string;
  comuna: string;
  deudaEnvases: number; // botellones pendientes
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
  cantidadBidones: number;
  tipoProducto: string;
  precioUnitario: number;
  total: number;
  estado: EstadoPedido;
  medioPago: MedioPago;
  fechaCreacion: string;
  promesaEntrega: string; // "Mañana"
  linkWebpay?: string;
  comprobanteTransferencia?: string;
  cuentaBancariaId?: string;
  tieneAlertaDeuda: boolean;
  deudaEnvasesPendiente: number;
  incidencia?: {
    tipo: 'pendiente' | 'ausente' | 'roto';
    detalle: string;
    fecha: string;
    resuelto: boolean;
  };
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
  botellonesCargados: number;
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
