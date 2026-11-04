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

// Última posición informada por el teléfono del chofer (una por furgón)
export interface UbicacionChofer {
  lat: number;
  lng: number;
  precisionM: number; // radio de incertidumbre que informa el GPS (metros)
  fecha: string; // ISO: momento en que el GPS tomó la posición
  fuente: 'gps' | 'simulada'; // simulada: solo en desarrollo o con VITE_GPS_SIMULADO=true
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
  // Respaldo cuando el GPS no sirve: el chofer pide y la oficina valida la llegada (queda en la actividad)
  llegadaManual?: {
    estado: 'solicitada' | 'autorizada';
    motivo: string;
    solicitadaEn: string;
    autorizadaEn?: string;
  };
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
  // Orden óptimo de paradas por tiempo de manejo (ids de pedido), calculado al planificar
  ordenParadas?: string[];
  rutaKm?: number;
  rutaMin?: number;
  rutaFuente?: 'calles' | 'aproximada'; // calles: OSRM con tiempos reales; aproximada: cálculo local sin conexión
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
