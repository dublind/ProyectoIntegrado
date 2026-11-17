import { appStore } from './useAppStore';

/**
 * Lectura del estado del servidor para el panel y la app del chofer (PBI 102).
 * Cada acción va a su endpoint de la API; aquí solo se inicia y detiene la lectura periódica.
 */
export function iniciarSincronizacion(username: string) {
  return appStore.iniciar(username);
}

export function detenerSincronizacion() {
  appStore.detener();
}
