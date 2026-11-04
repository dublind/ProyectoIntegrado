import type { Coordenadas, UbicacionChofer } from '../types';
import { distanciaKm } from './geo';

/**
 * Regla de llegada a la parada: la entrega solo se confirma cuando el GPS del chofer
 * está cerca del domicilio. Evita confirmar desde la bodega o tocar el botón sin querer.
 */

function numeroEnv(valor: string | undefined, porDefecto: number) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

// Radio alrededor del domicilio dentro del cual se considera que el chofer llegó (metros)
export const RADIO_LLEGADA_M = numeroEnv(import.meta.env.VITE_RADIO_LLEGADA_M, 150);
// Con una precisión peor que esta no se puede afirmar que el chofer está en la puerta (metros)
export const PRECISION_MAXIMA_M = numeroEnv(import.meta.env.VITE_GPS_PRECISION_MAX_M, 100);
// Una posición más antigua que esto ya no sirve para validar la llegada
export const VIGENCIA_UBICACION_MS = 5 * 60_000;

/**
 * Simulación de ubicación para la demo en escritorio. Solo existe en `npm run dev`
 * o en un build hecho a propósito con VITE_GPS_SIMULADO=true; en un build de producción
 * normal el panel no se muestra y el store rechaza posiciones simuladas.
 */
export const GPS_SIMULACION_HABILITADA = import.meta.env.DEV || import.meta.env.VITE_GPS_SIMULADO === 'true';

export type EstadoLlegada =
  | 'sin_ubicacion' // aún no hay posición del teléfono
  | 'ubicacion_vencida' // la última posición es muy antigua
  | 'precision_baja' // el GPS está cerca pero con demasiado error para afirmar la llegada
  | 'en_camino'
  | 'en_destino';

export interface EvaluacionLlegada {
  estado: EstadoLlegada;
  distanciaM: number | null;
  precisionM: number | null;
}

export function distanciaM(a: Coordenadas, b: Coordenadas) {
  return distanciaKm(a, b) * 1000;
}

export function ubicacionVigente(u: UbicacionChofer | undefined, ahora = Date.now()): u is UbicacionChofer {
  if (!u) return false;
  const t = Date.parse(u.fecha);
  return Number.isFinite(t) && ahora - t <= VIGENCIA_UBICACION_MS;
}

/**
 * Considera la precisión del GPS:
 * - Precisión aceptable: llegó si la distancia es menor al radio más una holgura acotada
 *   (el error del GPS, como máximo un tercio del radio, para no abrir el botón a 300 m).
 * - Precisión baja: solo se puede decir "en camino" si incluso restando el error sigue lejos;
 *   si podría estar en la puerta, no se desbloquea (hay que esperar mejor señal o pedir validación).
 */
export function evaluarLlegada(
  ubicacion: UbicacionChofer | undefined,
  destino: Coordenadas,
  ahora = Date.now(),
  radio = RADIO_LLEGADA_M
): EvaluacionLlegada {
  if (!ubicacion) return { estado: 'sin_ubicacion', distanciaM: null, precisionM: null };
  const precision = Math.max(0, ubicacion.precisionM);
  const distancia = distanciaM(ubicacion, destino);
  if (!ubicacionVigente(ubicacion, ahora)) return { estado: 'ubicacion_vencida', distanciaM: distancia, precisionM: precision };

  if (precision > PRECISION_MAXIMA_M) {
    const estado = distancia - precision > radio ? 'en_camino' : 'precision_baja';
    return { estado, distanciaM: distancia, precisionM: precision };
  }
  const holgura = Math.min(precision, radio / 3);
  return { estado: distancia <= radio + holgura ? 'en_destino' : 'en_camino', distanciaM: distancia, precisionM: precision };
}

// "≈ 350 m" o "≈ 1,2 km"
export function formatoDistancia(metros: number) {
  if (metros < 1000) return `≈ ${Math.max(10, Math.round(metros / 10) * 10)} m`;
  return `≈ ${(metros / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} km`;
}

/**
 * Punto a cierta distancia del destino, en la dirección de la bodega (de donde viene el furgón).
 * Lo usa la simulación de ubicación para acercar al chofer a la parada.
 */
export function puntoHacia(destino: Coordenadas, desde: Coordenadas, metros: number): Coordenadas {
  const total = distanciaM(destino, desde);
  if (total < 1) {
    // Sin dirección de referencia: se desplaza hacia el norte
    return { lat: destino.lat + metros / 111_320, lng: destino.lng };
  }
  const f = metros / total;
  return { lat: destino.lat + (desde.lat - destino.lat) * f, lng: destino.lng + (desde.lng - destino.lng) * f };
}
