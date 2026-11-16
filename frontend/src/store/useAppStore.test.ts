
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simulación del almacenamiento del navegador
const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  }
});

// Importamos el store después de configurar localStorage
const { appStore } = await import('./useAppStore');

describe('Control de capacidad de despacho', () => {
  beforeEach(() => {
    storage.clear();
    appStore.resetDemoData();
  });

  it('rechaza un pedido que supera la capacidad del vehículo', () => {
    const pedido = appStore.crearPedido({
      nombre: 'Cliente de prueba',
      telefono: '999999999',
      direccion: 'Dirección de prueba',
      comuna: 'Santiago',
      cantidadBidones: 1000,
      tipoProducto: 'Agua Purificada 20L',
      medioPago: 'transferencia'
    });

    // Solo se planifican pedidos pagados; el rechazo debe venir por capacidad (N_max)
    appStore.simularPagoWebpay(pedido.id);

    expect(() => {
      appStore.asignarPedidoADespacho(pedido.id);
    }).toThrow(/no caben 1000 bidones más/);
  });
});

// Crea un pedido pagado, lo planifica para hoy y saca el furgón a ruta
function pedidoEnRuta() {
  const pedido = appStore.crearPedido({
    nombre: 'Cliente rotura',
    telefono: '988887777',
    direccion: 'Calle de prueba 123',
    comuna: 'Santiago',
    cantidadBidones: 3,
    tipoProducto: 'Agua Purificada 20L',
    medioPago: 'webpay'
  });
  appStore.simularPagoWebpay(pedido.id);
  appStore.asignarPedidoADespacho(pedido.id);
  const turno = appStore.turnoDePedido(pedido.id);
  if (!turno) throw new Error('El pedido debe quedar planificado');
  appStore.iniciarRuta(turno.id);
  const enRuta = appStore.state.pedidos.find(p => p.id === pedido.id)!;
  expect(enRuta.estado).toBe('en_despacho');
  return enRuta;
}

describe('Registro de roturas y avisos internos (PBI 68)', () => {
  beforeEach(() => {
    storage.clear();
    appStore.resetDemoData();
  });

  it('registra la rotura en bodega y genera avisos para administración y cliente', () => {
    const pedido = pedidoEnRuta();

    const stockAntes = appStore.state.inventario.rotosBodega;
    appStore.reportarIncidenciaChofer(pedido.id, 'roto', 'Envase fisurado durante el traslado.', {
      cantidad: 1,
      aceptacionCliente: true
    });

    expect(pedido.estado).toBe('parcial');
    expect(appStore.state.roturasBodega[0]).toMatchObject({
      pedidoId: pedido.id,
      codigoPedido: pedido.codigo,
      cantidad: 1,
      estado: 'pendiente_baja'
    });
    expect(appStore.state.inventario.rotosBodega).toBe(stockAntes + 1);
    expect(appStore.state.notificacionesInternas.map(item => item.destinatario)).toEqual([
      'administrador',
      'cliente'
    ]);

    // Repetir el reporte sobre una parada ya cerrada no duplica el registro
    appStore.reportarIncidenciaChofer(pedido.id, 'roto', 'No debe duplicar el registro.', {
      aceptacionCliente: true
    });
    expect(appStore.state.inventario.rotosBodega).toBe(stockAntes + 1);
    expect(appStore.state.notificacionesInternas).toHaveLength(2);
  });

  it('exige la aceptación del cliente para la entrega parcial por rotura', () => {
    const pedido = pedidoEnRuta();
    expect(() => appStore.reportarIncidenciaChofer(pedido.id, 'roto', 'Sin aceptación')).toThrow(/aceptación/);
    expect(appStore.state.notificacionesInternas).toHaveLength(0);
  });

  it('autoriza la baja de una unidad sin borrar el historial de roturas', () => {
    const rotosAntes = appStore.state.inventario.rotosBodega;
    const bajasAntes = appStore.state.inventario.bajasDefinitivas60d;
    const registrosAntes = appStore.state.roturasBodega.length;
    expect(rotosAntes).toBeGreaterThan(0);

    appStore.autorizarBajaRotoAdmin(1);

    expect(appStore.state.inventario.rotosBodega).toBe(rotosAntes - 1);
    expect(appStore.state.inventario.bajasDefinitivas60d).toBe(bajasAntes + 1);
    expect(appStore.state.roturasBodega).toHaveLength(registrosAntes);
    expect(appStore.state.roturasBodega.filter(r => r.estado === 'baja_definitiva')).toHaveLength(1);
  });
});
