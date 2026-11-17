import { computed, reactive } from 'vue';
import type { Actividad, MedioPago, Pedido, TurnoDespacho, Vehiculo } from '../types';
import { api, ApiError, event, type Row } from '../services/api';
import { queue } from '../services/offline';
import { BODEGA_CENTRAL, geocodificarSimulado, ordenarRutaLocal } from '../utils/geo';
import { optimizarOrden } from '../utils/rutas';
import { diasDesde, hoyISO } from '../utils/formato';
import { normalizarTelefono } from '../utils/validacion';
import { auditar, mapearEstado, type EstadoUI, type ResultadoAuditoria } from './mapeo';

export type { ResultadoAuditoria };

/**
 * Estado del panel y de la app del chofer. La fuente de verdad es la API (PostgreSQL):
 * cada acción llama a su endpoint y luego se vuelve a leer el estado. No hay datos de
 * demostración ni reglas de negocio duplicadas en el navegador (PBI 102).
 * - Lectura periódica para ver lo que hacen otros dispositivos (chofer ↔ oficina).
 * - El chofer puede seguir sin señal: sus acciones quedan en el teléfono (IndexedDB) y se
 *   envían al reconectar; cada una lleva un identificador de evento, así que no se duplican.
 */

export interface CargaFurgon {
  total: number; // envases a bordo
  llenos: number; // llenos aún por entregar
  vacios: number; // vacíos recogidos
  noDevueltos: number; // vacíos que el cliente no entregó (pendientes de devolución)
  rotos: number; // botellones rotos informados en el trayecto
}

const INTERVALO_MS = 4000;
const VACIA: CargaFurgon = { total: 0, llenos: 0, vacios: 0, noDevueltos: 0, rotos: 0 };

const nombreCorto = (v: Vehiculo) => v.modelo.replace(/\s*\(.*\)$/, '');
const idNum = (id: string) => Number(id);
const llenosDe = (p: Pedido) => (p.tipo === 'retiro' ? 0 : p.cantidadBidones);
const cupoDe = (p: Pedido) => (p.tipo === 'retiro' ? p.retiroEnvases ?? 0 : p.cantidadBidones);
const claveTexto = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
const digitos = (t: string) => t.replace(/\D/g, '').replace(/^56/, '');

function estadoVacio(): EstadoUI {
  return {
    clientes: [], pedidos: [], vehiculos: [], cuentasBancarias: [], registrosEnvases: [], roturasBodega: [],
    notificacionesInternas: [], turnos: [], paradas: {}, actividad: [], inconsistencias: [], rotosEnBodegaDeRotos: 0,
    inventario: { llenosCentral: 0, vaciosCentral: 0, enTransito: 0, pendientesDevolucion: 0, rotosBodega: 0, noRetornaron30d: 0, bajasDefinitivas60d: 0 }
  };
}

// Acción del chofer pendiente de enviar (sin conexión)
interface AccionPendiente {
  id: string;
  username: string;
  path: string;
  body: Row;
  orden: number;
  parche?: ParcheLocal;
}
// Cambio visible mientras la acción espera conexión (se vuelve a aplicar tras cada lectura)
interface ParcheLocal {
  turnoId?: string;
  pedidoId?: string;
  estadoParada?: Pedido['estado'];
  estadoTurno?: TurnoDespacho['estado'];
}

class AppStore {
  state = reactive({
    ...estadoVacio(),
    cargado: false,
    errorCarga: '',
    modoOffline: false,
    pendientesSincronizar: 0,
    actualizadoEn: ''
  });

  private usuario = '';
  private datosApi: Row = {};
  private temporizador: ReturnType<typeof setInterval> | undefined;
  private primeraCarga: Promise<void> | null = null;
  private ultimaActividad = -1;
  private oyentesRemotos: ((nuevas: Actividad[]) => void)[] = [];
  private pendientes: AccionPendiente[] = [];
  private rutasEnCalculo = new Set<string>();
  private leyendo: Promise<void> | null = null;

