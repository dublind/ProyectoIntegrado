import type { Coordenadas } from '../types';
import { distanciaKm } from './geo';

/**
 * Trazado de rutas por calles reales.
 * Usa OSRM (motor de ruteo abierto sobre OpenStreetMap, sin API key). Si no responde,
 * se usa un recorrido aproximado en "L". Más adelante se puede reemplazar por Google Routes API
 * sin cambiar a quienes consumen este módulo.
 */

export interface Trazado {
  puntos: Coordenadas[];
  acumuladoM: number[]; // metros recorridos hasta cada punto
  totalM: number;
  real: boolean; // true si sigue calles reales
  semaforos: { m: number; esperaSeg: number }[]; // detenciones simuladas en cruces
}

const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
const cache = new Map<string, Promise<Trazado>>();

const clave = (c: Coordenadas) => `${c.lng.toFixed(5)},${c.lat.toFixed(5)}`;

// Pseudoaleatorio con semilla: el mismo tramo tiene siempre los mismos semáforos
function aleatorio(semilla: string) {
  let h = 2166136261;
  for (let i = 0; i < semilla.length; i++) h = Math.imul(h ^ semilla.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function armarTrazado(puntos: Coordenadas[], real: boolean, semilla: string): Trazado {
  const acumuladoM = [0];
  for (let i = 1; i < puntos.length; i++) {
    acumuladoM.push(acumuladoM[i - 1] + distanciaKm(puntos[i - 1], puntos[i]) * 1000);
  }
  const totalM = acumuladoM[acumuladoM.length - 1] ?? 0;

  // Un cruce con semáforo cada 350-800 m; la mitad de las veces toca rojo (20-50 s)
  const rnd = aleatorio(semilla);
  const semaforos: Trazado['semaforos'] = [];
  for (let m = 350 + rnd() * 450; m < totalM - 120; m += 350 + rnd() * 450) {
    if (rnd() < 0.5) semaforos.push({ m, esperaSeg: 20 + rnd() * 30 });
  }
  return { puntos, acumuladoM, totalM, real, semaforos };
}

function trazadoEnL(a: Coordenadas, b: Coordenadas, semilla: string): Trazado {
  return armarTrazado([a, { lat: b.lat, lng: a.lng }, b], false, semilla);
}

async function pedirOsrm(a: Coordenadas, b: Coordenadas): Promise<Coordenadas[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(`${OSRM_URL}/${clave(a)};${clave(b)}?overview=full&geometries=geojson`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    const coords: [number, number][] | undefined = data?.routes?.[0]?.geometry?.coordinates;
    if (!coords?.length) throw new Error('OSRM sin ruta');
    return [a, ...coords.map(([lng, lat]) => ({ lat, lng })), b];
  } finally {
    clearTimeout(timer);
  }
}

export function trazarRuta(desde: Coordenadas, hasta: Coordenadas): Promise<Trazado> {
  const k = `${clave(desde)};${clave(hasta)}`;
  let p = cache.get(k);
  if (!p) {
    p = pedirOsrm(desde, hasta)
      .then(puntos => armarTrazado(puntos, true, k))
      .catch(err => {
        console.warn('Ruteo por calles no disponible, se usa recorrido aproximado', err);
        cache.delete(k); // se reintenta la próxima vez
        return trazadoEnL(desde, hasta, k);
      });
    cache.set(k, p);
  }
  return p;
}

// Posición y rumbo (grados, 0 = norte) a `m` metros del inicio del trazado
export function puntoEnTrazado(t: Trazado, m: number): { pos: Coordenadas; rumbo: number } {
  const pts = t.puntos;
  if (pts.length < 2) return { pos: pts[0], rumbo: 0 };
  const objetivo = Math.min(Math.max(0, m), t.totalM);
  let i = 1;
  while (i < pts.length - 1 && t.acumuladoM[i] < objetivo) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const largo = t.acumuladoM[i] - t.acumuladoM[i - 1];
  const r = largo > 0 ? (objetivo - t.acumuladoM[i - 1]) / largo : 0;
  const pos = { lat: a.lat + (b.lat - a.lat) * r, lng: a.lng + (b.lng - a.lng) * r };
  const rumbo = (Math.atan2((b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) / Math.PI;
  return { pos, rumbo };
}

// ==========================================================================
// Ruta completa para el chofer en la app de Google Maps
// ==========================================================================

// Google Maps acepta hasta 9 puntos intermedios por enlace; rutas más largas se dividen en tramos
const MAX_INTERMEDIOS = 9;

// Quita depto/oficina/casa, que confunden la búsqueda de Google, y agrega la ciudad
function direccionParaMaps(direccion: string, comuna: string) {
  const calle = direccion.replace(/,?\s*(depto\.?|dpto\.?|departamento|of\.?|oficina|casa|torre|block|local)\b.*$/i, '').trim();
  return `${calle}, ${comuna}, Santiago, Chile`;
}

export interface TramoGoogleMaps {
  url: string;
  desde: number; // número de la primera parada del tramo (1-based)
  hasta: number;
  terminaEnBodega: boolean;
}

/**
 * Arma los enlaces de navegación con todas las paradas en orden, terminando en la bodega.
 * Sin `origin`, Google Maps parte desde la ubicación actual del teléfono.
 */
export function enlacesRutaGoogleMaps(
  paradas: { direccion: string; comuna: string }[],
  bodega: Coordenadas,
  numeroInicial = 1
): TramoGoogleMaps[] {
  // Un cliente con varios pedidos es una sola parada en la navegación
  const direcciones = paradas
    .map(p => direccionParaMaps(p.direccion, p.comuna))
    .filter((d, i, lista) => i === 0 || d !== lista[i - 1]);
  const puntos = [...direcciones, `${bodega.lat},${bodega.lng}`];
  // Si la bodega quedaría sola en un último tramo, se omite: el chofer conoce el regreso
  if (puntos.length % (MAX_INTERMEDIOS + 1) === 1 && puntos.length > 1) puntos.pop();
  const totalParadas = direcciones.length;
  const tramos: TramoGoogleMaps[] = [];
  let origen: string | null = null;
  let i = 0;
  while (i < puntos.length) {
    const grupo = puntos.slice(i, i + MAX_INTERMEDIOS + 1);
    const destino = grupo[grupo.length - 1];
    const intermedios = grupo.slice(0, -1);
    const params = new URLSearchParams({ api: '1', destination: destino, travelmode: 'driving' });
    if (origen) params.set('origin', origen);
    if (intermedios.length) params.set('waypoints', intermedios.join('|'));
    const terminaEnBodega = i + grupo.length >= puntos.length && puntos.length > totalParadas;
    tramos.push({
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
      desde: numeroInicial + i,
      hasta: numeroInicial + Math.min(i + grupo.length, totalParadas) - 1,
      terminaEnBodega
    });
    origen = destino;
    i += grupo.length;
  }
  return tramos;
}
