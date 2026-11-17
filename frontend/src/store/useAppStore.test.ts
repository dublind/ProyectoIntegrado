import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditar, mapearEstado } from './mapeo';
import type { Row } from '../services/api';

const HOY = '2026-11-16';

// Estado mínimo de la API (mismas columnas que GET /api/state)
function api(extra: Row = {}): Row {
  return {
    clientes: [{ id_cliente: 1, nombre: 'Carolina', telefono: '+56987654321', activo: true }],
    direcciones: [{ id_direccion: 10, id_cliente: 1, calle: 'Av. Providencia', numero: '1245', comuna: 'Providencia', latitud: -33.43, longitud: -70.61, activo: true }],
    pedidos: [],
    pagos: [],
    retornos: [],
    historialRetornos: [],
    vehiculos: [{ id: 1, patente: 'KBLP-42', modelo: 'Furgón 1', capacidad: 20, chofer: 'chofer', activo: true }],
    choferes: [{ username: 'chofer', nombre: 'Pedro Chofer' }],
    turnos: [],
    paradasTurnos: [],
    reportes: [],
    stock: { llenosBodega: 100, vaciosBodega: 20, rotosBodega: 0, rotosEnBodegaDeRotos: 0, transitoLlenos: 0, transitoVacios: 0, bajas: 0 },
    avisos: [],
    auditoria: [],
    inconsistencias: [],
    cuentas: [{ id: 1, nombre: 'Cuenta de prueba A', numero: 'DEMO-001', comprobantes: 3, activa: true }],
    ...extra
  };
}

const pedido = (id: number, extra: Row = {}): Row => ({
  id_pedido: id, id_cliente: 1, id_direccion_entrega: 10, cantidad: 2, entregados: 0, precio_unitario: '3500.00', recargo: '0.00',
  tipo: 'entrega', tipo_producto: 'Bidón 20L', autorizacion: 'LIBRE', nombre_estado: 'Pendiente', pagado: '0',
  nombre: 'Carolina', telefono: '+56987654321', calle: 'Av. Providencia', numero: '1245', comuna: 'Providencia',
  latitud: -33.43, longitud: -70.61, fecha_creacion: '2026-11-16T12:00:00.000Z', ...extra
});
const turno = (id: number, estado: string, extra: Row = {}): Row => ({
  id, fecha: `${HOY}T00:00:00.000Z`, nombre: 'Furgón KBLP-42', chofer: 'chofer', vehiculo_id: 1, estado, patente: 'KBLP-42',
  capacidad: 20, llenos_a_bordo: 0, vacios_a_bordo: 0, ruta_km: null, ruta_min: null, ruta_fuente: null, ...extra
});
const parada = (id: number, turnoId: number, pedidoId: number, estado: string, extra: Row = {}): Row => ({
  id, turno_id: turnoId, pedido_id: pedidoId, cantidad: 2, entregados: 0, rotos: 0, vacios: 0, estado, orden: null,
  ...pedido(pedidoId), ...extra
});

