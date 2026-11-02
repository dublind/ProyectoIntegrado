import { reactive, computed } from 'vue';
import type { Cliente, Pedido, Vehiculo, TurnoDespacho, CuentaBancaria, InventarioBodega, MedioPago, EstadoPedido } from '../types';
import { api, event, type User, type State, type Row } from '../services/api';
import { queue } from '../services/offline';

// Medio elegido al crear el pedido, mientras aún no existe un pago que lo registre en la base
const MEDIOS_KEY = 'agua_purificada_medios';

const ESTADOS: Record<string, EstadoPedido> = {
  Pendiente: 'pendiente_pago',
  Confirmado: 'pendiente_pago',
  'En preparacion': 'pagado',
  Pagado: 'pagado',
  'En reparto': 'en_despacho',
  Entregado: 'entregado',
  Parcial: 'parcial',
  Ausente: 'ausente',
  Cancelado: 'cancelado'
};

const ESTADOS_PARADA: Record<string, EstadoPedido> = {
  planificada: 'en_despacho',
  en_ruta: 'en_despacho',
  entregada: 'entregado',
  parcial: 'parcial',
  ausente: 'ausente'
};

const ROLES: Record<User['rol'], { rol: string; avatar: string }> = {
  administrador: { rol: 'Administrador / Dueño', avatar: '👔' },
  administrativo: { rol: 'Secretaría / Ventas', avatar: '📋' },
  chofer: { rol: 'Repartidor en terreno', avatar: '🚚' }
};

