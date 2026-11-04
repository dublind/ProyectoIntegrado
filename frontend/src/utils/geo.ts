import type { Coordenadas } from '../types';
import { buscarComuna } from './comunas';

// Bodega central (punto de partida y retorno de los furgones)
export const BODEGA_CENTRAL: Coordenadas = { lat: -33.4489, lng: -70.6260 };

function hashTexto(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) {
    h = (h * 31 + texto.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Geocodificación simulada: ubica la dirección cerca del centro de su comuna
 * con un desplazamiento determinístico (la misma dirección cae siempre en el mismo punto).
 */
export function geocodificarSimulado(direccion: string, comuna: string): Coordenadas {
  const centro = buscarComuna(comuna)?.centro ?? BODEGA_CENTRAL;
  const h = hashTexto(`${direccion}|${comuna}`.toLowerCase());
  const dLat = ((h & 0xff) / 255 - 0.5) * 0.014;
  const dLng = (((h >> 8) & 0xff) / 255 - 0.5) * 0.018;
  return { lat: centro.lat + dLat, lng: centro.lng + dLng };
}

export function distanciaKm(a: Coordenadas, b: Coordenadas): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Orden geográfico de paradas (vecino más cercano desde la bodega central).
 */
export function ordenarPorCercania<T extends { coords?: Coordenadas }>(items: T[], origen = BODEGA_CENTRAL): T[] {
  const pendientes = [...items];
  const resultado: T[] = [];
  let actual = origen;
  while (pendientes.length) {
    let mejorIdx = 0;
    let mejorDist = Infinity;
    pendientes.forEach((it, idx) => {
      const d = it.coords ? distanciaKm(actual, it.coords) : Infinity;
      if (d < mejorDist) {
        mejorDist = d;
        mejorIdx = idx;
      }
    });
    const [siguiente] = pendientes.splice(mejorIdx, 1);
    resultado.push(siguiente);
    if (siguiente.coords) actual = siguiente.coords;
  }
  return resultado;
}

// Largo del circuito origen → paradas → origen (km en línea recta)
function largoCircuito(origen: Coordenadas, puntos: Coordenadas[]) {
  let km = 0;
  let actual = origen;
  for (const p of puntos) {
    km += distanciaKm(actual, p);
    actual = p;
  }
  return km + distanciaKm(actual, origen);
}

/**
 * Orden local de respaldo (sin conexión): vecino más cercano mejorado con 2-opt,
 * que deshace los cruces del recorrido. Parte y termina en la bodega.
 */
export function ordenarRutaLocal<T extends { coords?: Coordenadas }>(items: T[], origen = BODEGA_CENTRAL): T[] {
  const ruta = ordenarPorCercania(items, origen);
  if (ruta.length < 4 || ruta.some(p => !p.coords)) return ruta;
  const coords = () => ruta.map(p => p.coords!);
  let mejoro = true;
  for (let vuelta = 0; mejoro && vuelta < 50; vuelta++) {
    mejoro = false;
    for (let i = 0; i < ruta.length - 1; i++) {
      for (let j = i + 1; j < ruta.length; j++) {
        const actual = largoCircuito(origen, coords());
        const invertido = [...ruta.slice(0, i), ...ruta.slice(i, j + 1).reverse(), ...ruta.slice(j + 1)];
        if (largoCircuito(origen, invertido.map(p => p.coords!)) < actual - 0.001) {
          ruta.splice(0, ruta.length, ...invertido);
          mejoro = true;
        }
      }
    }
  }
  return ruta;
}

export function largoRutaKm(origen: Coordenadas, puntos: Coordenadas[]) {
  return largoCircuito(origen, puntos);
}
