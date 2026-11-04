import { reactive, computed } from 'vue';
import type { Actividad, Cliente, Pedido, Vehiculo, TurnoDespacho, CuentaBancaria, InventarioBodega, MedioPago, RegistroEnvase, UbicacionChofer } from '../types';
import { BODEGA_CENTRAL, geocodificarSimulado, ordenarRutaLocal } from '../utils/geo';
import { optimizarOrden } from '../utils/rutas';
import { ahoraISO, diasDesde, hoyISO } from '../utils/formato';
import { normalizarTelefono } from '../utils/validacion';
import { recargoDelivery } from '../utils/comunas';
import { evaluarLlegada, formatoDistancia, GPS_SIMULACION_HABILITADA, PRECISION_MAXIMA_M } from '../utils/llegada';
import type { EvaluacionLlegada } from '../utils/llegada';

const STORAGE_KEY = 'agua_purificada_mvp_store_v5'; // v5: demo sin pedidos duplicados de versiones anteriores

// Fechas de la demo relativas a hoy, para que la antigüedad de los envases (30/60 días) sea visible
function haceDias(dias: number, hora = '10:00') {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${hoyISO(d)} ${hora}`;
}

const clientesIniciales: Cliente[] = [
  {
    id: 'cli-1',
    nombre: 'Carolina Valenzuela',
    telefono: '+56 9 8765 4321',
    direccion: 'Av. Providencia 1245, Depto 602',
    comuna: 'Providencia',
    coords: { lat: -33.4296, lng: -70.6168 },
    deudaEnvases: 0,
    ultimoPedido: {
      cantidadBidones: 2,
      tipoProducto: 'Agua Purificada 20L Sellada',
      fecha: haceDias(1).slice(0, 10)
    }
  },
  {
    id: 'cli-2',
    nombre: 'Estudio Jurídico & Asociados',
    telefono: '+56 9 7654 3210',
    direccion: 'Ahumada 341, Of. 804',
    comuna: 'Santiago Centro',
    coords: { lat: -33.4381, lng: -70.6506 },
    deudaEnvases: 1, // Tiene un botellón pendiente
    ultimoPedido: {
      cantidadBidones: 4,
      tipoProducto: 'Agua Purificada 20L Sellada',
      fecha: haceDias(1).slice(0, 10)
    }
  },
  {
    id: 'cli-3',
    nombre: 'Gonzalo Morales',
    telefono: '+56 9 9123 4567',
    direccion: 'Los Leones 2341, Casa B',
    comuna: 'Providencia',
    coords: { lat: -33.4362, lng: -70.6012 },
    deudaEnvases: 0,
    ultimoPedido: {
      cantidadBidones: 1,
      tipoProducto: 'Agua Purificada 20L Sellada',
      fecha: haceDias(1).slice(0, 10)
    }
  },
  {
    id: 'cli-4',
    nombre: 'Panadería y Café El Molino',
    telefono: '+56 9 6543 2109',
    direccion: 'Av. Irarrázaval 3820',
    comuna: 'Ñuñoa',
    coords: { lat: -33.4547, lng: -70.5878 },
    deudaEnvases: 2, // Deuda de 2 envases
    ultimoPedido: {
      cantidadBidones: 3,
      tipoProducto: 'Agua Purificada 20L Sellada',
      fecha: haceDias(0).slice(0, 10)
    }
  }
];

const vehiculosIniciales: Vehiculo[] = [
  {
    id: 'veh-1',
    patente: 'KBLP-42',
    modelo: 'Peugeot Partner Maxi (Furgón 1)',
    capacidadMax: 20, // Parametrizable
    choferAsignado: 'Pedro Chofer',
    activo: true
  },
  {
    id: 'veh-2',
    patente: 'RDJS-88',
    modelo: 'Citroën Berlingo (Furgón 2)',
    capacidadMax: 12,
    choferAsignado: 'Matías González',
    activo: true
  }
];

// Cuenta única de la empresa para recibir transferencias (sin rotación automática entre cuentas)
const cuentasBancariasIniciales: CuentaBancaria[] = [
  {
    id: 'cta-1',
    banco: 'Banco Estado',
    tipoCuenta: 'Cuenta RUT / Vista',
    numeroCuenta: '17.849.231-K',
    titular: 'Aguas Purificadas Erick SpA',
    rut: '76.892.411-5',
    email: 'pagos@aguapurificada.cl',
    comprobantesProcesados: 0,
    activa: true
  }
];

const pedidosIniciales: Pedido[] = [
  {
    id: 'ped-101',
    codigo: 'PED-101',
    clienteId: 'cli-1',
    clienteNombre: 'Carolina Valenzuela',
    telefono: '+56 9 8765 4321',
    direccion: 'Av. Providencia 1245, Depto 602',
    comuna: 'Providencia',
    coords: { lat: -33.4296, lng: -70.6168 },
    cantidadBidones: 2,
    tipoProducto: 'Agua Purificada 20L Sellada',
    precioUnitario: 3500,
    total: 7000,
    estado: 'programado',
    medioPago: 'webpay',
    fechaCreacion: haceDias(1, '09:30'),
    promesaEntrega: 'Hoy',
    linkWebpay: 'https://webpay.transbank.cl/p/tx-9921',
    tieneAlertaDeuda: false,
    deudaEnvasesPendiente: 0
  },
  {
    id: 'ped-102',
    codigo: 'PED-102',
    clienteId: 'cli-2',
    clienteNombre: 'Estudio Jurídico & Asociados',
    telefono: '+56 9 7654 3210',
    direccion: 'Ahumada 341, Of. 804',
    comuna: 'Santiago Centro',
    coords: { lat: -33.4381, lng: -70.6506 },
    cantidadBidones: 4,
    tipoProducto: 'Agua Purificada 20L Sellada',
    precioUnitario: 3500,
    total: 14000,
    estado: 'programado',
    medioPago: 'transferencia',
    fechaCreacion: haceDias(1, '10:15'),
    promesaEntrega: 'Hoy',
    comprobanteTransferencia: 'comprobante_banco_102.pdf',
    cuentaBancariaId: 'cta-1',
    tieneAlertaDeuda: true,
    deudaEnvasesPendiente: 1
  },
  {
    id: 'ped-103',
    codigo: 'PED-103',
    clienteId: 'cli-3',
    clienteNombre: 'Gonzalo Morales',
    telefono: '+56 9 9123 4567',
    direccion: 'Los Leones 2341, Casa B',
    comuna: 'Providencia',
    coords: { lat: -33.4362, lng: -70.6012 },
    cantidadBidones: 1,
    tipoProducto: 'Agua Purificada 20L Sellada',
    precioUnitario: 3500,
    total: 3500,
    estado: 'programado',
    medioPago: 'webpay',
    fechaCreacion: haceDias(1, '11:40'),
    promesaEntrega: 'Hoy',
    linkWebpay: 'https://webpay.transbank.cl/p/tx-9925',
    tieneAlertaDeuda: false,
    deudaEnvasesPendiente: 0
  },
  {
    id: 'ped-104',
    codigo: 'PED-104',
    clienteId: 'cli-4',
    clienteNombre: 'Panadería y Café El Molino',
    telefono: '+56 9 6543 2109',
    direccion: 'Av. Irarrázaval 3820',
    comuna: 'Ñuñoa',
    coords: { lat: -33.4547, lng: -70.5878 },
    cantidadBidones: 3,
    tipoProducto: 'Agua Purificada 20L Sellada',
    precioUnitario: 3500,
    total: 10500,
    estado: 'pendiente_pago',
    medioPago: 'transferencia',
    fechaCreacion: haceDias(0, '08:20'),
    promesaEntrega: 'Mañana',
    tieneAlertaDeuda: true,
    deudaEnvasesPendiente: 2
  }
];

// Envases no devueltos con fecha de origen (antigüedad: 12, 38 y 64 días)
const registrosEnvasesIniciales: RegistroEnvase[] = [
  {
    id: 'env-1',
    clienteId: 'cli-2',
    clienteNombre: 'Estudio Jurídico & Asociados',
    pedidoCodigo: 'PED-087',
    cantidad: 1,
    fechaOrigen: haceDias(12).slice(0, 10),
    estado: 'pendiente'
  },
  {
    id: 'env-2',
    clienteId: 'cli-4',
    clienteNombre: 'Panadería y Café El Molino',
    pedidoCodigo: 'PED-064',
    cantidad: 1,
    fechaOrigen: haceDias(38).slice(0, 10),
    estado: 'pendiente'
  },
  {
    id: 'env-3',
    clienteId: 'cli-4',
    clienteNombre: 'Panadería y Café El Molino',
    pedidoCodigo: 'PED-041',
    cantidad: 1,
    fechaOrigen: haceDias(64).slice(0, 10),
    estado: 'pendiente'
  }
];

// Turno de hoy del furgón 1 ya planificado, aún en bodega (el chofer carga e inicia la ruta desde su app)
const turnosIniciales: TurnoDespacho[] = [
  {
    id: `turno-veh-1-${hoyISO()}`,
    fecha: hoyISO(),
    turno: 'Mañana',
    vehiculoId: 'veh-1',
    choferNombre: 'Pedro Chofer',
    pedidosIds: ['ped-101', 'ped-102', 'ped-103'],
    capacidadMax: 20,
    botellonesCargados: 0,
    estado: 'preparacion'
  }
];

const inventarioInicial: InventarioBodega = {
  llenosCentral: 149, // incluye los 7 del turno de hoy: salen de bodega cuando el chofer carga
  vaciosCentral: 85,
  enTransito: 0, // Sincronizado con lo que va a bordo de los furgones en ruta
  pendientesDevolucion: 3, // Sincronizado con registros de envases pendientes
  rotosBodega: 4, // Botellones rotos esperando baja de Erick
  noRetornaron30d: 2,
  bajasDefinitivas60d: 5
};

const STOCK_REFERENCIA_INICIAL =
  inventarioInicial.llenosCentral + inventarioInicial.vaciosCentral + inventarioInicial.enTransito +
  inventarioInicial.pendientesDevolucion + inventarioInicial.rotosBodega + inventarioInicial.bajasDefinitivas60d;

export interface ResultadoAuditoria {
  ok: boolean;
  controles: { nombre: string; ok: boolean; detalle: string }[];
}

export interface CargaFurgon {
  total: number; // envases a bordo
  llenos: number; // llenos aún por entregar
  vacios: number; // vacíos recogidos
  // No están a bordo, pero ocupaban cupo del turno: se muestran aparte para no confundirlos con espacio libre
  noDevueltos: number; // vacíos que el cliente no entregó (pendientes de devolución)
  rotos: number; // botellones rotos en el trayecto (pasaron a la bodega de rotos)
}

function clonar<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const idTurno = (vehiculoId: string, fecha: string) => `turno-${vehiculoId}-${fecha}`;

// Una parada de retiro no entrega llenos; ocupa cupo con los vacíos que se van a recoger
const esRetiro = (p: Pedido) => p.tipo === 'retiro';
const llenosDe = (p: Pedido) => (esRetiro(p) ? 0 : p.cantidadBidones);
const cupoDe = (p: Pedido) => (esRetiro(p) ? p.retiroEnvases ?? 0 : p.cantidadBidones);

// Identificador único aunque se creen varios registros en el mismo milisegundo
// (antes se usaba Date.now() y dos pedidos podían quedar con el mismo id)
const nuevoId = (prefijo: string) =>
  `${prefijo}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
const nombreCorto = (v: Vehiculo) => v.modelo.replace(/\s*\(.*\)$/, '');

// Misma dirección aunque cambien mayúsculas, tildes o espacios
const claveDireccion = (p: { direccion: string; comuna: string }) =>
  `${p.direccion}|${p.comuna}`.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

class AppStore {
  state = reactive({
    clientes: clonar(clientesIniciales),
    pedidos: clonar(pedidosIniciales),
    vehiculos: clonar(vehiculosIniciales),
    cuentasBancarias: clonar(cuentasBancariasIniciales),
    registrosEnvases: clonar(registrosEnvasesIniciales),
    // Un turno por furgón y por día; la capacidad diaria del furgón es su N_max
    turnos: clonar(turnosIniciales),
    inventario: clonar(inventarioInicial),
    modoOffline: false,
    // Última posición GPS informada por la app del chofer, por furgón (la ve el mapa de seguimiento)
    ubicaciones: {} as Record<string, UbicacionChofer>,
    actividad: [] as Actividad[],
    // Envases que existen físicamente desde el inicio (stock total + bajas). Sirve para auditar la cuadratura.
    stockReferencia: STOCK_REFERENCIA_INICIAL,
    actualizadoEn: ''
  });

  private oyentesRemotos: ((nuevas: Actividad[]) => void)[] = [];

  constructor() {
    this.cargarDesdeLocalStorage();
    this.sincronizarInventario();
    this.escucharOtrasPestanas();
    // Turnos aún en bodega sin orden óptimo calculado (por ejemplo, la semilla)
    this.state.turnos.filter(t => t.estado === 'preparacion' && !t.ordenParadas).forEach(t => void this.optimizarRuta(t.id));
  }

  /**
   * Sincronización en vivo entre pestañas del mismo navegador (panel y app del chofer abiertos a la vez).
   * El evento `storage` solo llega a las otras pestañas, así que no hay bucles.
   * Entre dispositivos distintos esto lo reemplazará Supabase Realtime.
   */
  private escucharOtrasPestanas() {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', e => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const remoto = JSON.parse(e.newValue);
        const idsLocales = new Set(this.state.actividad.map(a => a.id));
        const nuevas = ((remoto.actividad ?? []) as Actividad[]).filter(a => !idsLocales.has(a.id));
        const { modoOffline: _offlineRemoto, ...resto } = remoto;
        Object.assign(this.state, resto);
        if (nuevas.length) this.oyentesRemotos.forEach(fn => fn(nuevas));
      } catch (err) {
        console.warn('No se pudo sincronizar con otra pestaña', err);
      }
    });
  }

  // Permite al panel avisar lo que hizo el chofer en otra pestaña
  alRecibirActividadRemota(fn: (nuevas: Actividad[]) => void) {
    this.oyentesRemotos.push(fn);
  }

  private registrarActividad(texto: string, origen: Actividad['origen'], tipo: Actividad['tipo'] = 'info') {
    this.state.actividad.unshift({ id: nuevoId('act'), texto, origen, tipo, fecha: ahoraISO() });
    this.state.actividad.splice(30);
  }

  private guardarEnLocalStorage() {
    this.state.actualizadoEn = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('No se pudo guardar en localStorage', e);
    }
  }

  private cargarDesdeLocalStorage() {
    try {
      // Borra datos de versiones anteriores de la demo (podían traer pedidos duplicados)
      Object.keys(localStorage)
        .filter(k => k.startsWith('agua_purificada_mvp_store') && k !== STORAGE_KEY)
        .forEach(k => localStorage.removeItem(k));
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        Object.assign(this.state, parsed);
      }
    } catch (e) {
      console.warn('No se pudo cargar desde localStorage', e);
    }
  }

  /**
   * Sincronización continua de inventario con todos los módulos:
   * - En tránsito: exactamente igual a lo que va a bordo de todos los furgones.
   * - Pendientes: suma de los registros de envases no devueltos que siguen activos.
   * - Deuda de cada cliente y alerta de sus pedidos abiertos derivadas de esos registros.
   */
  sincronizarInventario() {
    // 1. En tránsito se sincroniza con lo cargado en los furgones
    this.state.inventario.enTransito = this.state.turnos.reduce((acc, t) => acc + t.botellonesCargados, 0);

    // 2. Pendientes y no retornados (30 días) se derivan de los registros activos
    const activos = this.state.registrosEnvases.filter(r => r.estado === 'pendiente');
    this.state.inventario.pendientesDevolucion = activos.reduce((acc, r) => acc + r.cantidad, 0);
    this.state.inventario.noRetornaron30d = activos
      .filter(r => diasDesde(r.fechaOrigen) >= 30)
      .reduce((acc, r) => acc + r.cantidad, 0);

    // 3. Deuda en ficha de cliente y alerta en pedidos aún no cerrados
    this.state.clientes.forEach(c => {
      c.deudaEnvases = activos.filter(r => r.clienteId === c.id).reduce((acc, r) => acc + r.cantidad, 0);
    });
    this.state.pedidos.forEach(p => {
      if (['pendiente_pago', 'pagado', 'programado', 'en_despacho', 'ausente'].includes(p.estado)) {
        const cli = this.state.clientes.find(c => c.id === p.clienteId);
        p.deudaEnvasesPendiente = cli?.deudaEnvases ?? 0;
        p.tieneAlertaDeuda = p.deudaEnvasesPendiente > 0;
      }
      if (!p.coords) p.coords = geocodificarSimulado(p.direccion, p.comuna);
    });

    this.guardarEnLocalStorage();
  }

  // ==========================================================================
  // Consultas
  // ==========================================================================

  // Cuenta única donde los clientes depositan las transferencias
  cuentaActiva = computed(() => {
    return this.state.cuentasBancarias.find(c => c.activa) || this.state.cuentasBancarias[0];
  });

  totalStockContinuo = computed(() => {
    const inv = this.state.inventario;
    return inv.llenosCentral + inv.vaciosCentral + inv.enTransito + inv.pendientesDevolucion + inv.rotosBodega;
  });

  vehiculo(vehiculoId: string) {
    return this.state.vehiculos.find(v => v.id === vehiculoId);
  }

  turnoDe(vehiculoId: string, fecha: string) {
    return this.state.turnos.find(t => t.vehiculoId === vehiculoId && t.fecha === fecha);
  }

  turnoDePedido(pedidoId: string) {
    return this.state.turnos.find(t => t.pedidosIds.includes(pedidoId));
  }

  /**
   * Otro pedido del mismo cliente o a la misma dirección ya planificado ese día en un turno abierto.
   * Se usa para que un mismo domicilio no reciba dos furgones el mismo día.
   */
  pedidoMismoDestino(pedido: Pedido, fecha: string) {
    const clave = claveDireccion(pedido);
    for (const t of this.state.turnos) {
      if (t.fecha !== fecha || t.estado === 'finalizado') continue;
      const otro = this.state.pedidos.find(p => p.id !== pedido.id && t.pedidosIds.includes(p.id) &&
        (p.clienteId === pedido.clienteId || claveDireccion(p) === clave));
      if (otro) return { turno: t, pedido: otro };
    }
    return undefined;
  }

  // Paradas de un turno en el orden óptimo calculado; mientras se calcula, orden local aproximado
  pedidosDeTurno(turno: TurnoDespacho) {
    const pedidos = this.state.pedidos.filter(p => turno.pedidosIds.includes(p.id));
    const orden = turno.ordenParadas;
    if (orden && pedidos.every(p => orden.includes(p.id))) {
      return [...pedidos].sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));
    }
    return ordenarRutaLocal(pedidos);
  }

  /**
   * Calcula el recorrido más rápido de un turno en bodega (sale y vuelve a la bodega) y lo guarda.
   * Se recalcula cada vez que cambian sus pedidos; una vez en ruta el orden ya no cambia.
   */
  async optimizarRuta(turnoId: string) {
    const turno = this.state.turnos.find(t => t.id === turnoId);
    if (!turno || turno.estado !== 'preparacion') return;
    const firma = [...turno.pedidosIds].sort().join(',');
    const paradas = this.state.pedidos
      .filter(p => turno.pedidosIds.includes(p.id))
      .map(p => ({ id: p.id, coords: p.coords ?? geocodificarSimulado(p.direccion, p.comuna) }));
    if (!paradas.length) {
      Object.assign(turno, { ordenParadas: [], rutaKm: 0, rutaMin: 0, rutaFuente: undefined });
      this.guardarEnLocalStorage();
      return;
    }
    const r = await optimizarOrden(BODEGA_CENTRAL, paradas);
    // Si mientras tanto cambiaron los pedidos del turno, este resultado ya no sirve
    const actual = this.state.turnos.find(t => t.id === turnoId);
    if (!actual || actual.estado !== 'preparacion' || [...actual.pedidosIds].sort().join(',') !== firma) return;
    Object.assign(actual, { ordenParadas: r.orden, rutaKm: r.km, rutaMin: r.minutos, rutaFuente: r.fuente });
    this.guardarEnLocalStorage();
  }

  // Invalida el orden guardado y lanza un nuevo cálculo
  private reoptimizar(turno: TurnoDespacho | undefined) {
    if (!turno || turno.estado !== 'preparacion') return;
    turno.ordenParadas = undefined;
    void this.optimizarRuta(turno.id);
  }

  // Bidones comprometidos en el turno (cuenta contra la capacidad diaria del furgón)
  cargaPlanificada(turno: TurnoDespacho) {
    return this.state.pedidos
      .filter(p => turno.pedidosIds.includes(p.id))
      .reduce((acc, p) => acc + cupoDe(p), 0);
  }

  // Lo que va a bordo, separado en llenos por entregar y vacíos recogidos
  cargaDeTurno(turno: TurnoDespacho): CargaFurgon {
    const total = turno.botellonesCargados;
    const pedidos = this.state.pedidos.filter(p => turno.pedidosIds.includes(p.id));
    const enRuta = turno.estado === 'en_ruta';
    const llenos = enRuta
      ? pedidos.filter(p => p.estado === 'en_despacho' || p.estado === 'ausente').reduce((acc, p) => acc + llenosDe(p), 0)
      : 0;
    const noDevueltos = enRuta ? pedidos.reduce((acc, p) => acc + (p.envasesNoDevueltos ?? 0), 0) : 0;
    const rotos = enRuta
      ? pedidos.filter(p => p.estado === 'parcial').reduce((acc, p) => acc + p.cantidadBidones - (p.cantidadEntregada ?? p.cantidadBidones), 0)
      : 0;
    return { total, llenos, vacios: total - llenos, noDevueltos, rotos };
  }

  turnosDeHoy = computed(() => {
    const hoy = hoyISO();
    return this.state.turnos.filter(t => t.fecha === hoy);
  });

  // Todas las paradas de hoy (todos los furgones), en orden geográfico por furgón
  paradasDeHoy = computed(() => this.turnosDeHoy.value.flatMap(t => this.pedidosDeTurno(t)));

  // Suma de lo que va a bordo de todos los furgones
  cargaFurgones = computed<CargaFurgon>(() => this.state.turnos.reduce((acc, t) => {
    const c = this.cargaDeTurno(t);
    return {
      total: acc.total + c.total, llenos: acc.llenos + c.llenos, vacios: acc.vacios + c.vacios,
      noDevueltos: acc.noDevueltos + c.noDevueltos, rotos: acc.rotos + c.rotos
    };
  }, { total: 0, llenos: 0, vacios: 0, noDevueltos: 0, rotos: 0 }));

  registrosPendientes = computed(() => {
    return this.state.registrosEnvases
      .filter(r => r.estado === 'pendiente')
      .map(r => ({ ...r, dias: diasDesde(r.fechaOrigen) }))
      .sort((a, b) => b.dias - a.dias);
  });

  /**
   * Auditoría de cuadratura: verifica que todos los módulos cuenten lo mismo después de cada acción.
   * Si un control falla, hay un error de sincronización o de lógica.
   */
  auditoria = computed<ResultadoAuditoria>(() => {
    const st = this.state;
    const inv = st.inventario;
    const activos = st.registrosEnvases.filter(r => r.estado === 'pendiente');
    const deudaRegistros = activos.reduce((acc, r) => acc + r.cantidad, 0);
    const carga = this.cargaFurgones.value;
    const clientesDescuadrados = st.clientes.filter(c =>
      c.deudaEnvases !== activos.filter(r => r.clienteId === c.id).reduce((acc, r) => acc + r.cantidad, 0));
    const fisico = this.totalStockContinuo.value + inv.bajasDefinitivas60d;
    const negativos = (Object.entries(inv) as [string, number][]).filter(([, v]) => v < 0).map(([k]) => k);

    // Cada pedido en a lo más un turno, y su estado coincide con el del turno
    const enVariosTurnos = st.pedidos.filter(p => st.turnos.filter(t => t.pedidosIds.includes(p.id)).length > 1);
    const estadoIncoherente = st.pedidos.filter(p => {
      const t = st.turnos.find(x => x.pedidosIds.includes(p.id));
      if (p.estado === 'programado') return t?.estado !== 'preparacion';
      if (p.estado === 'en_despacho' || p.estado === 'ausente') return t?.estado !== 'en_ruta';
      return false;
    });
    const sobreCapacidad = st.turnos.filter(t => t.estado === 'preparacion' && this.cargaPlanificada(t) > t.capacidadMax);
    const vaciosNegativos = st.turnos.filter(t => this.cargaDeTurno(t).vacios < 0);
    const direccionEnDosFurgones = st.turnos.filter(t => t.estado !== 'finalizado').flatMap(t =>
      st.pedidos.filter(p => t.pedidosIds.includes(p.id))
        .filter(p => st.turnos.some(o => o.fecha === t.fecha && o.vehiculoId !== t.vehiculoId && o.estado !== 'finalizado' &&
          st.pedidos.some(q => o.pedidosIds.includes(q.id) && claveDireccion(q) === claveDireccion(p)))));
    const idsRepetidos = [st.pedidos, st.clientes, st.registrosEnvases, st.turnos]
      .reduce((acc, lista) => acc + lista.length - new Set(lista.map(x => x.id)).size, 0);

    const controles = [
      { nombre: 'Stock físico conservado', ok: fisico === st.stockReferencia,
        detalle: `${this.totalStockContinuo.value} en circulación + ${inv.bajasDefinitivas60d} bajas = ${fisico} (esperado ${st.stockReferencia})` },
      { nombre: 'Furgones = inventario en tránsito', ok: inv.enTransito === carga.total,
        detalle: `Inventario ${inv.enTransito} · furgones ${carga.total} (${carga.llenos} llenos + ${carga.vacios} vacíos)` },
      { nombre: 'Vacíos a bordo no negativos', ok: vaciosNegativos.length === 0, detalle: `${carga.vacios} vacíos a bordo` },
      { nombre: 'Pendientes = fichas de clientes', ok: inv.pendientesDevolucion === deudaRegistros && clientesDescuadrados.length === 0,
        detalle: clientesDescuadrados.length
          ? `Descuadre en: ${clientesDescuadrados.map(c => c.nombre).join(', ')}`
          : `${inv.pendientesDevolucion} en inventario · ${deudaRegistros} en registros` },
      { nombre: 'Turnos consistentes', ok: enVariosTurnos.length + estadoIncoherente.length + sobreCapacidad.length === 0,
        detalle: enVariosTurnos.length ? `${enVariosTurnos.length} pedido(s) en más de un turno`
          : estadoIncoherente.length ? `${estadoIncoherente.length} pedido(s) con estado distinto al de su turno`
            : sobreCapacidad.length ? `${sobreCapacidad.length} turno(s) sobre su capacidad diaria`
              : `${st.turnos.filter(t => t.estado !== 'finalizado').length} turno(s) abiertos` },
      { nombre: 'Sin cantidades negativas', ok: negativos.length === 0, detalle: negativos.length ? negativos.join(', ') : 'Todas ≥ 0' },
      { nombre: 'Una dirección, un furgón por día', ok: direccionEnDosFurgones.length === 0,
        detalle: direccionEnDosFurgones.length
          ? `Dos furgones van a: ${[...new Set(direccionEnDosFurgones.map(p => `${p.direccion}, ${p.comuna}`))].join('; ')}`
          : 'Ningún domicilio recibe dos furgones el mismo día' },
      { nombre: 'Identificadores únicos', ok: idsRepetidos === 0,
        detalle: idsRepetidos ? `${idsRepetidos} registro(s) con id repetido` : 'Pedidos, clientes, envases y turnos sin repetir' }
    ];
    return { ok: controles.every(c => c.ok), controles };
  });

  alertasPendientesCount = computed(() => {
    return this.state.pedidos.filter(p => p.tieneAlertaDeuda || p.incidencia?.tipo === 'pendiente').length;
  });

  retirosPendientesCliente(clienteId: string) {
    return this.state.registrosEnvases
      .filter(r => r.clienteId === clienteId && r.estado === 'pendiente')
      .reduce((acc, r) => acc + r.cantidad, 0);
  }

  // Envases dados de baja por no retorno: mensaje persistente en ficha (solo administrativo)
  bajasNoRetornoCliente(clienteId: string) {
    return this.state.registrosEnvases
      .filter(r => r.clienteId === clienteId && r.estado === 'baja')
      .reduce((acc, r) => acc + r.cantidad, 0);
  }

  // ==========================================================================
  // Acciones del administrativo (Tarea #48)
  // ==========================================================================
  buscarClientes(termino: string) {
    if (!termino.trim()) return [];
    const t = termino.toLowerCase();
    return this.state.clientes.filter(c =>
      c.nombre.toLowerCase().includes(t) ||
      c.telefono.includes(t) ||
      c.direccion.toLowerCase().includes(t)
    );
  }

  obtenerHistorialCliente(clienteId: string) {
    return this.state.clientes.find(c => c.id === clienteId);
  }

  crearPedido(datos: {
    clienteId?: string;
    nombre: string;
    telefono: string;
    direccion: string;
    comuna: string;
    cantidadBidones: number;
    tipoProducto: string;
    medioPago: MedioPago;
  }) {
    const telefono = normalizarTelefono(datos.telefono) ?? datos.telefono.trim();
    let cliente = this.state.clientes.find(c => c.id === datos.clienteId || c.telefono === telefono);
    if (!cliente) {
      cliente = {
        id: nuevoId('cli'),
        nombre: datos.nombre.trim(),
        telefono,
        direccion: datos.direccion.trim(),
        comuna: datos.comuna.trim(),
        coords: geocodificarSimulado(datos.direccion, datos.comuna),
        deudaEnvases: 0
      };
      this.state.clientes.push(cliente);
    } else {
      // Actualiza la ficha si la secretaría corrigió la dirección
      if (cliente.direccion !== datos.direccion.trim() || cliente.comuna !== datos.comuna.trim()) {
        cliente.direccion = datos.direccion.trim();
        cliente.comuna = datos.comuna.trim();
        cliente.coords = geocodificarSimulado(cliente.direccion, cliente.comuna);
      }
    }

    const precioUnitario = 3500;
    const recargo = recargoDelivery(cliente.comuna);
    const total = datos.cantidadBidones * precioUnitario + recargo;
    const ultimo = Math.max(100, ...this.state.pedidos.map(p => Number(/^PED-(\d+)$/.exec(p.codigo)?.[1] ?? 0)));
    const codigo = `PED-${ultimo + 1}`;

    const nuevoPedido: Pedido = {
      id: nuevoId('ped'),
      codigo,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      comuna: cliente.comuna,
      coords: cliente.coords ?? geocodificarSimulado(cliente.direccion, cliente.comuna),
      cantidadBidones: datos.cantidadBidones,
      tipoProducto: datos.tipoProducto,
      precioUnitario,
      recargoDelivery: recargo,
      total,
      estado: 'pendiente_pago',
      medioPago: datos.medioPago,
      fechaCreacion: ahoraISO(),
      promesaEntrega: 'Mañana',
      tieneAlertaDeuda: cliente.deudaEnvases > 0,
      deudaEnvasesPendiente: cliente.deudaEnvases
    };

    if (datos.medioPago === 'webpay') {
      nuevoPedido.linkWebpay = `https://webpay.transbank.cl/p/tx-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    this.state.pedidos.unshift(nuevoPedido);
    this.registrarActividad(`Nuevo pedido ${codigo} de ${cliente.nombre} (${datos.cantidadBidones} bidones).`, 'panel');

    // Actualizar último pedido en cliente para futuro prellenado
    cliente.ultimoPedido = {
      cantidadBidones: datos.cantidadBidones,
      tipoProducto: datos.tipoProducto,
      fecha: hoyISO()
    };

    this.sincronizarInventario();
    return nuevoPedido;
  }

  simularPagoWebpay(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (pedido) {
      pedido.estado = 'pagado';
      this.registrarActividad(`Pago Webpay confirmado: ${pedido.codigo}.`, 'panel', 'exito');
      this.guardarEnLocalStorage();
    }
  }

  // Todas las transferencias se abonan a la cuenta única de la empresa (sin rotación entre cuentas)
  validarTransferenciaManual(pedidoId: string, archivoComprobante = 'comprobante_transferencia.jpg') {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    pedido.estado = 'pagado';
    pedido.comprobanteTransferencia = archivoComprobante;
    pedido.cuentaBancariaId = this.cuentaActiva.value.id;

    this.registrarActividad(`Transferencia validada: ${pedido.codigo}.`, 'panel', 'exito');
    this.guardarEnLocalStorage();
  }

  /**
   * Planifica un pedido pagado en un furgón y un día (o lo mueve de turno mientras siga en bodega).
   * La capacidad diaria del furgón (N_max) no se puede superar. Los llenos salen de bodega recién al cargar.
   */
  asignarPedido(pedidoId: string, vehiculoId: string, fecha: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const vehiculo = this.vehiculo(vehiculoId);
    if (!pedido || !vehiculo) return;
    if (pedido.estado !== 'pagado' && pedido.estado !== 'programado') {
      throw new Error('Solo se pueden planificar pedidos pagados que aún no salen a ruta.');
    }
    if (fecha < hoyISO()) throw new Error('No se puede planificar en un día que ya pasó.');

    const anterior = this.turnoDePedido(pedidoId);
    if (anterior && anterior.estado !== 'preparacion') throw new Error(`${pedido.codigo} ya salió a ruta y no se puede mover.`);

    let turno = this.turnoDe(vehiculoId, fecha);
    if (turno && turno === anterior) return;
    if (turno && turno.estado !== 'preparacion') {
      throw new Error(`${nombreCorto(vehiculo)} ya ${turno.estado === 'en_ruta' ? 'salió a ruta' : 'cerró su ruta'} ese día. Elige otro furgón o día.`);
    }

    // Un domicilio, un furgón por día: no se manda un segundo furgón a la misma dirección
    const mismoDestino = this.pedidoMismoDestino(pedido, fecha);
    if (mismoDestino && mismoDestino.turno.vehiculoId !== vehiculoId) {
      const otroVehiculo = this.vehiculo(mismoDestino.turno.vehiculoId);
      throw new Error(`${pedido.clienteNombre} ya tiene ${mismoDestino.pedido.codigo} en ${otroVehiculo ? nombreCorto(otroVehiculo) : 'otro furgón'} ese día. Asígnalo al mismo furgón para no ir dos veces a la misma dirección.`);
    }

    const carga = turno ? this.cargaPlanificada(turno) : 0;
    const capacidad = turno?.capacidadMax ?? vehiculo.capacidadMax;
    if (carga + pedido.cantidadBidones > capacidad) {
      throw new Error(`${nombreCorto(vehiculo)} ya lleva ${carga}/${capacidad} ese día: no caben ${pedido.cantidadBidones} bidones más.`);
    }

    if (!turno) {
      this.state.turnos.push({
        id: idTurno(vehiculoId, fecha),
        fecha,
        turno: 'Mañana',
        vehiculoId,
        choferNombre: vehiculo.choferAsignado,
        pedidosIds: [],
        capacidadMax: vehiculo.capacidadMax,
        botellonesCargados: 0,
        estado: 'preparacion'
      });
      turno = this.state.turnos[this.state.turnos.length - 1];
    }

    if (anterior) anterior.pedidosIds = anterior.pedidosIds.filter(id => id !== pedidoId);
    turno.pedidosIds.push(pedidoId);
    this.reoptimizar(anterior);
    this.reoptimizar(turno);
    pedido.estado = 'programado';
    pedido.promesaEntrega = fecha === hoyISO() ? 'Hoy' : `Programado ${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`;
    this.registrarActividad(`${pedido.codigo} ${anterior ? 'movido' : 'planificado'} en ${nombreCorto(vehiculo)} para el ${fecha.slice(8, 10)}-${fecha.slice(5, 7)}.`, 'panel');
    this.sincronizarInventario();
  }

  // Devuelve un pedido planificado a la cola "por planificar"
  desasignarPedido(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const turno = this.turnoDePedido(pedidoId);
    if (!pedido || !turno) return;
    if (turno.estado !== 'preparacion') throw new Error(`${pedido.codigo} ya salió a ruta y no se puede quitar.`);
    turno.pedidosIds = turno.pedidosIds.filter(id => id !== pedidoId);
    this.reoptimizar(turno);
    pedido.estado = 'pagado';
    pedido.promesaEntrega = 'Por planificar';
    this.registrarActividad(`${pedido.codigo} vuelve a pedidos por planificar.`, 'panel');
    this.sincronizarInventario();
  }

  // Atajo: planifica para hoy en el primer furgón con cupo
  asignarPedidoADespacho(pedidoId: string) {
    const hoy = hoyISO();
    const errores: string[] = [];
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    // Si el cliente ya tiene un pedido hoy, se prueba primero ese mismo furgón
    const preferido = pedido ? this.pedidoMismoDestino(pedido, hoy)?.turno.vehiculoId : undefined;
    const vehiculos = this.state.vehiculos.filter(x => x.activo)
      .sort((a, b) => Number(b.id === preferido) - Number(a.id === preferido));
    for (const v of vehiculos) {
      try {
        this.asignarPedido(pedidoId, v.id, hoy);
        if (this.turnoDePedido(pedidoId)?.vehiculoId === v.id) return v;
      } catch (err) {
        errores.push((err as Error).message);
      }
    }
    throw new Error(`Ningún furgón tiene cupo hoy. ${errores.join(' ')}`);
  }

  // Capacidad diaria del furgón (N_max); no puede quedar bajo lo ya planificado
  cambiarCapacidadVehiculo(vehiculoId: string, nuevaCapacidad: number) {
    const vehiculo = this.vehiculo(vehiculoId);
    if (!vehiculo || !Number.isInteger(nuevaCapacidad) || nuevaCapacidad < 1) return;
    const excedido = this.state.turnos.find(t =>
      t.vehiculoId === vehiculoId && t.estado === 'preparacion' && this.cargaPlanificada(t) > nuevaCapacidad);
    if (excedido) {
      throw new Error(`El ${excedido.fecha.slice(8, 10)}-${excedido.fecha.slice(5, 7)} ya hay ${this.cargaPlanificada(excedido)} bidones planificados en este furgón.`);
    }
    vehiculo.capacidadMax = nuevaCapacidad;
    this.state.turnos.forEach(t => {
      if (t.vehiculoId === vehiculoId && t.estado !== 'finalizado') t.capacidadMax = nuevaCapacidad;
    });
    this.registrarActividad(`Capacidad diaria de ${nombreCorto(vehiculo)}: ${nuevaCapacidad} bidones.`, 'panel');
    this.guardarEnLocalStorage();
  }

  // ==========================================================================
  // Acciones del chofer (Tarea #49 / PBI 71)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Llegada a la parada (GPS del chofer)
  // --------------------------------------------------------------------------

  // El teléfono del chofer informa su posición. Las simuladas solo se aceptan en desarrollo/demo.
  reportarUbicacionChofer(vehiculoId: string, ubicacion: UbicacionChofer) {
    if (!this.vehiculo(vehiculoId)) return;
    if (ubicacion.fuente === 'simulada' && !GPS_SIMULACION_HABILITADA) {
      throw new Error('La ubicación simulada no está permitida en esta versión.');
    }
    if (![ubicacion.lat, ubicacion.lng, ubicacion.precisionM].every(Number.isFinite)) return;
    this.state.ubicaciones[vehiculoId] = { ...ubicacion };
    this.guardarEnLocalStorage();
  }

  ubicacionDe(vehiculoId: string): UbicacionChofer | undefined {
    return this.state.ubicaciones[vehiculoId];
  }

  // Estado "en camino / en destino" de una parada según el GPS del furgón que la lleva
  estadoLlegada(pedidoId: string, ahora = Date.now()): EvaluacionLlegada {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const turno = this.turnoDePedido(pedidoId);
    if (!pedido || !turno) return { estado: 'sin_ubicacion', distanciaM: null, precisionM: null };
    const destino = pedido.coords ?? geocodificarSimulado(pedido.direccion, pedido.comuna);
    return evaluarLlegada(this.ubicacionDe(turno.vehiculoId), destino, ahora);
  }

  // Llegada validada: por GPS dentro del radio, o autorizada por la oficina (respaldo)
  llegadaValidada(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return false;
    return pedido.llegadaManual?.estado === 'autorizada' || this.estadoLlegada(pedidoId).estado === 'en_destino';
  }

  // Regla de negocio: no se cierra una parada (entrega, retiro o novedad) sin haber llegado
  private exigirLlegada(pedido: Pedido) {
    if (this.llegadaValidada(pedido.id)) return;
    const ev = this.estadoLlegada(pedido.id);
    const mensajes: Record<string, string> = {
      sin_ubicacion: 'No hay ubicación GPS del furgón. Activa la ubicación o pide a la oficina que valide la llegada.',
      ubicacion_vencida: 'La ubicación GPS está desactualizada. Espera una nueva lectura o pide a la oficina que valide la llegada.',
      precision_baja: `La señal GPS es imprecisa (±${Math.round(ev.precisionM ?? 0)} m, se necesita ±${PRECISION_MAXIMA_M} m o menos).`,
      en_camino: `Aún no llegas a ${pedido.clienteNombre}${ev.distanciaM !== null ? ` (faltan ${formatoDistancia(ev.distanciaM)})` : ''}.`
    };
    throw new Error(mensajes[ev.estado] ?? 'Aún no llegas a la parada.');
  }

  // Respaldo si el GPS no funciona: el chofer pide que la oficina valide su llegada
  solicitarValidacionLlegada(pedidoId: string, motivo: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.estado !== 'en_despacho') return;
    if (pedido.llegadaManual) return;
    pedido.llegadaManual = { estado: 'solicitada', motivo, solicitadaEn: ahoraISO() };
    this.registrarActividad(`${pedido.codigo}: el chofer pide validar su llegada a ${pedido.clienteNombre} (${motivo}).`, 'chofer', 'alerta');
    this.guardarEnLocalStorage();
  }

  // Solo la oficina (panel) autoriza la llegada manual; queda registrada en la actividad
  autorizarLlegadaManual(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.estado !== 'en_despacho' || pedido.llegadaManual?.estado !== 'solicitada') return;
    pedido.llegadaManual.estado = 'autorizada';
    pedido.llegadaManual.autorizadaEn = ahoraISO();
    this.registrarActividad(`Oficina validó la llegada a ${pedido.clienteNombre} (${pedido.codigo}) sin GPS.`, 'panel', 'alerta');
    this.guardarEnLocalStorage();
  }

  rechazarLlegadaManual(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.llegadaManual?.estado !== 'solicitada') return;
    pedido.llegadaManual = undefined;
    this.registrarActividad(`Oficina rechazó validar la llegada a ${pedido.clienteNombre} (${pedido.codigo}).`, 'panel', 'info');
    this.guardarEnLocalStorage();
  }

  // El chofer confirma la carga física: los llenos salen de bodega y suben al furgón
  iniciarRuta(turnoId: string) {
    const turno = this.state.turnos.find(t => t.id === turnoId);
    if (!turno || turno.estado !== 'preparacion') return;
    if (turno.fecha !== hoyISO()) throw new Error('Solo se puede iniciar la ruta del día.');

    const pedidos = this.state.pedidos.filter(p => turno.pedidosIds.includes(p.id) && p.estado === 'programado');
    if (!pedidos.length) throw new Error('El turno no tiene paradas para iniciar.');
    const llenos = pedidos.reduce((acc, p) => acc + llenosDe(p), 0);
    if (this.state.inventario.llenosCentral < llenos) {
      throw new Error(`Faltan llenos en bodega: se necesitan ${llenos} y hay ${this.state.inventario.llenosCentral}.`);
    }

    this.state.inventario.llenosCentral -= llenos;
    turno.botellonesCargados = llenos;
    pedidos.forEach(p => { p.estado = 'en_despacho'; });
    turno.estado = 'en_ruta';
    this.registrarActividad(`${turno.choferNombre} confirmó la carga (${llenos} bidones) e inició la ruta.`, 'chofer', 'exito');
    this.sincronizarInventario();
  }

  confirmarEntregaChofer(pedidoId: string, retirados?: number) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    this.exigirLlegada(pedido);

    if (esRetiro(pedido)) {
      const n = this.registrarRetiroChofer(pedidoId, retirados ?? pedido.retiroEnvases);
      pedido.retiroRealizado = n;
      pedido.estado = 'entregado';
      pedido.cantidadEntregada = 0;
      pedido.envasesNoDevueltos = 0;
      if (pedido.incidencia?.tipo === 'ausente') pedido.incidencia.resuelto = true;
      if (n === 0) this.registrarActividad(`Retiro en ${pedido.clienteNombre}: no había envases para recoger.`, 'chofer', 'alerta');
      this.sincronizarInventario();
      return;
    }

    // Entrega normal: lleno entregado, vacío recibido (los envases a bordo no cambian)
    pedido.estado = 'entregado';
    pedido.cantidadEntregada = pedido.cantidadBidones;
    pedido.envasesNoDevueltos = 0;
    if (pedido.incidencia?.tipo === 'ausente') pedido.incidencia.resuelto = true;
    this.registrarActividad(`Entregado a ${pedido.clienteNombre} (${pedido.codigo}).`, 'chofer', 'exito');

    this.sincronizarInventario();
  }

  /**
   * Cierre de una parada de entrega con lo que el chofer confirmó por separado:
   * - recibió menos vacíos que los entregados: la diferencia queda pendiente de devolución del cliente;
   * - recibió más: el excedente se descuenta de lo que el cliente debía de entregas anteriores.
   */
  confirmarVisitaChofer(pedidoId: string, vaciosRecibidos: number) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido || esRetiro(pedido)) return;
    this.exigirLlegada(pedido);
    const cantidad = pedido.cantidadBidones;
    const maximo = cantidad + this.retirosPendientesCliente(pedido.clienteId);
    const recibidos = Math.min(Math.max(0, Math.round(vaciosRecibidos)), maximo);

    if (recibidos < cantidad) {
      const faltan = cantidad - recibidos;
      this.reportarIncidenciaChofer(pedidoId, 'pendiente',
        `Entregó ${cantidad}, recibió ${recibidos} vacío(s): ${faltan} quedan pendientes de devolución.`, { cantidad: faltan });
      return;
    }
    if (recibidos > cantidad) this.registrarRetiroChofer(pedidoId, recibidos - cantidad);
    this.confirmarEntregaChofer(pedidoId);
  }

  /**
   * Retiro de envases pendientes de entregas anteriores.
   * Resuelve la alerta activa una sola vez, conservando el registro como historial.
   */
  registrarRetiroChofer(pedidoId: string, cantidad?: number) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const turno = this.turnoDePedido(pedidoId);
    if (!pedido || !turno) return 0;

    const registros = this.state.registrosEnvases
      .filter(r => r.clienteId === pedido.clienteId && r.estado === 'pendiente')
      .sort((a, b) => a.fechaOrigen.localeCompare(b.fechaOrigen));
    const adeudados = registros.reduce((acc, r) => acc + r.cantidad, 0);
    let porRetirar = Math.min(Math.max(0, cantidad ?? adeudados), adeudados);
    const total = porRetirar;

    for (const r of registros) {
      if (porRetirar <= 0) break;
      if (r.cantidad <= porRetirar) {
        porRetirar -= r.cantidad;
        r.estado = 'retirado';
        r.fechaResolucion = ahoraISO();
      } else {
        // Retiro parcial de este registro: lo retirado queda como historial y el resto sigue pendiente con su fecha
        this.state.registrosEnvases.push({
          ...r, id: nuevoId('env'), cantidad: porRetirar, estado: 'retirado', fechaResolucion: ahoraISO()
        });
        r.cantidad -= porRetirar;
        porRetirar = 0;
      }
    }

    // Los vacíos retirados suben al furgón
    turno.botellonesCargados += total;
    if (total > 0) {
      const quedan = adeudados - total;
      this.registrarActividad(`Retirados ${total} envase(s) de ${pedido.clienteNombre}${quedan ? `; quedan ${quedan} pendiente(s)` : ''}.`, 'chofer', 'exito');
    }
    // Sin deuda pendiente, un retiro aún no planificado o en bodega ya no hace falta
    if (adeudados - total === 0) this.cancelarRetirosSinDeuda(pedido.clienteId, pedidoId);
    this.sincronizarInventario();
    return total;
  }

  private cancelarRetirosSinDeuda(clienteId: string, exceptoId?: string) {
    this.state.pedidos
      .filter(p => esRetiro(p) && p.clienteId === clienteId && p.id !== exceptoId && (p.estado === 'pagado' || p.estado === 'programado'))
      .forEach(p => {
        const turno = this.turnoDePedido(p.id);
        if (turno) {
          turno.pedidosIds = turno.pedidosIds.filter(id => id !== p.id);
          this.reoptimizar(turno);
        }
        p.estado = 'cancelado';
        this.registrarActividad(`${p.codigo} cancelado: ${p.clienteNombre} ya devolvió sus envases.`, 'panel');
      });
  }

  // Retiro abierto (aún no realizado) para un cliente
  retiroAbierto(clienteId: string) {
    return this.state.pedidos.find(p => esRetiro(p) && p.clienteId === clienteId &&
      ['pagado', 'programado', 'en_despacho', 'ausente'].includes(p.estado));
  }

  /**
   * Programa una parada solo de retiro para recoger los envases pendientes de un cliente,
   * aunque no haya hecho un pedido nuevo. Queda "por planificar" en el calendario.
   */
  programarRetiro(clienteId: string) {
    const cliente = this.state.clientes.find(c => c.id === clienteId);
    if (!cliente) return;
    const adeudados = this.retirosPendientesCliente(clienteId);
    if (adeudados <= 0) throw new Error(`${cliente.nombre} no tiene envases pendientes.`);
    const abierto = this.retiroAbierto(clienteId);
    if (abierto) throw new Error(`${cliente.nombre} ya tiene el retiro ${abierto.codigo} programado.`);

    const ultimo = Math.max(0, ...this.state.pedidos.map(p => Number(/^RET-(\d+)$/.exec(p.codigo)?.[1] ?? 0)));
    const codigo = `RET-${String(ultimo + 1).padStart(3, '0')}`;
    const origen = this.state.registrosEnvases
      .filter(r => r.clienteId === clienteId && r.estado === 'pendiente')
      .map(r => r.pedidoCodigo).join(', ');
    this.state.pedidos.unshift({
      id: nuevoId('ret'),
      codigo,
      tipo: 'retiro',
      retiroEnvases: adeudados,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      comuna: cliente.comuna,
      coords: cliente.coords ?? geocodificarSimulado(cliente.direccion, cliente.comuna),
      cantidadBidones: 0,
      tipoProducto: 'Retiro de envases vacíos',
      precioUnitario: 0,
      recargoDelivery: 0,
      total: 0,
      estado: 'pagado', // sin cobro: queda directamente por planificar
      medioPago: 'transferencia',
      fechaCreacion: ahoraISO(),
      promesaEntrega: 'Por planificar (retiro)',
      pedidoOrigenCodigo: origen,
      tieneAlertaDeuda: true,
      deudaEnvasesPendiente: adeudados
    });
    this.registrarActividad(`${codigo}: retiro de ${adeudados} envase(s) de ${cliente.nombre} queda por planificar.`, 'panel');
    this.sincronizarInventario();
    return codigo;
  }

  reportarIncidenciaChofer(
    pedidoId: string,
    tipo: 'pendiente' | 'ausente' | 'roto',
    detalle: string,
    opciones: { cantidad?: number; aceptacionCliente?: boolean } = {}
  ) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const turno = this.turnoDePedido(pedidoId);
    if (!pedido || !turno) return;
    this.exigirLlegada(pedido);

    if (tipo === 'roto' && !opciones.aceptacionCliente) {
      throw new Error('La entrega parcial requiere informar al cliente y registrar su aceptación.');
    }

    pedido.incidencia = {
      tipo,
      detalle,
      fecha: new Date().toLocaleTimeString('es-CL'),
      resuelto: false
    };

    if (tipo === 'pendiente') {
      // Se entregó el agua pero el cliente no devolvió el vacío -> registro con fecha en ficha cliente
      const n = Math.min(Math.max(1, opciones.cantidad ?? 1), pedido.cantidadBidones);
      pedido.estado = 'entregado';
      pedido.cantidadEntregada = pedido.cantidadBidones;
      pedido.envasesNoDevueltos = n;
      turno.botellonesCargados = Math.max(0, turno.botellonesCargados - n);
      this.state.registrosEnvases.push({
        id: nuevoId('env'),
        clienteId: pedido.clienteId,
        clienteNombre: pedido.clienteNombre,
        pedidoCodigo: pedido.codigo,
        cantidad: n,
        fechaOrigen: hoyISO(),
        estado: 'pendiente'
      });
    } else if (tipo === 'ausente') {
      // Cliente no estaba -> no se entrega y sigue en furgón; el administrativo coordina el regreso
      pedido.estado = 'ausente';
    } else if (tipo === 'roto') {
      // Fisurado en furgón -> entrega parcial aceptada; merma física entra a bodega de rotos
      const k = Math.min(Math.max(1, opciones.cantidad ?? 1), pedido.cantidadBidones);
      pedido.estado = 'parcial';
      pedido.aceptacionParcial = true;
      pedido.cantidadEntregada = pedido.cantidadBidones - k;
      pedido.envasesNoDevueltos = 0;
      this.state.inventario.rotosBodega += k;
      turno.botellonesCargados = Math.max(0, turno.botellonesCargados - k);
    }

    const textos = {
      pendiente: `${pedido.clienteNombre} no devolvió ${pedido.envasesNoDevueltos} envase(s).`,
      ausente: `Cliente ausente: ${pedido.clienteNombre}. Coordinar regreso.`,
      roto: `Entrega parcial a ${pedido.clienteNombre}: ${pedido.cantidadEntregada} de ${pedido.cantidadBidones} (botellón roto).`
    };
    this.registrarActividad(textos[tipo], 'chofer', tipo === 'pendiente' ? 'alerta' : 'error');

    this.sincronizarInventario();
  }

  // Ausencia: volver hoy (sigue en la ruta) o reprogramar (vuelve a "por planificar" y los llenos a bodega)
  reprogramarAusente(pedidoId: string, cuando: 'hoy' | 'manana') {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const turno = this.turnoDePedido(pedidoId);
    if (!pedido || !turno || pedido.estado !== 'ausente') return;

    if (pedido.incidencia) pedido.incidencia.resuelto = true;
    // El reintento es otra visita: la validación manual de la llegada anterior ya no vale
    pedido.llegadaManual = undefined;

    this.registrarActividad(`${pedido.clienteNombre}: reintento ${cuando === 'hoy' ? 'hoy' : 'en otro día'}.`, 'panel');
    if (cuando === 'hoy') {
      pedido.estado = 'en_despacho';
      pedido.promesaEntrega = 'Hoy (reintento)';
    } else {
      pedido.estado = 'pagado';
      pedido.promesaEntrega = 'Por planificar (reprogramado)';
      turno.pedidosIds = turno.pedidosIds.filter(id => id !== pedidoId);
      turno.botellonesCargados = Math.max(0, turno.botellonesCargados - llenosDe(pedido));
      this.state.inventario.llenosCentral += llenosDe(pedido);
    }
    this.sincronizarInventario();
  }

  // Saldo de un parcial: queda por planificar con el pago original (sin nuevo cobro)
  programarSaldoParcial(pedidoId: string) {
    const original = this.state.pedidos.find(p => p.id === pedidoId);
    if (!original || original.estado !== 'parcial' || original.saldoProgramado) return;

    const saldo = original.cantidadBidones - (original.cantidadEntregada ?? original.cantidadBidones);
    if (saldo <= 0) return;

    original.saldoProgramado = true;
    this.registrarActividad(`Saldo de ${original.codigo} (${saldo}) queda por planificar.`, 'panel');
    this.state.pedidos.unshift({
      ...clonar(original),
      id: nuevoId('ped'),
      codigo: `${original.codigo}-S`,
      cantidadBidones: saldo,
      recargoDelivery: 0,
      total: 0,
      estado: 'pagado',
      fechaCreacion: ahoraISO(),
      promesaEntrega: 'Por planificar (saldo pagado)',
      pedidoOrigenCodigo: original.codigo,
      incidencia: undefined,
      cantidadEntregada: undefined,
      envasesNoDevueltos: undefined,
      aceptacionParcial: undefined,
      saldoProgramado: undefined,
      linkWebpay: undefined
    });
    this.sincronizarInventario();
  }

  // Liquidación del furgón al retornar a bodega central (descarga de vacíos y cuadratura física)
  liquidarRetornoFurgonCentral(turnoId: string, origen: Actividad['origen'] = 'panel') {
    const turno = this.state.turnos.find(t => t.id === turnoId);
    if (!turno || turno.estado !== 'en_ruta') return { vaciosRecolectados: 0, llenosNoEntregados: 0 };
    const pedidos = this.state.pedidos.filter(p => turno.pedidosIds.includes(p.id));

    // Llenos que vuelven: ausentes y paradas no visitadas
    const pedidosConLlenos = pedidos.filter(p => p.estado === 'ausente' || p.estado === 'en_despacho');
    const llenosNoEntregados = pedidosConLlenos.reduce((sum, p) => sum + llenosDe(p), 0);

    // Todo lo demás a bordo son vacíos (intercambiados o retirados)
    const vaciosRecolectados = Math.max(0, turno.botellonesCargados - llenosNoEntregados);

    this.state.inventario.vaciosCentral += vaciosRecolectados;
    this.state.inventario.llenosCentral += Math.min(llenosNoEntregados, turno.botellonesCargados);

    // Los no entregados vuelven a "por planificar" con su pago original
    pedidosConLlenos.forEach(p => {
      p.estado = 'pagado';
      p.promesaEntrega = 'Por planificar (reprogramado)';
      if (p.incidencia) p.incidencia.resuelto = true;
    });

    // El furgón descarga por completo; el turno conserva solo las paradas realizadas como historial
    turno.botellonesCargados = 0;
    turno.pedidosIds = turno.pedidosIds.filter(id => !pedidosConLlenos.some(p => p.id === id));
    turno.estado = 'finalizado';

    this.registrarActividad(`Ruta de ${turno.choferNombre} cerrada en bodega: ${vaciosRecolectados} vacíos y ${llenosNoEntregados} llenos ingresados.`, origen, 'exito');
    this.sincronizarInventario();
    return { vaciosRecolectados, llenosNoEntregados };
  }

  // Recarga/Lavado de botellones en planta (vacíos a llenos)
  sanitizarYRecargar(cantidad = 20) {
    const cant = Math.min(this.state.inventario.vaciosCentral, cantidad);
    if (cant > 0) {
      this.state.inventario.vaciosCentral -= cant;
      this.state.inventario.llenosCentral += cant;
      this.sincronizarInventario();
    }
  }

  // Exclusivo Administrador / Erick: Autorizar baja definitiva física
  autorizarBajaRotoAdmin(cantidad = 1) {
    if (this.state.inventario.rotosBodega >= cantidad) {
      this.state.inventario.rotosBodega -= cantidad;
      this.state.inventario.bajasDefinitivas60d += cantidad;
      this.sincronizarInventario();
    }
  }

  // Exclusivo Administrador: baja de envase no retornado tras 60 días (queda marca en ficha)
  darDeBajaNoRetornado(registroId: string) {
    const reg = this.state.registrosEnvases.find(r => r.id === registroId);
    if (!reg || reg.estado !== 'pendiente') return;
    if (diasDesde(reg.fechaOrigen) < 60) {
      throw new Error('Solo se puede dar de baja un envase con 60 días o más sin devolución.');
    }
    reg.estado = 'baja';
    reg.fechaResolucion = ahoraISO();
    this.state.inventario.bajasDefinitivas60d += reg.cantidad;
    if (this.retirosPendientesCliente(reg.clienteId) === 0) this.cancelarRetirosSinDeuda(reg.clienteId);
    this.sincronizarInventario();
  }

  resetDemoData() {
    localStorage.removeItem(STORAGE_KEY);
    this.state.clientes = clonar(clientesIniciales);
    this.state.pedidos = clonar(pedidosIniciales);
    this.state.vehiculos = clonar(vehiculosIniciales);
    this.state.cuentasBancarias = clonar(cuentasBancariasIniciales);
    this.state.registrosEnvases = clonar(registrosEnvasesIniciales);
    this.state.turnos = clonar(turnosIniciales);
    this.state.inventario = clonar(inventarioInicial);
    this.state.actividad = [];
    this.state.ubicaciones = {};
    this.state.stockReferencia = STOCK_REFERENCIA_INICIAL;
    this.sincronizarInventario();
  }
}

export const appStore = new AppStore();