const normalizar = (texto: unknown) => String(texto ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const soloDigitos = (telefono: unknown) => String(telefono ?? '').replace(/[\s()-]/g, '');

function leerMedios(): Record<string, MedioPago> {
  try {
    return JSON.parse(localStorage.getItem(MEDIOS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function guardarMedio(pedidoId: number, medio: MedioPago) {
  try {
    localStorage.setItem(MEDIOS_KEY, JSON.stringify({ ...leerMedios(), [pedidoId]: medio }));
  } catch {
    // Solo es una preferencia de pantalla; el pago real queda en la base.
  }
}

class AppStore {
  state = reactive({
    usuario: null as User | null,
    datos: null as State | null,
    cargando: false,
    notificacionRotacion: null as string | null,
    modoOffline: false,
    pendientesSync: 0
  });

  // Datos crudos del backend con valores vacíos mientras no hay sesión
  private get datos(): State {
    return this.state.datos ?? {
      user: this.state.usuario as User, clientes: [], direcciones: [], pedidos: [], pagos: [],
      inventario: [], retornos: [], vehiculos: [], turno: null, paradas: [], reportes: [],
      cuentas: [], auditoria: [], inconsistencias: [], modo: 'local'
    };
  }

  rol = computed(() => this.state.usuario?.rol ?? null);

  usuarioActual = computed(() => {
    const u = this.state.usuario;
    return u ? { nombre: u.nombre, ...ROLES[u.rol] } : { nombre: '', rol: '', avatar: '' };
  });

  // Retiros pendientes (envases que el chofer debe pasar a buscar) por cliente
  private retirosPorCliente = computed(() => {
    const mapa = new Map<number, number>();
    for (const r of this.datos.retornos) {
      mapa.set(r.cliente_id, (mapa.get(r.cliente_id) ?? 0) + Number(r.cantidad));
    }
    return mapa;
  });

  private ultimoPagoPorPedido = computed(() => {
    const mapa = new Map<number, Row>();
    for (const pago of this.datos.pagos) {
      const actual = mapa.get(pago.id_pedido);
      if (pago.estado !== 'RECHAZADO' && (!actual || pago.id_pago > actual.id_pago)) mapa.set(pago.id_pedido, pago);
    }
    return mapa;
  });

  private paradaPorPedido = computed(() => new Map(this.datos.paradas.map(p => [p.pedido_id, p])));

  private medioDe(pedidoId: number): MedioPago {
    const pago = this.ultimoPagoPorPedido.value.get(pedidoId);
    if (pago) return pago.medio === 'WEBPAY' ? 'webpay' : 'transferencia';
    return leerMedios()[pedidoId] ?? 'transferencia';
  }

  private incidenciaDe(parada: Row | undefined): Pedido['incidencia'] {
    if (!parada) return undefined;
    const base = { fecha: '', resuelto: false };
    if (parada.estado === 'ausente') return { ...base, tipo: 'ausente', detalle: 'Cliente ausente en la visita' };
    if (parada.rotos > 0) return { ...base, tipo: 'roto', detalle: `${parada.rotos} botellón(es) roto(s) en trayecto` };
    if (['entregada', 'parcial'].includes(parada.estado) && parada.vacios < parada.entregados) {
      return { ...base, tipo: 'pendiente', detalle: `${parada.entregados - parada.vacios} envase(s) por retirar` };
    }
    return undefined;
  }

  private desdeParada(parada: Row, pedido?: Row): Pedido {
    const retiro = this.retirosPorCliente.value.get(parada.id_cliente) ?? Number(parada.retiro_pendiente ?? 0);
    const precio = Number(pedido?.precio_unitario ?? 0);
    return {
      id: String(parada.pedido_id),
      codigo: `PED-${parada.pedido_id}`,
      clienteId: String(parada.id_cliente),
      clienteNombre: parada.nombre,
      telefono: parada.telefono,
      direccion: `${parada.calle} ${parada.numero ?? ''}`.trim(),
      comuna: parada.comuna,
      cantidadBidones: parada.cantidad,
      tipoProducto: parada.tipo_producto,
      precioUnitario: precio,
      total: precio * parada.cantidad,
      estado: ESTADOS_PARADA[parada.estado] ?? 'en_despacho',
      medioPago: this.medioDe(parada.pedido_id),
      fechaCreacion: '',
      promesaEntrega: 'Mañana',
      tieneAlertaDeuda: retiro > 0,
      deudaEnvasesPendiente: retiro,
      incidencia: this.incidenciaDe(parada),
      paradaId: parada.id,
      autorizacion: parada.autorizacion
    };
  }

  private desdePedido(p: Row): Pedido {
    const parada = this.paradaPorPedido.value.get(p.id_pedido);
    const retiro = this.retirosPorCliente.value.get(p.id_cliente) ?? 0;
    const pago = this.ultimoPagoPorPedido.value.get(p.id_pedido);
    let estado = ESTADOS[p.nombre_estado] ?? 'pendiente_pago';
    if (parada && ['planificada', 'en_ruta'].includes(parada.estado)) estado = 'en_despacho';
    return {
      id: String(p.id_pedido),
      codigo: `PED-${p.id_pedido}`,
      clienteId: String(p.id_cliente),
      clienteNombre: p.nombre,
      telefono: p.telefono,
      direccion: `${p.calle} ${p.numero ?? ''}`.trim(),
      comuna: p.comuna,
      cantidadBidones: p.cantidad,
      tipoProducto: p.tipo_producto,
      precioUnitario: Number(p.precio_unitario),
      total: Number(p.precio_unitario) * p.cantidad,
      estado,
      medioPago: this.medioDe(p.id_pedido),
      fechaCreacion: p.fecha_creacion ? new Date(p.fecha_creacion).toLocaleString('es-CL') : '',
      promesaEntrega: 'Mañana',
      comprobanteTransferencia: pago?.medio === 'TRANSFERENCIA' ? pago.comprobante : undefined,
      tieneAlertaDeuda: p.autorizacion === 'PENDIENTE' || retiro > 0,
      deudaEnvasesPendiente: retiro,
      incidencia: this.incidenciaDe(parada),
      paradaId: parada?.id,
      pagado: Number(p.pagado),
      autorizacion: p.autorizacion
    };
  }

  clientes = computed<Cliente[]>(() => this.datos.clientes.filter(c => c.activo !== false).map(c => {
    const direccion = this.datos.direcciones.find(d => d.id_cliente === c.id_cliente && d.activo !== false);
    const ultimo = this.datos.pedidos.find(p => p.id_cliente === c.id_cliente);
    return {
      id: String(c.id_cliente),
      nombre: c.nombre,
      telefono: c.telefono,
      direccion: direccion ? `${direccion.calle} ${direccion.numero ?? ''}`.trim() : '',
      comuna: direccion?.comuna ?? '',
      deudaEnvases: this.retirosPorCliente.value.get(c.id_cliente) ?? 0,
      ultimoPedido: ultimo
        ? { cantidadBidones: ultimo.cantidad, tipoProducto: ultimo.tipo_producto, fecha: String(ultimo.fecha_creacion ?? '') }
        : undefined
    };
  }));

  pedidos = computed<Pedido[]>(() => this.datos.pedidos.map(p => this.desdePedido(p)));

  turnoActivo = computed<TurnoDespacho>(() => {
    const t = this.datos.turno;
    const vehiculo = this.datos.vehiculos.find(v => v.id === t?.vehiculo_id);
    return {
      id: t ? String(t.id) : '',
      fecha: t?.fecha ?? '',
      turno: t?.nombre ?? 'sin abrir',
      vehiculoId: t?.vehiculo_id ? String(t.vehiculo_id) : '',
      choferNombre: t?.chofer ?? '',
      pedidosIds: this.datos.paradas.map(p => String(p.pedido_id)),
      capacidadMax: vehiculo?.capacidad ?? 0,
      botellonesCargados: this.datos.paradas.reduce((n, p) => n + p.cantidad, 0),
      estado: t?.estado ?? 'sin_turno'
    };
  });

  vehiculos = computed<Vehiculo[]>(() => this.datos.vehiculos.filter(v => v.activo).map(v => ({
    id: String(v.id),
    patente: v.patente,
    modelo: v.modelo,
    capacidadMax: v.capacidad,
    choferAsignado: this.datos.turno?.vehiculo_id === v.id ? String(this.datos.turno?.chofer) : 'Sin turno asignado',
    activo: v.activo
  })));

  cuentasBancarias = computed<CuentaBancaria[]>(() => this.datos.cuentas.map(c => ({
    id: String(c.id),
    banco: c.nombre,
    tipoCuenta: 'Cuenta',
    numeroCuenta: c.numero,
    titular: '',
    rut: '',
    email: '',
    comprobantesProcesados: c.comprobantes,
    activa: c.activa
  })));

  inventario = computed<InventarioBodega>(() => {
    const saldo = (categoria: string) => Number(this.datos.inventario.find(i => i.categoria === categoria)?.cantidad ?? 0);
    const retornos = this.datos.retornos;
    return {
      llenosCentral: saldo('LLENO'),
      vaciosCentral: saldo('VACIO'),
      enTransito: saldo('TRANSITO'),
      pendientesDevolucion: retornos.reduce((n, r) => n + Number(r.cantidad), 0),
      rotosBodega: saldo('ROTO'),
      noRetornaron30d: retornos.filter(r => r.estado === 'no_retornaron').reduce((n, r) => n + Number(r.cantidad), 0),
      bajasDefinitivas60d: 0
    };
  });

  cuentaActiva = computed<CuentaBancaria>(() => this.cuentasBancarias.value.find(c => c.activa) ?? this.cuentasBancarias.value[0] ?? {
    id: '', banco: 'Sin cuenta configurada', tipoCuenta: '', numeroCuenta: '', titular: '', rut: '', email: '', comprobantesProcesados: 0, activa: false
  });

  totalStockContinuo = computed(() => {
    const inv = this.inventario.value;
    return inv.llenosCentral + inv.vaciosCentral + inv.enTransito + inv.pendientesDevolucion + inv.rotosBodega;
  });

  // Paradas del turno activo; el chofer solo recibe las de su ruta
  pedidosDespachoActivo = computed<Pedido[]>(() => {
    const pedidos = new Map(this.datos.pedidos.map(p => [p.id_pedido, p]));
    return this.datos.paradas.map(parada => this.desdeParada(parada, pedidos.get(parada.pedido_id)));
  });

  // Pagados por completo, autorizados y con bidones aún por entregar fuera del turno activo
  pedidosPorAsignar = computed<Pedido[]>(() => this.pedidos.value.filter(p =>
    p.estado !== 'cancelado' &&
    p.estado !== 'en_despacho' &&
    p.estado !== 'entregado' &&
    p.autorizacion !== 'PENDIENTE' &&
    (p.pagado ?? 0) >= p.total
  ));

  alertasPendientesCount = computed(() => this.pedidos.value.filter(p => p.tieneAlertaDeuda).length);

  // Sesión
  async iniciarSesion(username: string, password: string) {
    this.state.usuario = await api<User>('/auth/login', 'POST', { username, password });
    await this.cargar();
  }

  async restaurarSesion() {
    try {
      this.state.usuario = await api<User>('/auth/me');
      await this.cargar();
    } catch {
      this.state.usuario = null;
    }
  }

  async cerrarSesion() {
    await api('/auth/logout', 'POST', {});
    await queue.clear();
    this.state.usuario = null;
    this.state.datos = null;
  }

  async cargar() {
    this.state.cargando = true;
    try {
      this.state.datos = await api<State>('/state');
      this.state.pendientesSync = (await queue.all()).length;
    } finally {
      this.state.cargando = false;
    }
  }

  // Acciones Administrativo (Tarea #48)
  async crearPedido(datos: {
    clienteId?: string;
    nombre: string;
    telefono: string;
    direccion: string;
    comuna: string;
    cantidadBidones: number;
    tipoProducto: string;
    medioPago: MedioPago;
  }) {
    let cliente: Row | undefined = this.datos.clientes.find(c =>
      (datos.clienteId && String(c.id_cliente) === datos.clienteId) || soloDigitos(c.telefono) === soloDigitos(datos.telefono)
    );
    if (!cliente) {
      cliente = await api('/clients', 'POST', { nombre: datos.nombre, telefono: datos.telefono });
    }
    const idCliente = cliente!.id_cliente as number;
    let direccion: Row | undefined = this.datos.direcciones.find(d =>
      d.id_cliente === idCliente &&
      d.activo !== false &&
      normalizar(`${d.calle} ${d.numero ?? ''}`) === normalizar(datos.direccion) &&
      normalizar(d.comuna) === normalizar(datos.comuna)
    );
    if (!direccion) {
      direccion = await api('/addresses', 'POST', { id_cliente: idCliente, calle: datos.direccion, numero: '', comuna: datos.comuna });
    }
    const pedido = await api('/orders', 'POST', {
      id_cliente: idCliente,
      id_direccion: direccion!.id_direccion,
      cantidad: datos.cantidadBidones,
      tipo_producto: datos.tipoProducto
    });
    guardarMedio(pedido.id_pedido, datos.medioPago);
    await this.cargar();
    return pedido;
  }

  // Registra el pago por el saldo y lo confirma; en local Webpay es una simulación explícita
  private async registrarPago(pedidoId: string, medio: 'WEBPAY' | 'TRANSFERENCIA', comprobante?: string) {
    const pedido = this.pedidos.value.find(p => p.id === pedidoId);
    if (!pedido) throw new Error('Pedido no encontrado');
    const cuentaAntes = this.cuentaActiva.value;
    const pago = await api('/payments', 'POST', {
      id_pedido: Number(pedidoId),
      medio,
      monto: pedido.total - (pedido.pagado ?? 0),
      comprobante,
      evento: event()
    });
    await api(`/payments/${pago.id_pago}/validate`, 'POST', { estado: 'CONFIRMADO' });
    await this.cargar();
    const cuentaDespues = this.cuentaActiva.value;
    if (medio === 'TRANSFERENCIA' && cuentaAntes.id && cuentaDespues.id !== cuentaAntes.id) {
      this.state.notificacionRotacion = `La cuenta ${cuentaAntes.banco} alcanzó 45 comprobantes. Se conmutó automáticamente a ${cuentaDespues.banco} (${cuentaDespues.numeroCuenta}).`;
    }
  }

  simularPagoWebpay(pedidoId: string) {
    return this.registrarPago(pedidoId, 'WEBPAY');
  }

  validarTransferenciaManual(pedidoId: string, archivoComprobante = 'comprobante_transferencia.jpg') {
    return this.registrarPago(pedidoId, 'TRANSFERENCIA', archivoComprobante);
  }

  async autorizarPedido(pedidoId: string, decision: 'CON_RETORNO' | 'SIN_RETORNO', motivo: string) {
    await api(`/orders/${pedidoId}/authorize`, 'POST', { decision, motivo });
    await this.cargar();
  }

  // Despacho: el turno se abre, recibe un vehículo y sale a ruta
  async abrirTurno(chofer = 'chofer') {
    const hora = new Date().getHours();
    await api('/turns', 'POST', {
      fecha: new Date().toLocaleDateString('en-CA'),
      nombre: hora < 13 ? 'Mañana' : 'Tarde',
      chofer,
      vehiculo_id: this.vehiculos.value[0] ? Number(this.vehiculos.value[0].id) : null
    });
    await this.cargar();
  }

  async asignarVehiculoTurno(vehiculoId: string) {
    await api(`/turns/${this.turnoActivo.value.id}/vehicle`, 'POST', { vehiculo_id: Number(vehiculoId) });
    await this.cargar();
  }

  async iniciarRuta() {
    await api(`/turns/${this.turnoActivo.value.id}/start`, 'POST', {});
    await this.cargar();
  }

  async asignarPedidoADespacho(pedidoId: string) {
    const turno = this.turnoActivo.value;
    if (turno.estado !== 'preparacion') {
      throw new Error('Abre un turno en preparación antes de asignar pedidos a la ruta.');
    }
    await api(`/orders/${pedidoId}/enqueue`, 'POST', {});
    await this.cargar();
    if (!this.turnoActivo.value.pedidosIds.includes(pedidoId)) {
      const pedido = this.pedidos.value.find(p => p.id === pedidoId);
      throw new Error(
        `No se pudo asignar ${pedido?.codigo ?? 'el pedido'}: revisa que esté pagado y autorizado, ` +
        `que haya stock de llenos y que no exceda la capacidad del furgón (${this.turnoActivo.value.botellonesCargados} / ${this.turnoActivo.value.capacidadMax}).`
      );
    }
  }

  // Acciones Chofer (Tarea #49). Sin conexión, la entrega queda en cola y se confirma al sincronizar.
  private async registrarEntrega(pedido: Pedido, cuerpo: Record<string, unknown>, estadoLocal: string) {
    if (!pedido.paradaId || !this.state.usuario) throw new Error('La parada no pertenece al turno activo');
    const body = { ...cuerpo, evento: event() };
    const path = `/stops/${pedido.paradaId}/deliver`;
    if (this.state.modoOffline || !navigator.onLine) {
      await queue.add({ id: body.evento, username: this.state.usuario.username, path, body });
      const parada = this.datos.paradas.find(p => p.id === pedido.paradaId);
      if (parada) Object.assign(parada, { estado: estadoLocal, entregados: cuerpo.entregados ?? 0, vacios: cuerpo.vacios ?? 0, rotos: cuerpo.rotos ?? 0 });
      this.state.pendientesSync = (await queue.all()).length;
      return;
    }
    await api(path, 'POST', body);
    await this.cargar();
  }

  confirmarEntregaChofer(pedido: Pedido) {
    const n = pedido.cantidadBidones;
    return this.registrarEntrega(pedido, { entregados: n, vacios: n }, 'entregada');
  }

  reportarIncidenciaChofer(pedido: Pedido, tipo: 'pendiente' | 'ausente' | 'roto', detalle: string) {
    const n = pedido.cantidadBidones;
    if (tipo === 'ausente') return this.registrarEntrega(pedido, { ausente: true }, 'ausente');
    if (tipo === 'pendiente') return this.registrarEntrega(pedido, { entregados: n, vacios: 0 }, 'entregada');
    return this.registrarEntrega(
      pedido,
      { entregados: n - 1, vacios: n - 1, rotos: 1, aceptacion_parcial: true, detalle },
      'parcial'
    );
  }

  async sincronizarCola() {
    const usuario = this.state.usuario;
    if (!usuario) return;
    for (const item of await queue.all()) {
      if (item.username !== usuario.username) continue;
      await api(item.path, 'POST', item.body);
      await queue.remove(item.id);
    }
    await this.cargar();
  }

  async cambiarModoOffline(offline: boolean) {
    this.state.modoOffline = offline;
    if (!offline) await this.sincronizarCola();
  }

  // Cierre del turno: clasifica los rotos reportados y descarga el furgón a bodega
  async liquidarRetornoFurgonCentral() {
    for (const reporte of this.datos.reportes.filter(r => !r.clasificado)) {
      await api(`/inventory/${reporte.id}/classify`, 'POST', {});
    }
    await api(`/turns/${this.turnoActivo.value.id}/close`, 'POST', {});
    await this.cargar();
  }

  sincronizarInventario() {
    return this.cargar();
  }

  // Exclusivo administrador: llenado en planta y baja física de rotos
  async sanitizarYRecargar(cantidad = 20) {
    await api('/inventory/0/fill', 'POST', { cantidad: Math.min(this.inventario.value.vaciosCentral, cantidad), evento: event() });
    await this.cargar();
  }

  // El roto puede estar en la bodega de rotos (reporte del chofer) o en la bodega principal
  async autorizarBajaRotoAdmin(cantidad = 1) {
    const baja = (origen: 'ROTOS' | 'BODEGA') => api('/inventory/0/writeoff', 'POST', {
      cantidad,
      origen,
      motivo: 'Inspección física y baja autorizada por el administrador',
      revisado: true,
      eliminado: true,
      evento: event()
    });
    try {
      await baja('ROTOS');
    } catch (err) {
      if (!(err instanceof Error) || err.message !== 'Stock insuficiente') throw err;
      await baja('BODEGA');
    }
    await this.cargar();
  }
}

export const appStore = new AppStore();
