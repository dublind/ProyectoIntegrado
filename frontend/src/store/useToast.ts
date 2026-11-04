import { reactive } from 'vue';

// Avisos no bloqueantes (reemplazan alert() del navegador)
export interface Toast {
  id: number;
  tipo: 'exito' | 'error' | 'info';
  mensaje: string;
}

export const toasts = reactive<Toast[]>([]);

let siguienteId = 1;

export function notificar(mensaje: string, tipo: Toast['tipo'] = 'info', duracionMs = 4200) {
  const id = siguienteId++;
  toasts.push({ id, tipo, mensaje });
  setTimeout(() => cerrarToast(id), duracionMs);
}

export function cerrarToast(id: number) {
  const idx = toasts.findIndex(t => t.id === id);
  if (idx >= 0) toasts.splice(idx, 1);
}
