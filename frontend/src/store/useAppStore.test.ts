
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
      cantidadBidones: 20,
      tipoProducto: 'Agua Purificada 20L',
      medioPago: 'transferencia'
    });

    expect(() => {
      appStore.asignarPedidoADespacho(pedido.id);
    }).toThrow('Excede la capacidad máxima');
  });
});

describe('Registro de roturas y avisos internos', () => {
  beforeEach(() => {
    storage.clear();
    appStore.resetDemoData();
  });

  it('registra la rotura en bodega y genera avisos para administración y cliente', () => {
    const pedido = appStore.state.pedidos.find(item => item.id === 'ped-101');
    expect(pedido).toBeDefined();
    if (!pedido) return;

    const stockAntes = appStore.state.inventario.rotosBodega;
    appStore.reportarIncidenciaChofer(pedido.id, 'roto', 'Envase fisurado durante el traslado.');

    expect(pedido.estado).toBe('parcial');
    expect(appStore.state.roturasBodega[0]).toMatchObject({
      pedidoId: pedido.id,
      codigoPedido: pedido.codigo,
      estado: 'pendiente_baja'
    });
    expect(appStore.state.inventario.rotosBodega).toBe(stockAntes + 1);
    expect(appStore.state.notificacionesInternas.map(item => item.destinatario)).toEqual([
      'administrador',
      'cliente'
    ]);

    appStore.reportarIncidenciaChofer(pedido.id, 'roto', 'No debe duplicar el registro.');
    expect(appStore.state.inventario.rotosBodega).toBe(stockAntes + 1);
    expect(appStore.state.notificacionesInternas).toHaveLength(2);
  });

  it('autoriza la baja de una unidad sin borrar el historial de roturas', () => {
    const rotura = appStore.state.roturasBodega[0];
    appStore.autorizarBajaRotoAdmin(1);

    expect(rotura.estado).toBe('baja_definitiva');
    expect(appStore.state.inventario.rotosBodega).toBe(3);
    expect(appStore.state.inventario.bajasDefinitivas60d).toBe(6);
  });
});
