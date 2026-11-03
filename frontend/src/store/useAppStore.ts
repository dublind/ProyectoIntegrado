import { reactive, computed } from 'vue';
import type { Cliente, Pedido, Vehiculo, TurnoDespacho, CuentaBancaria, InventarioBodega, MedioPago, RegistroEnvase } from '../types';
import { geocodificarSimulado, ordenarPorCercania } from '../utils/geo';
import { ahoraISO, diasDesde, hoyISO } from '../utils/formato';
import { normalizarTelefono } from '../utils/validacion';

const STORAGE_KEY = 'agua_purificada_mvp_store_v2';

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

const cuentasBancariasIniciales: CuentaBancaria[] = [
  {
    id: 'cta-1',
    banco: 'Banco Estado',
    tipoCuenta: 'Cuenta RUT / Vista',
    numeroCuenta: '17.849.231-K',
    titular: 'Aguas Purificadas Erick SpA',
    rut: '76.892.411-5',
    email: 'pagos@aguapurificada.cl',
    comprobantesProcesados: 44, // Al validar 1 más conmutará automáticamente a 45
    activa: true
  },
  {
    id: 'cta-2',
    banco: 'Banco Santander',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '00-8472910-4',
    titular: 'Aguas Purificadas Erick SpA',
    rut: '76.892.411-5',
    email: 'pagos2@aguapurificada.cl',
    comprobantesProcesados: 0,
    activa: false
  },
  {
    id: 'cta-3',
    banco: 'Banco de Chile',
    tipoCuenta: 'Cuenta Vista',
    numeroCuenta: '09-112349-8',
    titular: 'Aguas Purificadas Erick SpA',
    rut: '76.892.411-5',
    email: 'pagos3@aguapurificada.cl',
    comprobantesProcesados: 0,
    activa: false
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
    estado: 'en_despacho',
    medioPago: 'webpay',
    fechaCreacion: haceDias(1, '09:30'),
    promesaEntrega: 'Mañana (Turno Mañana)',
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
    estado: 'en_despacho',
    medioPago: 'transferencia',
    fechaCreacion: haceDias(1, '10:15'),
    promesaEntrega: 'Mañana (Turno Mañana)',
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
    estado: 'en_despacho',
    medioPago: 'webpay',
    fechaCreacion: haceDias(1, '11:40'),
    promesaEntrega: 'Mañana (Turno Mañana)',
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

const turnoActivoInicial: TurnoDespacho = {
  id: 'turno-1',
  fecha: hoyISO(),
  turno: 'Mañana',
  vehiculoId: 'veh-1',
  choferNombre: 'Pedro Chofer',
  pedidosIds: ['ped-101', 'ped-102', 'ped-103'],
  capacidadMax: 20,
  botellonesCargados: 7, // 2 + 4 + 1 = 7 botellones asignados
  estado: 'en_ruta'
};

const inventarioInicial: InventarioBodega = {
  llenosCentral: 142,
  vaciosCentral: 85,
  enTransito: 7, // Sincronizado con botellonesCargados del furgón
  pendientesDevolucion: 3, // Sincronizado con registros de envases pendientes
  rotosBodega: 4, // Botellones rotos esperando baja de Erick
  noRetornaron30d: 2,
  bajasDefinitivas60d: 5
};

function clonar<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

class AppStore {
  state = reactive({
    clientes: clonar(clientesIniciales),
    pedidos: clonar(pedidosIniciales),
    vehiculos: clonar(vehiculosIniciales),
    cuentasBancarias: clonar(cuentasBancariasIniciales),
    registrosEnvases: clonar(registrosEnvasesIniciales),
    turnoActivo: clonar(turnoActivoInicial),
    inventario: clonar(inventarioInicial),
    notificacionRotacion: null as string | null,
    modoOffline: false
  });

  constructor() {
    this.cargarDesdeLocalStorage();
    this.sincronizarInventario();
  }

  private guardarEnLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('No se pudo guardar en localStorage', e);
    }
  }

  private cargarDesdeLocalStorage() {
    try {
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
   * - En tránsito: exactamente igual a los envases a bordo del furgón de reparto.
   * - Pendientes: suma de los registros de envases no devueltos que siguen activos.
   * - Deuda de cada cliente y alerta de sus pedidos abiertos derivadas de esos registros.
   */
  sincronizarInventario() {
    // 1. En tránsito se sincroniza con los botellones cargados en ruta
    this.state.inventario.enTransito = this.state.turnoActivo.botellonesCargados;

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
      if (['pendiente_pago', 'pagado', 'en_despacho', 'ausente'].includes(p.estado)) {
        const cli = this.state.clientes.find(c => c.id === p.clienteId);
        p.deudaEnvasesPendiente = cli?.deudaEnvases ?? 0;
        p.tieneAlertaDeuda = p.deudaEnvasesPendiente > 0;
      }
      if (!p.coords) p.coords = geocodificarSimulado(p.direccion, p.comuna);
    });

    this.guardarEnLocalStorage();
  }

  // Getters computados
  cuentaActiva = computed(() => {
    return this.state.cuentasBancarias.find(c => c.activa) || this.state.cuentasBancarias[0];
  });

  totalStockContinuo = computed(() => {
    const inv = this.state.inventario;
    return inv.llenosCentral + inv.vaciosCentral + inv.enTransito + inv.pendientesDevolucion + inv.rotosBodega;
  });

  // Paradas del turno en orden geográfico (vecino más cercano desde la bodega central)
  pedidosDespachoActivo = computed(() => {
    const ids = this.state.turnoActivo.pedidosIds;
    return ordenarPorCercania(this.state.pedidos.filter(p => ids.includes(p.id)));
  });

  registrosPendientes = computed(() => {
    return this.state.registrosEnvases
      .filter(r => r.estado === 'pendiente')
      .map(r => ({ ...r, dias: diasDesde(r.fechaOrigen) }))
      .sort((a, b) => b.dias - a.dias);
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

  // Acciones Administrativo (Tarea #48)
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
        id: `cli-${Date.now()}`,
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
    const total = datos.cantidadBidones * precioUnitario;
    const nuevoId = `ped-${Date.now()}`;
    const codigo = `PED-${Math.floor(100 + Math.random() * 900)}`;

    const nuevoPedido: Pedido = {
      id: nuevoId,
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
      this.guardarEnLocalStorage();
    }
  }

  validarTransferenciaManual(pedidoId: string, archivoComprobante = 'comprobante_transferencia.jpg') {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    pedido.estado = 'pagado';
    pedido.comprobanteTransferencia = archivoComprobante;

    // Algoritmo de rotación de cuenta bancaria al acumular 45 comprobantes
    const cta = this.cuentaActiva.value;
    cta.comprobantesProcesados += 1;
    pedido.cuentaBancariaId = cta.id;

    if (cta.comprobantesProcesados >= 45) {
      this.conmutarSiguienteCuentaBancaria(cta.id);
    }

    this.guardarEnLocalStorage();
  }

  conmutarSiguienteCuentaBancaria(cuentaActualId: string) {
    const cuentas = this.state.cuentasBancarias;
    const idxActual = cuentas.findIndex(c => c.id === cuentaActualId);
    const siguienteIdx = (idxActual + 1) % cuentas.length;

    cuentas.forEach((c, idx) => {
      c.activa = (idx === siguienteIdx);
      if (idx === siguienteIdx) {
        c.comprobantesProcesados = 0; // Reinicia contador para nueva cuenta activa
      }
    });

    const nueva = cuentas[siguienteIdx];
    this.state.notificacionRotacion = `¡Atención! La cuenta ${cuentas[idxActual].banco} alcanzó 45 comprobantes. Se conmutó automáticamente a ${nueva.banco} (${nueva.tipoCuenta} ${nueva.numeroCuenta}).`;
  }

  asignarPedidoADespacho(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const turno = this.state.turnoActivo;
    if (!pedido || turno.pedidosIds.includes(pedidoId)) return;

    const nuevaCarga = turno.botellonesCargados + pedido.cantidadBidones;
    if (nuevaCarga > turno.capacidadMax) {
      throw new Error(`Excede la capacidad máxima del furgón (${turno.capacidadMax} botellones). Carga actual: ${turno.botellonesCargados}.`);
    }
    if (this.state.inventario.llenosCentral < pedido.cantidadBidones) {
      throw new Error(`No hay suficientes botellones llenos en bodega central (${this.state.inventario.llenosCentral} disponibles).`);
    }

    // Si el turno anterior ya se liquidó, se abre uno nuevo
    if (turno.estado === 'finalizado') {
      turno.estado = 'en_ruta';
      turno.fecha = hoyISO();
    }

    turno.pedidosIds.push(pedidoId);
    turno.botellonesCargados = nuevaCarga;
    pedido.estado = 'en_despacho';

    // Se descuentan de bodega central (llenos) y suben al furgón (en tránsito)
    this.state.inventario.llenosCentral -= pedido.cantidadBidones;
    this.sincronizarInventario();
  }

  // Acciones Chofer (Tarea #49 / PBI 71)
  confirmarEntregaChofer(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    // Entrega normal: lleno entregado, vacío recibido (los envases a bordo no cambian)
    pedido.estado = 'entregado';
    pedido.cantidadEntregada = pedido.cantidadBidones;
    pedido.envasesNoDevueltos = 0;
    if (pedido.incidencia?.tipo === 'ausente') pedido.incidencia.resuelto = true;

    this.sincronizarInventario();
  }

  /**
   * Retiro de envases pendientes de entregas anteriores.
   * Resuelve la alerta activa una sola vez, conservando el registro como historial.
   */
  registrarRetiroChofer(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return 0;

    const registros = this.state.registrosEnvases.filter(r => r.clienteId === pedido.clienteId && r.estado === 'pendiente');
    const total = registros.reduce((acc, r) => acc + r.cantidad, 0);
    registros.forEach(r => {
      r.estado = 'retirado';
      r.fechaResolucion = ahoraISO();
    });

    // Los vacíos retirados suben al furgón
    this.state.turnoActivo.botellonesCargados += total;
    this.sincronizarInventario();
    return total;
  }

  reportarIncidenciaChofer(
    pedidoId: string,
    tipo: 'pendiente' | 'ausente' | 'roto',
    detalle: string,
    opciones: { cantidad?: number; aceptacionCliente?: boolean } = {}
  ) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    if (tipo === 'roto' && !opciones.aceptacionCliente) {
      throw new Error('La entrega parcial requiere informar al cliente y registrar su aceptación.');
    }

    pedido.incidencia = {
      tipo,
      detalle,
      fecha: new Date().toLocaleTimeString('es-CL'),
      resuelto: false
    };

    const turno = this.state.turnoActivo;

    if (tipo === 'pendiente') {
      // Se entregó el agua pero el cliente no devolvió el vacío -> registro con fecha en ficha cliente
      const n = Math.min(Math.max(1, opciones.cantidad ?? 1), pedido.cantidadBidones);
      pedido.estado = 'entregado';
      pedido.cantidadEntregada = pedido.cantidadBidones;
      pedido.envasesNoDevueltos = n;
      turno.botellonesCargados = Math.max(0, turno.botellonesCargados - n);
      this.state.registrosEnvases.push({
        id: `env-${Date.now()}`,
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

    this.sincronizarInventario();
  }

  // Ausencia: volver hoy (sigue en la ruta) o reprogramar para mañana (vuelve a la cola de despacho)
  reprogramarAusente(pedidoId: string, cuando: 'hoy' | 'manana') {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const turno = this.state.turnoActivo;
    if (!pedido || pedido.estado !== 'ausente') return;

    if (pedido.incidencia) pedido.incidencia.resuelto = true;

    if (cuando === 'hoy') {
      pedido.estado = 'en_despacho';
      pedido.promesaEntrega = 'Hoy (reintento)';
    } else {
      pedido.estado = 'pagado';
      pedido.promesaEntrega = 'Mañana (reprogramado)';
      turno.pedidosIds = turno.pedidosIds.filter(id => id !== pedidoId);
      turno.botellonesCargados = Math.max(0, turno.botellonesCargados - pedido.cantidadBidones);
      this.state.inventario.llenosCentral += pedido.cantidadBidones;
    }
    this.sincronizarInventario();
  }

  // Saldo de un parcial: pasa al turno siguiente con el pago original (sin nuevo cobro)
  programarSaldoParcial(pedidoId: string) {
    const original = this.state.pedidos.find(p => p.id === pedidoId);
    if (!original || original.estado !== 'parcial' || original.saldoProgramado) return;

    const saldo = original.cantidadBidones - (original.cantidadEntregada ?? original.cantidadBidones);
    if (saldo <= 0) return;

    original.saldoProgramado = true;
    this.state.pedidos.unshift({
      ...clonar(original),
      id: `ped-${Date.now()}`,
      codigo: `${original.codigo}-S`,
      cantidadBidones: saldo,
      total: 0,
      estado: 'pagado',
      fechaCreacion: ahoraISO(),
      promesaEntrega: 'Próximo turno (saldo pagado)',
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
  liquidarRetornoFurgonCentral() {
    const turno = this.state.turnoActivo;
    const pedidos = this.state.pedidos.filter(p => turno.pedidosIds.includes(p.id));

    // Llenos que vuelven: ausentes y paradas no visitadas
    const pedidosConLlenos = pedidos.filter(p => p.estado === 'ausente' || p.estado === 'en_despacho');
    const llenosNoEntregados = pedidosConLlenos.reduce((sum, p) => sum + p.cantidadBidones, 0);

    // Todo lo demás a bordo son vacíos (intercambiados o retirados)
    const vaciosRecolectados = Math.max(0, turno.botellonesCargados - llenosNoEntregados);

    this.state.inventario.vaciosCentral += vaciosRecolectados;
    this.state.inventario.llenosCentral += Math.min(llenosNoEntregados, turno.botellonesCargados);

    // Los no entregados vuelven a la cola de despacho con su pago original
    pedidosConLlenos.forEach(p => {
      p.estado = 'pagado';
      p.promesaEntrega = 'Mañana (reprogramado)';
      if (p.incidencia) p.incidencia.resuelto = true;
    });

    // Furgón descarga por completo al finalizar su turno
    turno.botellonesCargados = 0;
    turno.pedidosIds = [];
    turno.estado = 'finalizado';

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
    this.sincronizarInventario();
  }

  cambiarCapacidadVehiculo(vehiculoId: string, nuevaCapacidad: number) {
    const vehiculo = this.state.vehiculos.find(v => v.id === vehiculoId);
    if (vehiculo) {
      vehiculo.capacidadMax = nuevaCapacidad;
      if (this.state.turnoActivo.vehiculoId === vehiculoId) {
        this.state.turnoActivo.capacidadMax = nuevaCapacidad;
      }
      this.guardarEnLocalStorage();
    }
  }

  resetDemoData() {
    localStorage.removeItem(STORAGE_KEY);
    this.state.clientes = clonar(clientesIniciales);
    this.state.pedidos = clonar(pedidosIniciales);
    this.state.vehiculos = clonar(vehiculosIniciales);
    this.state.cuentasBancarias = clonar(cuentasBancariasIniciales);
    this.state.registrosEnvases = clonar(registrosEnvasesIniciales);
    this.state.turnoActivo = clonar(turnoActivoInicial);
    this.state.inventario = clonar(inventarioInicial);
    this.state.notificacionRotacion = null;
    this.sincronizarInventario();
  }
}

export const appStore = new AppStore();