  // ==========================================================================
  // Lectura del servidor
  // ==========================================================================

  /** Empieza a leer el estado (y devuelve la primera lectura) para el usuario con sesión. */
  iniciar(username: string) {
    if (this.usuario !== username) {
      this.detener();
      this.usuario = username;
      this.primeraCarga = null;
    }
    if (!this.primeraCarga) {
      this.primeraCarga = this.recargar().catch(err => {
        this.state.errorCarga = (err as Error).message;
      });
      void this.cargarPendientes();
      if (typeof window !== 'undefined') {
        this.temporizador = setInterval(() => {
          if (document.visibilityState === 'visible') void this.recargar().catch(() => undefined);
        }, INTERVALO_MS);
        window.addEventListener('online', this.alReconectar);
        document.addEventListener('visibilitychange', this.alVolver);
      }
    }
    return this.primeraCarga;
  }

  detener() {
    clearInterval(this.temporizador);
    this.temporizador = undefined;
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.alReconectar);
      document.removeEventListener('visibilitychange', this.alVolver);
    }
    this.usuario = '';
    this.primeraCarga = null;
    this.ultimaActividad = -1;
    this.pendientes = [];
    Object.assign(this.state, estadoVacio(), { cargado: false, errorCarga: '', pendientesSincronizar: 0 });
  }

  private alReconectar = () => void this.sincronizarPendientes();
  private alVolver = () => {
    if (document.visibilityState === 'visible') void this.recargar().catch(() => undefined);
  };

  /** Lee el estado completo y lo traduce al modelo de la interfaz. */
  async recargar(): Promise<void> {
    if (this.state.modoOffline) return;
    if (this.leyendo) return this.leyendo;
    this.leyendo = (async () => {
      try {
        const datos = await api('/state');
        this.datosApi = datos;
        const mapeado = mapearEstado(datos, hoyISO());
        Object.assign(this.state, mapeado, { cargado: true, errorCarga: '', actualizadoEn: new Date().toISOString() });
        this.aplicarParches();
        this.avisarActividadRemota(datos.auditoria ?? []);
        void this.optimizarPendientes();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) this.detener();
        throw err;
      } finally {
        this.leyendo = null;
      }
    })();
    return this.leyendo;
  }

  // Lo que hace el chofer en su app aparece como aviso en el panel (y viceversa)
  private avisarActividadRemota(auditoria: Row[]) {
    const maximo = auditoria.reduce((m, a) => Math.max(m, Number(a.id)), 0);
    if (this.ultimaActividad >= 0) {
      const nuevas = this.state.actividad.filter(a => Number(a.id.slice(4)) > this.ultimaActividad);
      const ajenas = nuevas.filter(a => {
        const fila = auditoria.find(x => `aud-${x.id}` === a.id);
        return fila && fila.actor !== this.usuario;
      });
      if (ajenas.length) this.oyentesRemotos.forEach(fn => fn(ajenas));
    }
    this.ultimaActividad = maximo;
  }

  alRecibirActividadRemota(fn: (nuevas: Actividad[]) => void) {
    this.oyentesRemotos.push(fn);
  }

  // Ejecuta una acción en el servidor y vuelve a leer el estado
  private async enviar<T = Row>(path: string, body: unknown = {}, method = 'POST'): Promise<T> {
    if (this.state.modoOffline) throw new Error('Sin conexión: esta acción necesita internet.');
    const r = await api<T>(path, method, body);
    await this.recargar().catch(() => undefined);
    return r;
  }

  // ==========================================================================
  // Consultas
  // ==========================================================================

  cuentaActiva = computed(() => this.state.cuentasBancarias.find(c => c.activa) ?? this.state.cuentasBancarias[0] ?? {
    id: '', banco: 'Sin cuenta configurada', tipoCuenta: '', numeroCuenta: '—', titular: '', rut: '', email: '', comprobantesProcesados: 0, activa: false
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
    const p = this.state.pedidos.find(x => x.id === pedidoId);
    return p?.turnoId ? this.state.turnos.find(t => t.id === p.turnoId) : undefined;
  }

  // Paradas de un turno en el orden guardado; mientras no exista, orden local aproximado
  pedidosDeTurno(turno: TurnoDespacho) {
    const paradas = this.state.paradas[turno.id] ?? [];
    return turno.ordenParadas ? paradas : ordenarRutaLocal(paradas);
  }

  // Bidones comprometidos en el turno (cuenta contra la capacidad diaria del furgón)
  cargaPlanificada(turno: TurnoDespacho) {
    return (this.state.paradas[turno.id] ?? []).reduce((acc, p) => acc + cupoDe(p), 0);
  }

  // Lo que va a bordo según el libro de movimientos del turno
  cargaDeTurno(turno: TurnoDespacho): CargaFurgon {
    if (turno.estado !== 'en_ruta') return { ...VACIA };
    const paradas = this.state.paradas[turno.id] ?? [];
    const rotos = paradas.reduce((acc, p) => acc + (p.estado === 'parcial' ? p.cantidadBidones - (p.cantidadEntregada ?? p.cantidadBidones) : 0), 0);
    // Los rotos siguen físicamente a bordo hasta que la oficina los clasifica a la bodega de rotos
    const clasificados = this.state.roturasBodega
      .filter(r => r.estado !== 'por_clasificar' && paradas.some(p => p.id === r.pedidoId && p.estado === 'parcial'))
      .reduce((acc, r) => acc + r.cantidad, 0);
    const llenos = Math.max(0, (turno.llenosABordo ?? 0) - (rotos - clasificados));
    const vacios = turno.vaciosABordo ?? 0;
    const noDevueltos = paradas.reduce((acc, p) => acc + (p.envasesNoDevueltos ?? 0), 0);
    return { total: llenos + vacios, llenos, vacios, noDevueltos, rotos };
  }

  turnosDeHoy = computed(() => {
    const hoy = hoyISO();
    return this.state.turnos.filter(t => t.fecha === hoy);
  });

  // Todas las paradas de hoy (todos los furgones), en orden de visita por furgón
  paradasDeHoy = computed(() => this.turnosDeHoy.value.flatMap(t => this.pedidosDeTurno(t)));

  // Suma de lo que va a bordo de todos los furgones
  cargaFurgones = computed<CargaFurgon>(() => this.state.turnos.reduce((acc, t) => {
    const c = this.cargaDeTurno(t);
    return {
      total: acc.total + c.total, llenos: acc.llenos + c.llenos, vacios: acc.vacios + c.vacios,
      noDevueltos: acc.noDevueltos + c.noDevueltos, rotos: acc.rotos + c.rotos
    };
  }, { ...VACIA }));

  registrosPendientes = computed(() => this.state.registrosEnvases
    .filter(r => r.estado === 'pendiente')
    .map(r => ({ ...r, dias: diasDesde(r.fechaOrigen) }))
    .sort((a, b) => b.dias - a.dias));

  auditoria = computed<ResultadoAuditoria>(() => auditar(
    this.state,
    t => t.botellonesCargados,
    t => this.cargaPlanificada(t)
  ));

  alertasPendientesCount = computed(() => this.state.pedidos.filter(p => p.tieneAlertaDeuda || p.incidencia?.tipo === 'pendiente').length);

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

  buscarClientes(termino: string) {
    if (!termino.trim()) return [];
    const t = termino.toLowerCase();
    return this.state.clientes.filter(c =>
      c.nombre.toLowerCase().includes(t) || c.telefono.includes(t) || c.direccion.toLowerCase().includes(t));
  }

  obtenerHistorialCliente(clienteId: string) {
    return this.state.clientes.find(c => c.id === clienteId);
  }

  // Retiro abierto (aún no realizado) para un cliente
  retiroAbierto(clienteId: string) {
    return this.state.pedidos.find(p => p.tipo === 'retiro' && p.clienteId === clienteId &&
      ['pagado', 'programado', 'en_despacho', 'ausente'].includes(p.estado));
  }

  /** Otro pedido del mismo cliente ya planificado ese día en un turno abierto (para preferir ese furgón). */
  pedidoMismoDestino(pedido: Pedido, fecha: string) {
    const clave = claveTexto(`${pedido.direccion}|${pedido.comuna}`);
    for (const t of this.state.turnos) {
      if (t.fecha !== fecha || t.estado === 'finalizado') continue;
      const otro = (this.state.paradas[t.id] ?? []).find(p => p.id !== pedido.id &&
        (p.clienteId === pedido.clienteId || claveTexto(`${p.direccion}|${p.comuna}`) === clave));
      if (otro) return { turno: t, pedido: otro };
    }
    return undefined;
  }

  // ==========================================================================
  // Recorrido de cada turno en bodega (PBI 70)
  // ==========================================================================

  /** Calcula el recorrido más rápido de un turno en bodega (sale y vuelve a la bodega) y lo guarda. */
  async optimizarRuta(turnoId: string) {
    const turno = this.state.turnos.find(t => t.id === turnoId);
    const paradas = this.state.paradas[turnoId] ?? [];
    if (!turno || turno.estado !== 'preparacion' || !paradas.length) return;
    const firma = `${turnoId}:${paradas.map(p => p.id).sort().join(',')}`;
    if (this.rutasEnCalculo.has(firma)) return;
    this.rutasEnCalculo.add(firma);
    try {
      const r = await optimizarOrden(BODEGA_CENTRAL, paradas.map(p => ({ id: p.id, coords: p.coords ?? geocodificarSimulado(p.direccion, p.comuna) })));
      await api(`/turns/${turnoId}/route`, 'POST', { orden: r.orden.map(idNum), km: Math.round(r.km * 100) / 100, minutos: Math.round(r.minutos * 100) / 100, fuente: r.fuente });
      await this.recargar().catch(() => undefined);
    } catch {
      /* 409: las paradas cambiaron mientras se calculaba; la próxima lectura lo recalcula */
    } finally {
      this.rutasEnCalculo.delete(firma);
    }
  }

  // Turnos en bodega sin recorrido guardado (recién planificados o modificados)
  private async optimizarPendientes() {
    if (this.state.modoOffline) return;
    for (const t of this.state.turnos) {
      if (t.estado === 'preparacion' && !t.ordenParadas && (this.state.paradas[t.id] ?? []).length) {
        await this.optimizarRuta(t.id);
      }
    }
  }

  /** Orden de visita ajustado a mano por el planificador. */
  async ordenarParadasManual(turnoId: string, pedidosIds: string[]) {
    await this.enviar(`/turns/${turnoId}/route`, { orden: pedidosIds.map(idNum), fuente: 'manual' });
  }

  // ==========================================================================
  // Acciones del administrativo
  // ==========================================================================

  async crearPedido(datos: {
    clienteId?: string;
    nombre: string;
    telefono: string;
    direccion: string;
    comuna: string;
    cantidadBidones: number;
    tipoProducto: string;
    medioPago: MedioPago;
  }): Promise<Pedido> {
    const telefono = normalizarTelefono(datos.telefono) ?? datos.telefono.trim();
    const direccion = datos.direccion.trim();
    const comuna = datos.comuna.trim();
    const cliente = this.state.clientes.find(c => c.id === datos.clienteId) ??
      this.state.clientes.find(c => digitos(c.telefono) === digitos(telefono));
    let clienteId = cliente ? idNum(cliente.id) : 0;
    if (!clienteId) {
      const nuevo = await api('/clients', 'POST', { nombre: datos.nombre.trim(), telefono: telefono.replace(/\s/g, '') });
      clienteId = nuevo.id_cliente;
    }
    // Reutiliza la dirección si ya existe para el cliente; si cambió, queda la nueva como principal
    const existente = (this.datosApi.direcciones ?? []).find((d: Row) => d.id_cliente === clienteId && d.activo !== false &&
      claveTexto([d.calle, d.numero].filter(Boolean).join(' ')) === claveTexto(direccion) && claveTexto(d.comuna) === claveTexto(comuna));
    let direccionId = existente?.id_direccion;
    if (!direccionId) {
      const coords = geocodificarSimulado(direccion, comuna);
      const d = await api('/addresses', 'POST', { id_cliente: clienteId, calle: direccion, numero: '', comuna, latitud: coords.lat, longitud: coords.lng });
      direccionId = d.id_direccion;
    }
    const pedido = await this.enviar('/orders', {
      id_cliente: clienteId,
      id_direccion: direccionId,
      cantidad: datos.cantidadBidones,
      tipo_producto: datos.tipoProducto,
      medio_preferido: datos.medioPago === 'webpay' ? 'WEBPAY' : 'TRANSFERENCIA',
      con_recargo: true
    });
    return this.state.pedidos.find(p => p.id === String(pedido.id_pedido)) ?? ({ codigo: `PED-${pedido.id_pedido}` } as Pedido);
  }

  // Registra el pago por el saldo pendiente y lo confirma (libera el pedido a planificación)
  private async pagar(pedidoId: string, medio: 'WEBPAY' | 'TRANSFERENCIA', comprobante?: string) {
    const fila = (this.datosApi.pedidos ?? []).find((o: Row) => String(o.id_pedido) === pedidoId);
    if (!fila) throw new Error('Pedido no encontrado');
    const pedido = this.state.pedidos.find(p => p.id === pedidoId)!;
    const saldo = pedido.total - Number(fila.pagado ?? 0);
    if (saldo <= 0) return;
    const pago = await api('/payments', 'POST', { id_pedido: idNum(pedidoId), medio, monto: saldo, comprobante, evento: event() });
    await this.enviar(`/payments/${pago.id_pago}/validate`, { estado: 'CONFIRMADO' });
  }

  // Webpay real pendiente de Transbank (bug 95): se registra como simulación identificada
  simularPagoWebpay(pedidoId: string) {
    return this.pagar(pedidoId, 'WEBPAY');
  }

  // Todas las transferencias se abonan a la cuenta activa de la empresa
  validarTransferenciaManual(pedidoId: string, archivoComprobante = 'comprobante_transferencia.jpg') {
    return this.pagar(pedidoId, 'TRANSFERENCIA', archivoComprobante);
  }

  // Cliente con envases no retornados: el administrativo autoriza con o sin retorno (no suma stock)
  autorizarPedido(pedidoId: string, decision: 'CON_RETORNO' | 'SIN_RETORNO', motivo: string) {
    return this.enviar(`/orders/${pedidoId}/authorize`, { decision, motivo });
  }

  /** Planifica un pedido pagado en un furgón y un día (o lo mueve mientras su turno siga en bodega). */
  async asignarPedido(pedidoId: string, vehiculoId: string, fecha: string) {
    if (fecha < hoyISO()) throw new Error('No se puede planificar en un día que ya pasó.');
    await this.enviar(`/orders/${pedidoId}/plan`, { vehiculo_id: idNum(vehiculoId), fecha });
  }

  // Devuelve un pedido planificado a la cola "por planificar"
  desasignarPedido(pedidoId: string) {
    return this.enviar(`/orders/${pedidoId}/unplan`);
  }

  // Atajo: planifica para hoy en el primer furgón con cupo (primero el que ya va a ese domicilio)
  async asignarPedidoADespacho(pedidoId: string): Promise<Vehiculo> {
    const hoy = hoyISO();
    const pedido = this.state.pedidos.find(p => p.id === pedidoId);
    const preferido = pedido ? this.pedidoMismoDestino(pedido, hoy)?.turno.vehiculoId : undefined;
    const vehiculos = this.state.vehiculos.filter(v => v.activo)
      .sort((a, b) => Number(b.id === preferido) - Number(a.id === preferido));
    const errores: string[] = [];
    for (const v of vehiculos) {
      try {
        await api(`/orders/${pedidoId}/plan`, 'POST', { vehiculo_id: idNum(v.id), fecha: hoy });
        await this.recargar().catch(() => undefined);
        return v;
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 409) throw err;
        errores.push(err.message);
      }
    }
    throw new Error(`Ningún furgón tiene cupo hoy. ${errores.join(' ')}`);
  }

  // Capacidad diaria del furgón (N_max); el servidor impide dejarla bajo lo planificado
  async cambiarCapacidadVehiculo(vehiculoId: string, nuevaCapacidad: number) {
    const v = this.vehiculo(vehiculoId);
    if (!v || !Number.isInteger(nuevaCapacidad) || nuevaCapacidad < 1) throw new Error('Capacidad inválida');
    await this.enviar(`/vehicles/${vehiculoId}`, { patente: v.patente, modelo: v.modelo, capacidad: nuevaCapacidad }, 'PATCH');
  }

  // Ausencia: volver hoy (sigue en la ruta) o reprogramar (vuelve a "por planificar" y los llenos a bodega)
  reprogramarAusente(pedidoId: string, cuando: 'hoy' | 'manana') {
    return this.enviar(`/orders/${pedidoId}/retry`, { cuando });
  }

  /** Parada solo de retiro para recoger los envases pendientes de un cliente. Devuelve su código. */
  async programarRetiro(clienteId: string) {
    const r = await this.enviar('/orders/retrieval', { id_cliente: idNum(clienteId) });
    return `RET-${r.id_pedido}`;
  }

  // Embotellación en planta: vacíos sanitizados pasan a llenos (solo administrador)
  sanitizarYRecargar(cantidad = 20) {
    return this.enviar('/inventory/0/fill', { cantidad, evento: event() });
  }

  // El chofer informa la rotura; la oficina la clasifica a la bodega de rotos
  clasificarRotura(reporteId: string) {
    return this.enviar(`/inventory/${reporteId}/classify`);
  }

  // Exclusivo administrador: baja física de rotos tras revisión y eliminación
  autorizarBajaRotoAdmin(cantidad = 1) {
    const origen = this.state.rotosEnBodegaDeRotos >= cantidad ? 'ROTOS' : 'BODEGA';
    return this.enviar('/inventory/0/writeoff', {
      cantidad, origen, revisado: true, eliminado: true,
      motivo: 'Inspección física y eliminación autorizadas por el administrador', evento: event()
    });
  }

  // Exclusivo administrador: baja de envase no retornado tras 60 días (queda marca en ficha)
  darDeBajaNoRetornado(registroId: string) {
    return this.enviar(`/returns/${registroId}/writeoff`, { evidencia: 'Revisión del administrador: 60 días sin devolución' });
  }

  marcarNotificacionLeida(notificacionId: string) {
    return this.enviar(`/notifications/${notificacionId}/read`);
  }

  // Cierre de la ruta en bodega central (lo puede hacer el chofer o la oficina)
  async liquidarRetornoFurgonCentral(turnoId: string) {
    const r = await this.accionChofer(`/turns/${turnoId}/close`, {}, { turnoId, estadoTurno: 'finalizado' });
    return { vaciosRecolectados: Number(r?.vacios ?? 0), llenosNoEntregados: Number(r?.llenos ?? 0), pendiente: !r };
  }

  // ==========================================================================
  // Acciones del chofer (funcionan sin señal)
  // ==========================================================================

  // El chofer confirma la carga física: los llenos salen de bodega y suben al furgón
  async iniciarRuta(turnoId: string) {
    const turno = this.state.turnos.find(t => t.id === turnoId);
    if (!turno || turno.estado !== 'preparacion') return;
    if (turno.fecha !== hoyISO()) throw new Error('Solo se puede iniciar la ruta del día.');
    if (!(this.state.paradas[turnoId] ?? []).length) throw new Error('El turno no tiene paradas para iniciar.');
    await this.accionChofer(`/turns/${turnoId}/start`, {}, { turnoId, estadoTurno: 'en_ruta' });
  }

  private parada(pedidoId: string) {
    for (const [turnoId, paradas] of Object.entries(this.state.paradas)) {
      const p = paradas.find(x => x.id === pedidoId && ['en_despacho', 'ausente', 'programado'].includes(x.estado));
      if (p) return { turnoId, p };
    }
    throw new Error('Parada no encontrada en tu ruta');
  }

  // Entrega normal (lleno por vacío) o cierre de una parada de retiro con los envases recogidos
  confirmarEntregaChofer(pedidoId: string, retirados?: number) {
    const { turnoId, p } = this.parada(pedidoId);
    const body = p.tipo === 'retiro'
      ? { vacios: retirados ?? p.retiroEnvases ?? 0 }
      : { entregados: p.cantidadBidones, vacios: p.cantidadBidones };
    return this.accionChofer(`/stops/${p.paradaId}/deliver`, body, { turnoId, pedidoId, estadoParada: 'entregado' });
  }

  /**
   * Cierre de una parada de entrega con lo que el chofer confirmó por separado:
   * - recibió menos vacíos que los entregados: la diferencia queda pendiente de devolución;
   * - recibió más: el excedente salda envases que el cliente debía de entregas anteriores.
   */
  confirmarVisitaChofer(pedidoId: string, vaciosRecibidos: number) {
    const { turnoId, p } = this.parada(pedidoId);
    const cantidad = p.cantidadBidones;
    const recibidos = Math.max(0, Math.round(vaciosRecibidos));
    const body = recibidos <= cantidad
      ? { entregados: cantidad, vacios: recibidos }
      : { entregados: cantidad, vacios: cantidad, retiros: Math.min(recibidos - cantidad, this.retirosPendientesCliente(p.clienteId)) };
    return this.accionChofer(`/stops/${p.paradaId}/deliver`, body, { turnoId, pedidoId, estadoParada: 'entregado' });
  }

  reportarIncidenciaChofer(
    pedidoId: string,
    tipo: 'pendiente' | 'ausente' | 'roto',
    detalle: string,
    opciones: { cantidad?: number; aceptacionCliente?: boolean } = {}
  ) {
    const { turnoId, p } = this.parada(pedidoId);
    const cantidad = p.cantidadBidones;
    if (tipo === 'ausente') {
      return this.accionChofer(`/stops/${p.paradaId}/deliver`, { ausente: true }, { turnoId, pedidoId, estadoParada: 'ausente' });
    }
    if (tipo === 'roto') {
      if (!opciones.aceptacionCliente) throw new Error('La entrega parcial requiere informar al cliente y registrar su aceptación.');
      const k = Math.min(Math.max(1, opciones.cantidad ?? 1), cantidad);
      return this.accionChofer(`/stops/${p.paradaId}/deliver`, {
        entregados: cantidad - k, rotos: k, vacios: cantidad - k, aceptacion_parcial: true, detalle
      }, { turnoId, pedidoId, estadoParada: 'parcial' });
    }
    const n = Math.min(Math.max(1, opciones.cantidad ?? 1), cantidad);
    return this.accionChofer(`/stops/${p.paradaId}/deliver`, { entregados: cantidad, vacios: cantidad - n }, { turnoId, pedidoId, estadoParada: 'entregado' });
  }

  /**
   * Envía una acción del chofer. Sin conexión (o con el modo offline activado) queda guardada
   * en el teléfono con su identificador de evento y se envía al reconectar.
   */
  private async accionChofer(path: string, body: Row, parche: ParcheLocal): Promise<Row | null> {
    const conEvento = { ...body, evento: body.evento ?? event() };
    const sinRed = this.state.modoOffline || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (!sinRed) {
      try {
        const r = await api(path, 'POST', conEvento);
        await this.recargar().catch(() => undefined);
        return r;
      } catch (err) {
        if (err instanceof ApiError) throw err; // el servidor respondió: el error es real
        // Falló la red: se guarda para enviarla después
      }
    }
    const item: AccionPendiente = { id: conEvento.evento, username: this.usuario, path, body: conEvento, orden: Date.now() + this.pendientes.length / 1000, parche };
    this.pendientes.push(item);
    try {
      await queue.add({ id: item.id, username: item.username, path, body: { ...conEvento, __orden: item.orden, __parche: parche } });
    } catch {
      /* sin IndexedDB: queda en memoria mientras la app siga abierta */
    }
    this.state.pendientesSincronizar = this.pendientes.length;
    this.aplicarParches();
    return null;
  }

  // Recupera las acciones guardadas en el teléfono (por ejemplo, si se cerró la app sin señal)
  private async cargarPendientes() {
    try {
      const items = await queue.all();
      this.pendientes = items
        .filter(i => i.username === this.usuario)
        .map(i => {
          const { __orden, __parche, ...body } = i.body as Row;
          return { id: i.id, username: i.username, path: i.path, body, orden: Number(__orden ?? 0), parche: __parche };
        })
        .sort((a, b) => a.orden - b.orden);
      this.state.pendientesSincronizar = this.pendientes.length;
      if (this.pendientes.length && !this.state.modoOffline && navigator.onLine) void this.sincronizarPendientes();
    } catch {
      /* sin IndexedDB */
    }
  }

  private aplicarParches() {
    for (const { parche } of this.pendientes) {
      if (!parche) continue;
      const turno = parche.turnoId ? this.state.turnos.find(t => t.id === parche.turnoId) : undefined;
      if (turno && parche.estadoTurno) {
        turno.estado = parche.estadoTurno;
        if (parche.estadoTurno === 'en_ruta') {
          (this.state.paradas[turno.id] ?? []).forEach(p => {
            if (p.estado === 'programado') p.estado = 'en_despacho';
          });
        }
      }
      if (parche.turnoId && parche.pedidoId && parche.estadoParada) {
        const p = (this.state.paradas[parche.turnoId] ?? []).find(x => x.id === parche.pedidoId);
        if (p) {
          p.estado = parche.estadoParada;
          p.pendienteSincronizar = true;
        }
      }
    }
  }

  /** Envía en orden las acciones guardadas sin conexión. */
  async sincronizarPendientes() {
    if (this.state.modoOffline || !this.pendientes.length) return;
    const errores: string[] = [];
    while (this.pendientes.length) {
      const item = this.pendientes[0];
      try {
        await api(item.path, 'POST', item.body);
      } catch (err) {
        if (!(err instanceof ApiError)) break; // sigue sin red: se reintenta después
        errores.push(err.message); // el servidor la rechazó (por ejemplo, ya resuelta): se descarta
      }
      this.pendientes.shift();
      await queue.remove(item.id).catch(() => undefined);
    }
    this.state.pendientesSincronizar = this.pendientes.length;
    await this.recargar().catch(() => undefined);
    if (errores.length) throw new Error(`Algunas acciones guardadas no se aplicaron: ${errores.join(' ')}`);
  }

  /** Activa o desactiva el modo sin conexión del chofer (al volver, envía lo pendiente). */
  async cambiarModoOffline(offline: boolean) {
    this.state.modoOffline = offline;
    if (!offline) {
      await this.sincronizarPendientes();
      await this.recargar().catch(() => undefined);
    }
  }

  // Nombre corto del furgón para mensajes
  nombreVehiculo(vehiculoId: string) {
    const v = this.vehiculo(vehiculoId);
    return v ? nombreCorto(v) : 'el furgón';
  }

  llenosDe = llenosDe;
}

export const appStore = new AppStore();