describe('Estado de cada pedido según pago, turno y parada', () => {
  it('sin pago queda por cobrar; pagado y sin turno, por planificar con su recargo en el total', () => {
    const e = mapearEstado(api({
      pedidos: [pedido(1), pedido(2, { pagado: '8500', recargo: '1500.00' })]
    }), HOY);
    expect(e.pedidos.find(p => p.id === '1')?.estado).toBe('pendiente_pago');
    const pagado = e.pedidos.find(p => p.id === '2')!;
    expect(pagado.estado).toBe('pagado');
    expect(pagado.total).toBe(8500);
    expect(pagado.codigo).toBe('PED-2');
  });

  it('sigue a su parada: en bodega, en ruta, ausente y entregado', () => {
    const e = mapearEstado(api({
      pedidos: [pedido(1, { pagado: '7000' }), pedido(2, { pagado: '7000' }), pedido(3, { pagado: '7000' }), pedido(4, { pagado: '7000', entregados: 2 })],
      turnos: [turno(1, 'preparacion', { fecha: '2026-11-17T00:00:00.000Z' }), turno(2, 'en_ruta')],
      paradasTurnos: [
        parada(1, 1, 1, 'planificada'),
        parada(2, 2, 2, 'en_ruta'),
        parada(3, 2, 3, 'ausente'),
        parada(4, 2, 4, 'entregada', { entregados: 2, vacios: 2 })
      ]
    }), HOY);
    const estado = (id: string) => e.pedidos.find(p => p.id === id)!;
    expect(estado('1').estado).toBe('programado');
    expect(estado('1').promesaEntrega).toBe('Programado 17-11');
    expect(estado('2').estado).toBe('en_despacho');
    expect(estado('2').paradaId).toBe('2');
    expect(estado('3').estado).toBe('ausente');
    expect(estado('4').estado).toBe('entregado');
  });

  it('un pedido en un turno de un día pasado que nunca salió vuelve a por planificar', () => {
    const e = mapearEstado(api({
      pedidos: [pedido(1, { pagado: '7000' })],
      turnos: [turno(1, 'preparacion', { fecha: '2026-11-02T00:00:00.000Z' })],
      paradasTurnos: [parada(1, 1, 1, 'planificada')]
    }), HOY);
    expect(e.pedidos[0].estado).toBe('pagado');
    expect(e.pedidos[0].promesaEntrega).toBe('Turno del 02-11 sin salir');
  });

  it('un parcial en ruta muestra lo entregado; al cerrar la ruta el saldo queda por planificar', () => {
    const base = { pedidos: [pedido(1, { pagado: '7000', entregados: 1, nombre_estado: 'Parcial' })] };
    const enRuta = mapearEstado(api({
      ...base,
      turnos: [turno(1, 'en_ruta')],
      paradasTurnos: [parada(1, 1, 1, 'parcial', { entregados: 1, rotos: 1, vacios: 1, aceptacion_parcial: true })]
    }), HOY);
    const p = enRuta.pedidos[0];
    expect(p.estado).toBe('parcial');
    expect(p.cantidadEntregada).toBe(1);
    expect(p.cantidadBidones).toBe(2);

    const cerrado = mapearEstado(api(base), HOY);
    expect(cerrado.pedidos[0].estado).toBe('pagado');
    expect(cerrado.pedidos[0].cantidadBidones).toBe(1);
    expect(cerrado.pedidos[0].pedidoOrigenCodigo).toBe('PED-1');
  });

  it('un cliente con envases no retornados requiere autorización y muestra su deuda', () => {
    const e = mapearEstado(api({
      pedidos: [pedido(1, { autorizacion: 'PENDIENTE', pagado: '7000' })],
      retornos: [{ id: 5, cliente_id: 1, pedido_id: 9, cantidad: 2, fecha: '2026-10-01T10:00:00.000Z', estado: 'no_retornaron', nombre: 'Carolina' }]
    }), HOY);
    expect(e.pedidos[0].requiereAutorizacion).toBe(true);
    expect(e.pedidos[0].deudaEnvasesPendiente).toBe(2);
    expect(e.clientes[0].deudaEnvases).toBe(2);
    expect(e.inventario.noRetornaron30d).toBe(2);
  });
});

describe('Turnos por furgón y día', () => {
  it('omite paradas reprogramadas y usa el orden guardado solo si todas lo tienen', () => {
    const e = mapearEstado(api({
      pedidos: [pedido(1, { pagado: '7000' }), pedido(2, { pagado: '7000' }), pedido(3, { pagado: '7000' })],
      turnos: [turno(1, 'en_ruta', { llenos_a_bordo: 4, vacios_a_bordo: 2 }), turno(2, 'preparacion')],
      paradasTurnos: [
        parada(1, 1, 1, 'en_ruta', { orden: 1 }),
        parada(2, 1, 2, 'reprogramada', { orden: 2 }),
        parada(3, 2, 3, 'planificada')
      ]
    }), HOY);
    const enRuta = e.turnos.find(t => t.id === '1')!;
    expect(enRuta.pedidosIds).toEqual(['1']);
    expect(enRuta.ordenParadas).toEqual(['1']);
    expect(enRuta.botellonesCargados).toBe(6);
    expect(enRuta.choferNombre).toBe('Pedro Chofer');
    expect(enRuta.patente).toBe('KBLP-42');
    expect(e.turnos.find(t => t.id === '2')!.ordenParadas).toBeUndefined();
  });

  it('para el chofer arma las paradas desde la ruta aunque no reciba la lista de pedidos', () => {
    const e = mapearEstado(api({
      clientes: [], direcciones: [], vehiculos: [],
      turnos: [turno(1, 'en_ruta')],
      paradasTurnos: [parada(1, 1, 7, 'en_ruta', { tipo: 'retiro', cantidad: 3 })]
    }), HOY);
    const p = e.paradas['1'][0];
    expect(p.codigo).toBe('RET-7');
    expect(p.tipo).toBe('retiro');
    expect(p.retiroEnvases).toBe(3);
    expect(p.estado).toBe('en_despacho');
  });
});

