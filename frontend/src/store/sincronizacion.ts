import { api, ApiError, type Row } from '../services/api';
import { appStore } from './useAppStore';
import { notificar } from './useToast';

/**
 * Conecta el panel y la app del chofer entre dispositivos: el estado vive en el servidor
 * (tabla estado_compartido en PostgreSQL) y cada dispositivo con sesión lo lee y lo guarda.
 * - Lectura cada pocos segundos; si nada cambió, el servidor no reenvía el estado.
 * - Escritura con la versión sobre la que se trabajó; si otro dispositivo guardó antes,
 *   se carga lo último y se avisa para repetir la acción (no se pisan datos ajenos).
 * Puente hasta el PBI 102, que llevará cada acción a su propio endpoint de la API.
 */
const INTERVALO_MS = 3000;

let version = -1;
let activo = false;
let aplicando = false;
let enviando = false;
let pendiente = false;
let temporizador: ReturnType<typeof setTimeout> | undefined;
let intervalo: ReturnType<typeof setInterval> | undefined;

function aplicar(remoto: Row) {
  aplicando = true;
  try {
    appStore.aplicarEstadoRemoto(remoto.datos as Record<string, unknown>);
  } finally {
    aplicando = false;
  }
  version = remoto.version;
}

function programarEnvio() {
  pendiente = true;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void enviar(), 400);
}

async function enviar() {
  // El modo offline simulado del chofer guarda en el teléfono y envía al reconectar
  if (!activo || enviando || version < 0 || appStore.state.modoOffline) return;
  enviando = true;
  pendiente = false;
  try {
    const r = await api('/shared-state', 'POST', { version, datos: appStore.exportarEstado() });
    version = r.version;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      aplicar(err.data);
      notificar('Otro usuario guardó cambios al mismo tiempo. Se cargó lo último: revisa y repite tu acción si no aparece.', 'error', 7000);
    } else if (err instanceof ApiError && err.status === 401) {
      detenerSincronizacion();
    } else {
      pendiente = true; // sin red: se reintenta en la siguiente vuelta
    }
  } finally {
    enviando = false;
    if (pendiente && activo) programarEnvio();
  }
}

async function traer() {
  if (!activo || enviando) return;
  if (pendiente) return void enviar();
  try {
    const r = await api(`/shared-state?version=${version}`);
    if (r.sinCambios) return;
    if (r.datos) {
      aplicar(r);
    } else {
      // Servidor sin estado: este dispositivo siembra el estado inicial
      version = r.version;
      programarEnvio();
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) detenerSincronizacion();
  }
}

export function iniciarSincronizacion() {
  if (activo || typeof window === 'undefined') return;
  activo = true;
  void traer();
  intervalo = setInterval(() => void traer(), INTERVALO_MS);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
}

export function detenerSincronizacion() {
  activo = false;
  version = -1;
  pendiente = false;
  clearTimeout(temporizador);
  clearInterval(intervalo);
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onVisible);
}

const onOnline = () => void traer();
const onVisible = () => {
  if (document.visibilityState === 'visible') void traer();
};

// Cada cambio local se envía al servidor (salvo cuando se está aplicando uno remoto)
appStore.alGuardar(() => {
  if (activo && !aplicando) programarEnvio();
});
