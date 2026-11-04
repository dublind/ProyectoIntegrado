import { onBeforeUnmount, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { Coordenadas, UbicacionChofer } from '../types';
import { appStore } from '../store/useAppStore';
import { distanciaM, GPS_SIMULACION_HABILITADA } from '../utils/llegada';

export type EstadoGps =
  | 'inactivo' // aún no se pide la ubicación (furgón en bodega)
  | 'buscando' // esperando la primera lectura
  | 'activo'
  | 'denegado' // el chofer o el navegador negaron el permiso
  | 'no_disponible' // el teléfono no logra obtener posición (sin señal, GPS apagado)
  | 'no_soportado' // navegador sin geolocalización o página sin HTTPS
  | 'simulado';

// No se guarda cada lectura: solo si se movió o pasó un rato (evita escribir el estado sin parar)
const MOVIMIENTO_MIN_M = 8;
const INTERVALO_MAX_MS = 15_000;

/**
 * Sigue la posición del teléfono del chofer con watchPosition mientras `activo` sea true
 * y la informa al store para el furgón elegido. En desarrollo/demo permite simular la posición.
 */
export function useGpsChofer(vehiculoId: Ref<string>, activo: Ref<boolean>) {
  const estado = ref<EstadoGps>('inactivo');
  const ultima = ref<UbicacionChofer | null>(null);
  const error = ref('');
  let watchId: number | null = null;
  let ultimaGuardada: UbicacionChofer | null = null;
  let ultimoGuardadoMs = 0;

  function informar(u: UbicacionChofer, forzar = false) {
    ultima.value = u;
    const ahora = Date.now();
    const movido = ultimaGuardada ? distanciaM(ultimaGuardada, u) : Infinity;
    const cambioPrecision = ultimaGuardada ? Math.abs(ultimaGuardada.precisionM - u.precisionM) > 10 : true;
    if (!forzar && movido < MOVIMIENTO_MIN_M && !cambioPrecision && ahora - ultimoGuardadoMs < INTERVALO_MAX_MS) return;
    ultimaGuardada = u;
    ultimoGuardadoMs = ahora;
    try {
      appStore.reportarUbicacionChofer(vehiculoId.value, u);
    } catch (e) {
      error.value = (e as Error).message;
    }
  }

  function detener() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  function iniciar() {
    detener();
    error.value = '';
    if (typeof navigator === 'undefined' || !('geolocation' in navigator) || !window.isSecureContext) {
      estado.value = 'no_soportado';
      return;
    }
    estado.value = 'buscando';
    watchId = navigator.geolocation.watchPosition(
      pos => {
        estado.value = 'activo';
        error.value = '';
        informar({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precisionM: pos.coords.accuracy,
          fecha: new Date(pos.timestamp || Date.now()).toISOString(),
          fuente: 'gps'
        });
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          estado.value = 'denegado';
          detener();
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          estado.value = 'no_disponible';
        } else if (estado.value === 'buscando') {
          // TIMEOUT sin ninguna lectura previa: se sigue intentando, pero se avisa
          estado.value = 'no_disponible';
        }
        error.value = err.message;
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
  }

  // ---- Simulación (solo desarrollo o VITE_GPS_SIMULADO=true) ----
  const simulando = ref(false);
  let relojSimulado: ReturnType<typeof setInterval> | null = null;

  function simular(coords: Coordenadas, precisionM = 12) {
    if (!GPS_SIMULACION_HABILITADA) return;
    detener();
    simulando.value = true;
    estado.value = 'simulado';
    informar({ ...coords, precisionM, fecha: new Date().toISOString(), fuente: 'simulada' }, true);
    // Como un GPS real, la posición simulada se vuelve a leer cada tanto (si no, quedaría vencida)
    if (!relojSimulado) {
      relojSimulado = setInterval(() => {
        if (simulando.value && ultima.value) informar({ ...ultima.value, fecha: new Date().toISOString() }, true);
      }, 30_000);
    }
  }

  function usarGpsReal() {
    simulando.value = false;
    if (relojSimulado) clearInterval(relojSimulado);
    relojSimulado = null;
    if (activo.value) iniciar();
    else estado.value = 'inactivo';
  }

  watch(activo, a => {
    if (simulando.value) return;
    if (a) iniciar();
    else {
      detener();
      estado.value = 'inactivo';
    }
  }, { immediate: true });

  // Al cambiar de furgón se vuelve a informar la posición para el nuevo
  watch(vehiculoId, () => {
    ultimaGuardada = null;
    if (ultima.value) informar(ultima.value, true);
  });

  onBeforeUnmount(() => {
    detener();
    if (relojSimulado) clearInterval(relojSimulado);
  });

  return { estado, ultima, error, simulando, simular, usarGpsReal, reintentar: iniciar, simulacionHabilitada: GPS_SIMULACION_HABILITADA };
}