describe('Inventario, rotos y cuadratura', () => {
  it('separa disponibles, tránsito, pendientes, rotos por clasificar y bajas', () => {
    const e = mapearEstado(api({
      pedidos: [pedido(1)],
      stock: { llenosBodega: 50, vaciosBodega: 10, rotosBodega: 2, rotosEnBodegaDeRotos: 2, transitoLlenos: 3, transitoVacios: 1, bajas: 1 },
      reportes: [
        { id: 1, pedido_id: 1, cantidad: 1, detalle: 'Fisura', fecha: '2026-11-10T10:00:00Z', clasificado: true },
        { id: 2, pedido_id: 1, cantidad: 2, detalle: 'Golpe', fecha: '2026-11-12T10:00:00Z', clasificado: true },
        { id: 3, pedido_id: 1, cantidad: 1, detalle: 'Nuevo', fecha: '2026-11-16T10:00:00Z', clasificado: false }
      ]
    }), HOY);
    expect(e.inventario.enTransito).toBe(4);
    expect(e.inventario.bajasDefinitivas60d).toBe(1);
    const estado = (id: string) => e.roturasBodega.find(r => r.reporteId === id)?.estado;
    expect(estado('1')).toBe('baja_definitiva'); // la baja se aplica al reporte más antiguo
    expect(estado('2')).toBe('pendiente_baja');
    expect(estado('3')).toBe('por_clasificar');
  });

  it('la cuadratura falla si el libro del servidor informa inconsistencias', () => {
    const ok = mapearEstado(api(), HOY);
    expect(auditar(ok, () => 0, () => 0).ok).toBe(true);
    const mal = mapearEstado(api({ inconsistencias: [{ problema: 'SALDO_NEGATIVO', detalle: 'BODEGA/LLENO = -1' }] }), HOY);
    const r = auditar(mal, () => 0, () => 0);
    expect(r.ok).toBe(false);
    expect(r.controles[0].detalle).toContain('saldo negativo');
  });
});

describe('Acciones del panel llaman a la API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('planificar envía furgón y día al endpoint del pedido y rechaza días pasados', async () => {
    const llamadas: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      llamadas.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
      const datos = url.endsWith('/state') ? api() : { ok: true };
      return { ok: true, status: 200, json: async () => datos } as Response;
    }));
    const { appStore } = await import('./useAppStore');
    const { hoyISO } = await import('../utils/formato');
    await appStore.asignarPedido('5', '1', hoyISO());
    expect(llamadas[0]).toEqual({ url: '/api/orders/5/plan', method: 'POST', body: { vehiculo_id: 1, fecha: hoyISO() } });
    expect(llamadas.some(l => l.url === '/api/state')).toBe(true);
    await expect(appStore.asignarPedido('5', '1', '2020-01-01')).rejects.toThrow('ya pasó');
  });

  it('muestra el motivo del rechazo del servidor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 409, json: async () => ({ error: 'Furgón 1 ya lleva 20/20 el 16-11: no caben 2 más.' })
    }) as Response));
    const { appStore } = await import('./useAppStore');
    await expect(appStore.desasignarPedido('5')).rejects.toThrow('no caben 2 más');
  });
});
