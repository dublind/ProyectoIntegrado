import { reactive, computed } from 'vue';
import type {
  Cliente,
  Pedido,
  Vehiculo,
  TurnoDespacho,
  CuentaBancaria,
  InventarioBodega,
  MedioPago,
  RegistroRotura,
  NotificacionInterna
} from '../types';

const STORAGE_KEY = 'agua_purificada_mvp_store';

const clientesIniciales: Cliente[] = [
  {
    id: 'cli-1',
    nombre: 'Carolina Valenzuela',
    telefono: '+56 9 8765 4321',
    direccion: 'Av. Providencia 1245, Depto 602',
    comuna: 'Providencia',
    deudaEnvases: 0,
    ultimoPedido: {
      cantidadBidones: 2,
      tipoProducto: 'Agua Purificada 20L Sellada',
      fecha: '2026-10-02'
    }
  },
  {
    id: 'cli-2',
    nombre: 'Estudio Jurídico & Asociados',
    telefono: '+56 9 7654 3210',
    direccion: 'Ahumada 341, Of. 804',
    comuna: 'Santiago Centro',
    deudaEnvases: 1, // Tiene un botellón pendiente
    ultimoPedido: {
      cantidadBidones: 4,
      tipoProducto: 'Agua Purificada 20L Sellada',
      fecha: '2026-09-28'
    }
  },
  {
    id: 'cli-3',
    nombre: 'Gonzalo Morales',
    telefono: '+56 9 9123 4567',
    direccion: 'Los Leones 2341, Casa B',
    comuna: 'Providencia',
    deudaEnvases: 0,
    ultimoPedido: {
      cantidadBidones: 1,
      tipoProducto: 'Agua Purificada 20L Sellada',
      fecha: '2026-10-04'
    }
  },
  {
    id: 'cli-4',
    nombre: 'Panadería y Café El Molino',
    telefono: '+56 9 6543 2109',
    direccion: 'Av. Irarrázaval 3820',
    comuna: 'Ñuñoa',
    deudaEnvases: 2, // Deuda de 2 envases
    ultimoPedido: {
      cantidadBidones: 3,
      tipoProducto: 'Agua Purificada 20L Sellada',
      fecha: '2026-09-15'
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
    cantidadBidones: 2,
    tipoProducto: 'Agua Purificada 20L Sellada',
    precioUnitario: 3500,
    total: 7000,
    estado: 'en_despacho',
    medioPago: 'webpay',
    fechaCreacion: '2026-10-06 09:30',
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
    cantidadBidones: 4,
    tipoProducto: 'Agua Purificada 20L Sellada',
    precioUnitario: 3500,
    total: 14000,
    estado: 'en_despacho',
    medioPago: 'transferencia',
    fechaCreacion: '2026-10-06 10:15',
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
    cantidadBidones: 1,
    tipoProducto: 'Agua Purificada 20L Sellada',
    precioUnitario: 3500,
    total: 3500,
    estado: 'en_despacho',
    medioPago: 'webpay',
    fechaCreacion: '2026-10-06 11:40',
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
    cantidadBidones: 3,
    tipoProducto: 'Agua Purificada 20L Sellada',
    precioUnitario: 3500,
    total: 10500,
    estado: 'pendiente_pago',
    medioPago: 'transferencia',
    fechaCreacion: '2026-10-06 14:20',
    promesaEntrega: 'Mañana',
    tieneAlertaDeuda: true,
    deudaEnvasesPendiente: 2
  }
];

const turnoActivoInicial: TurnoDespacho = {
  id: 'turno-1',
  fecha: '2026-10-07',
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
  pendientesDevolucion: 3, // Estudio Jurídico (1) + Panadería (2) = 3
  rotosBodega: 4, // Botellones rotos esperando baja de Erick
  noRetornaron30d: 2,
  bajasDefinitivas60d: 5
};

function crearRegistrosRoturasPrevias(cantidad: number): RegistroRotura[] {
  return Array.from({ length: Math.max(0, cantidad) }, (_, index) => ({
    id: `rotura-previa-${index + 1}`,
    pedidoId: '',
    codigoPedido: 'Registro previo',
    clienteNombre: 'Sin detalle disponible',
    producto: 'Agua Purificada 20L Sellada',
    cantidad: 1,
    detalle: 'Merma inicial de datos demo sin detalle individual.',
    fecha: '2026-10-06T00:00:00.000Z',
    estado: 'pendiente_baja'
  }));
}

class AppStore {
  state = reactive({
    clientes: [...clientesIniciales],
    pedidos: [...pedidosIniciales],
    vehiculos: [...vehiculosIniciales],
    cuentasBancarias: [...cuentasBancariasIniciales],
    turnoActivo: { ...turnoActivoInicial },
    inventario: { ...inventarioInicial },
    roturasBodega: crearRegistrosRoturasPrevias(inventarioInicial.rotosBodega),
    notificacionesInternas: [] as NotificacionInterna[],
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
        const parsed = JSON.parse(data) as Partial<typeof this.state>;
        Object.assign(this.state, parsed);
        if (!Array.isArray(parsed.roturasBodega)) {
          this.state.roturasBodega = crearRegistrosRoturasPrevias(this.state.inventario.rotosBodega);
        } else {
          this.state.roturasBodega = this.state.roturasBodega.map(rotura => ({
            ...rotura,
            cantidad: Number.isInteger(rotura.cantidad) && rotura.cantidad > 0 ? rotura.cantidad : 1
          }));
        }
        if (!Array.isArray(parsed.notificacionesInternas)) {
          this.state.notificacionesInternas = [];
        }
      }
    } catch (e) {
      console.warn('No se pudo cargar desde localStorage', e);
    }
  }

  /**
   * Sincronización continua de inventario con todos los módulos:
   * - En tránsito: exactamente igual a los botellones asignados en furgones de reparto.
   * - Pendientes: exactamente igual a la suma de envases adeudados por todos los clientes.
   */
  sincronizarInventario() {
    // 1. En tránsito se sincroniza con los botellones cargados en ruta
    this.state.inventario.enTransito = this.state.turnoActivo.botellonesCargados;

    // 2. Pendientes se sincroniza con la suma de deuda de todos los clientes
    const deudaTotalClientes = this.state.clientes.reduce((acc, c) => acc + (c.deudaEnvases || 0), 0);
    this.state.inventario.pendientesDevolucion = deudaTotalClientes;

    this.state.inventario.rotosBodega = this.state.roturasBodega
      .filter(rotura => rotura.estado === 'pendiente_baja')
      .reduce((total, rotura) => total + rotura.cantidad, 0);
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

  pedidosDespachoActivo = computed(() => {
    const ids = this.state.turnoActivo.pedidosIds;
    return this.state.pedidos.filter(p => ids.includes(p.id));
  });

  alertasPendientesCount = computed(() => {
    return this.state.pedidos.filter(p => p.tieneAlertaDeuda || p.incidencia?.tipo === 'pendiente').length;
  });
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

  registrarRoturaViaje(params: {
    pedidoId: string;
    cantidad: number;
    detalle: string;
    aceptaEntregaParcial: boolean;
  }) {
    const pedido = this.state.pedidos.find(p => p.id === params.pedidoId);
    if (!pedido || pedido.estado !== 'en_despacho') return;
    if (!Number.isInteger(params.cantidad) || params.cantidad <= 0) {
      throw new Error('La cantidad de botellones rotos debe ser un entero positivo.');
    }

    const fecha = new Date().toISOString();
    const eventoId = `${Date.now()}-${this.state.notificacionesInternas.length + 1}`;

    const nuevoReporte: RegistroRotura = {
      id: `rotura-viaje-${eventoId}`,
      pedidoId: pedido.id,
      codigoPedido: pedido.codigo,
      clienteNombre: pedido.clienteNombre,
      producto: pedido.tipoProducto,
      cantidad: params.cantidad,
      detalle: `${params.detalle}${params.aceptaEntregaParcial ? ' Entrega parcial aceptada.' : ''}`,
      fecha,
      estado: 'pendiente_baja'
    };
    this.state.roturasBodega.unshift(nuevoReporte);

    pedido.incidencia = {
      tipo: 'roto',
      detalle: params.detalle,
      fecha,
      resuelto: false
    };
    pedido.estado = 'parcial';
    pedido.tieneAlertaDeuda = params.aceptaEntregaParcial;
    this.state.turnoActivo.botellonesCargados = Math.max(
      0,
      this.state.turnoActivo.botellonesCargados - params.cantidad
    );

    this.agregarAvisosRotura(pedido.id, pedido.codigo, pedido.clienteNombre, params.cantidad, params.detalle, fecha, eventoId);
  }

  autorizarBajaFisica(reporteId: string) {
    const reporte = this.state.roturasBodega.find(r => r.id === reporteId);
    if (!reporte || reporte.estado !== 'pendiente_baja') return;
    const confirmar = confirm(`¿Confirmar inspección física y autorizar baja definitiva?`);

    if (confirmar) {
      reporte.estado = 'baja_definitiva';
      this.state.inventario.bajasDefinitivas60d += reporte.cantidad;
      this.sincronizarInventario();
    }
  }

  private agregarAvisosRotura(
    pedidoId: string,
    codigoPedido: string,
    clienteNombre: string,
    cantidad: number,
    detalle: string,
    fecha: string,
    eventoId: string
  ) {
    this.state.notificacionesInternas.unshift(
      {
        id: `notificacion-${eventoId}-administrador`,
        tipo: 'rotura',
        destinatario: 'administrador',
        pedidoId,
        clienteNombre,
        titulo: `Rotura informada en ${codigoPedido}`,
        mensaje: `Se registraron ${cantidad} botellón(es) dañado(s) en el trayecto. Detalle: ${detalle}`,
        fecha,
        leida: false
      },
      {
        id: `notificacion-${eventoId}-cliente`,
        tipo: 'rotura',
        destinatario: 'cliente',
        pedidoId,
        clienteNombre,
        titulo: `Novedad en tu pedido ${codigoPedido}`,
        mensaje: `Lamentamos informar que, debido a un incidente en ruta, reprogramaremos la entrega de ${cantidad} botellón(es) para el siguiente turno sin costo adicional.`,
        fecha,
        leida: false
      }
    );
    this.sincronizarInventario();
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
    let cliente = this.state.clientes.find(c => c.id === datos.clienteId || c.telefono === datos.telefono);
    if (!cliente) {
      cliente = {
        id: `cli-${Date.now()}`,
        nombre: datos.nombre,
        telefono: datos.telefono,
        direccion: datos.direccion,
        comuna: datos.comuna,
        deudaEnvases: 0
      };
      this.state.clientes.push(cliente);
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
      cantidadBidones: datos.cantidadBidones,
      tipoProducto: datos.tipoProducto,
      precioUnitario,
      total,
      estado: 'pendiente_pago',
      medioPago: datos.medioPago,
      fechaCreacion: new Date().toLocaleString('es-CL'),
      promesaEntrega: 'Mañana',
      tieneAlertaDeuda: cliente.deudaEnvases > 0,
      deudaEnvasesPendiente: cliente.deudaEnvases
    };

    if (datos.medioPago === 'webpay') {
      nuevoPedido.linkWebpay = `https://webpay.transbank.cl/p/tx-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    this.state.pedidos.unshift(nuevoPedido);
    
    cliente.ultimoPedido = {
      cantidadBidones: datos.cantidadBidones,
      tipoProducto: datos.tipoProducto,
      fecha: new Date().toISOString().split('T')[0]
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
        c.comprobantesProcesados = 0;
      }
    });

    const nueva = cuentas[siguienteIdx];
    this.state.notificacionRotacion = `¡Atención! La cuenta ${cuentas[idxActual].banco} alcanzó 45 comprobantes. Se conmutó automáticamente a ${nueva.banco}.`;
  }

  asignarPedidoADespacho(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const turno = this.state.turnoActivo;
    if (!pedido || turno.pedidosIds.includes(pedidoId)) return;

    const nuevaCarga = turno.botellonesCargados + pedido.cantidadBidones;
    if (nuevaCarga > turno.capacidadMax) {
      throw new Error(`Excede la capacidad máxima del furgón.`);
    }

    turno.pedidosIds.push(pedidoId);
    turno.botellonesCargados = nuevaCarga;
    pedido.estado = 'en_despacho';

    this.state.inventario.llenosCentral -= pedido.cantidadBidones;
    this.sincronizarInventario();
  }

  // Acciones Chofer (Tarea #49)
  confirmarEntregaChofer(pedidoId: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    pedido.estado = 'entregado';
    
    if (pedido.deudaEnvasesPendiente > 0) {
      const cliente = this.state.clientes.find(c => c.id === pedido.clienteId);
      if (cliente) {
        cliente.deudaEnvases = Math.max(0, cliente.deudaEnvases - 1);
      }
      pedido.tieneAlertaDeuda = false;
      pedido.deudaEnvasesPendiente = Math.max(0, pedido.deudaEnvasesPendiente - 1);
    }

    this.sincronizarInventario();
  }

  reportarIncidenciaChofer(pedidoId: string, tipo: 'pendiente' | 'ausente' | 'roto', detalle: string) {
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.estado !== 'en_despacho') return;

    const fecha = new Date().toISOString();

    pedido.incidencia = {
      tipo,
      detalle,
      fecha,
      resuelto: false
    };

    if (tipo === 'pendiente') {
      pedido.estado = 'entregado';
      const cliente = this.state.clientes.find(c => c.id === pedido.clienteId);
      if (cliente) {
        cliente.deudaEnvases += 1;
      }
      pedido.tieneAlertaDeuda = true;
      pedido.deudaEnvasesPendiente = (pedido.deudaEnvasesPendiente || 0) + 1;
      this.sincronizarInventario();
    } else if (tipo === 'ausente') {
      pedido.estado = 'ausente';
      this.sincronizarInventario();
    } else {
      this.registrarRoturaViaje({
        pedidoId,
        cantidad: 1,
        detalle,
        aceptaEntregaParcial: true
      });
    }
  }

  liquidarRetornoFurgonCentral() {
    const pedidos = this.state.pedidos.filter(p => this.state.turnoActivo.pedidosIds.includes(p.id));
    const vaciosRecolectados = pedidos
      .filter(p => p.estado === 'entregado' && p.incidencia?.tipo !== 'pendiente')
      .reduce((sum, p) => sum + p.cantidadBidones, 0);
    const llenosNoEntregados = pedidos
      .filter(p => p.estado === 'ausente')
      .reduce((sum, p) => sum + p.cantidadBidones, 0);

    this.state.inventario.vaciosCentral += vaciosRecolectados;
    this.state.inventario.llenosCentral += llenosNoEntregados;
    this.state.turnoActivo.botellonesCargados = 0;
    this.state.turnoActivo.pedidosIds = [];
    this.state.turnoActivo.estado = 'finalizado';
    this.sincronizarInventario();
  }

  sanitizarYRecargar(cantidad = 20) {
    const cantidadRecargada = Math.min(this.state.inventario.vaciosCentral, cantidad);
    if (cantidadRecargada <= 0) return;

    this.state.inventario.vaciosCentral -= cantidadRecargada;
    this.state.inventario.llenosCentral += cantidadRecargada;
    this.sincronizarInventario();
  }

  autorizarBajaRotoAdmin(cantidad = 1) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) return;

    let restante = cantidad;
    for (const rotura of this.state.roturasBodega) {
      if (rotura.estado !== 'pendiente_baja' || restante === 0) continue;

      const autorizada = Math.min(rotura.cantidad, restante);
      if (autorizada === rotura.cantidad) {
        rotura.estado = 'baja_definitiva';
      } else {
        rotura.cantidad -= autorizada;
        this.state.roturasBodega.push({
          ...rotura,
          id: `${rotura.id}-baja-${Date.now()}`,
          cantidad: autorizada,
          estado: 'baja_definitiva'
        });
      }
      restante -= autorizada;
      this.state.inventario.bajasDefinitivas60d += autorizada;
    }

    this.sincronizarInventario();
  }

  marcarNotificacionLeida(notificacionId: string) {
    const notificacion = this.state.notificacionesInternas.find(item => item.id === notificacionId);
    if (!notificacion) return;

    notificacion.leida = true;
    this.guardarEnLocalStorage();
  }

  cambiarCapacidadVehiculo(vehiculoId: string, nuevaCapacidad: number) {
    const vehiculo = this.state.vehiculos.find(item => item.id === vehiculoId);
    if (!vehiculo) return;

    vehiculo.capacidadMax = nuevaCapacidad;
    if (this.state.turnoActivo.vehiculoId === vehiculoId) {
      this.state.turnoActivo.capacidadMax = nuevaCapacidad;
    }
    this.guardarEnLocalStorage();
  }

  resetDemoData() {
    localStorage.removeItem(STORAGE_KEY);
    this.state.clientes = JSON.parse(JSON.stringify(clientesIniciales));
    this.state.pedidos = JSON.parse(JSON.stringify(pedidosIniciales));
    this.state.vehiculos = JSON.parse(JSON.stringify(vehiculosIniciales));
    this.state.cuentasBancarias = JSON.parse(JSON.stringify(cuentasBancariasIniciales));
    this.state.turnoActivo = JSON.parse(JSON.stringify(turnoActivoInicial));
    this.state.inventario = JSON.parse(JSON.stringify(inventarioInicial));
    this.state.roturasBodega = crearRegistrosRoturasPrevias(inventarioInicial.rotosBodega);
    this.state.notificacionesInternas = [];
    this.state.notificacionRotacion = null;
    this.sincronizarInventario();
  }
}
export const appStore = new AppStore();