
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
