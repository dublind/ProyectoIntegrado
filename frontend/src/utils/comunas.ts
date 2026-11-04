import type { Coordenadas } from '../types';

/**
 * Comunas de cobertura y recargo de delivery por distancia a la zona base (Providencia y Ñuñoa).
 * Para cambiar montos o mover una comuna de tramo, basta con editar este archivo.
 */

export type TramoDelivery = 'base' | 'cercana' | 'intermedia' | 'lejana';

export const TRAMOS_DELIVERY: Record<TramoDelivery, { nombre: string; recargo: number }> = {
  base: { nombre: 'Zona base', recargo: 0 },
  cercana: { nombre: 'Cercanas', recargo: 1500 },
  intermedia: { nombre: 'Intermedias', recargo: 3000 },
  lejana: { nombre: 'Lejanas', recargo: 5000 } // tope del recargo
};

export interface Comuna {
  nombre: string;
  tramo: TramoDelivery;
  centro: Coordenadas; // aproximado, para ubicar direcciones sin geocodificación
}

export const COMUNAS: Comuna[] = [
  { nombre: 'Providencia', tramo: 'base', centro: { lat: -33.4314, lng: -70.6093 } },
  { nombre: 'Ñuñoa', tramo: 'base', centro: { lat: -33.4569, lng: -70.5975 } },

  { nombre: 'Santiago Centro', tramo: 'cercana', centro: { lat: -33.4378, lng: -70.6504 } },
  { nombre: 'Las Condes', tramo: 'cercana', centro: { lat: -33.4103, lng: -70.5679 } },
  { nombre: 'La Reina', tramo: 'cercana', centro: { lat: -33.4450, lng: -70.5350 } },
  { nombre: 'Macul', tramo: 'cercana', centro: { lat: -33.4870, lng: -70.5990 } },
  { nombre: 'San Joaquín', tramo: 'cercana', centro: { lat: -33.4960, lng: -70.6280 } },
  { nombre: 'Recoleta', tramo: 'cercana', centro: { lat: -33.4060, lng: -70.6400 } },

  { nombre: 'Vitacura', tramo: 'intermedia', centro: { lat: -33.3900, lng: -70.5930 } },
  { nombre: 'San Miguel', tramo: 'intermedia', centro: { lat: -33.4970, lng: -70.6510 } },
  { nombre: 'Peñalolén', tramo: 'intermedia', centro: { lat: -33.4860, lng: -70.5440 } },
  { nombre: 'La Florida', tramo: 'intermedia', centro: { lat: -33.5220, lng: -70.5980 } },
  { nombre: 'Independencia', tramo: 'intermedia', centro: { lat: -33.4160, lng: -70.6650 } },
  { nombre: 'Estación Central', tramo: 'intermedia', centro: { lat: -33.4590, lng: -70.6980 } },
  { nombre: 'Quinta Normal', tramo: 'intermedia', centro: { lat: -33.4280, lng: -70.6970 } },
  { nombre: 'Pedro Aguirre Cerda', tramo: 'intermedia', centro: { lat: -33.4890, lng: -70.6710 } },
  { nombre: 'Conchalí', tramo: 'intermedia', centro: { lat: -33.3840, lng: -70.6750 } },
  { nombre: 'Huechuraba', tramo: 'intermedia', centro: { lat: -33.3740, lng: -70.6360 } },

  { nombre: 'Maipú', tramo: 'lejana', centro: { lat: -33.5110, lng: -70.7580 } },
  { nombre: 'Puente Alto', tramo: 'lejana', centro: { lat: -33.6110, lng: -70.5750 } },
  { nombre: 'Pudahuel', tramo: 'lejana', centro: { lat: -33.4440, lng: -70.7610 } },
  { nombre: 'Quilicura', tramo: 'lejana', centro: { lat: -33.3600, lng: -70.7300 } },
  { nombre: 'Lo Barnechea', tramo: 'lejana', centro: { lat: -33.3500, lng: -70.5180 } },
  { nombre: 'Renca', tramo: 'lejana', centro: { lat: -33.4030, lng: -70.7280 } },
  { nombre: 'Cerro Navia', tramo: 'lejana', centro: { lat: -33.4250, lng: -70.7350 } },
  { nombre: 'Lo Prado', tramo: 'lejana', centro: { lat: -33.4440, lng: -70.7250 } },
  { nombre: 'Cerrillos', tramo: 'lejana', centro: { lat: -33.5000, lng: -70.7160 } },
  { nombre: 'La Cisterna', tramo: 'lejana', centro: { lat: -33.5300, lng: -70.6640 } },
  { nombre: 'San Ramón', tramo: 'lejana', centro: { lat: -33.5370, lng: -70.6420 } },
  { nombre: 'La Granja', tramo: 'lejana', centro: { lat: -33.5390, lng: -70.6250 } },
  { nombre: 'Lo Espejo', tramo: 'lejana', centro: { lat: -33.5210, lng: -70.6880 } },
  { nombre: 'El Bosque', tramo: 'lejana', centro: { lat: -33.5620, lng: -70.6760 } },
  { nombre: 'La Pintana', tramo: 'lejana', centro: { lat: -33.5830, lng: -70.6340 } },
  { nombre: 'San Bernardo', tramo: 'lejana', centro: { lat: -33.5920, lng: -70.6990 } }
];

const normalizar = (texto: string) => texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function buscarComuna(nombre: string): Comuna | undefined {
  const n = normalizar(nombre);
  return COMUNAS.find(c => normalizar(c.nombre) === n) ?? (n === 'santiago' ? COMUNAS.find(c => c.nombre === 'Santiago Centro') : undefined);
}

export function recargoDelivery(comuna: string): number {
  const c = buscarComuna(comuna);
  return c ? TRAMOS_DELIVERY[c.tramo].recargo : 0;
}

// Comunas agrupadas por tramo, en orden, para el selector del formulario
export function comunasPorTramo() {
  return (Object.keys(TRAMOS_DELIVERY) as TramoDelivery[]).map(tramo => ({
    tramo,
    ...TRAMOS_DELIVERY[tramo],
    comunas: COMUNAS.filter(c => c.tramo === tramo).map(c => c.nombre).sort((a, b) => a.localeCompare(b, 'es'))
  }));
}
