import { reactive } from 'vue';
import { api, type User } from '../services/api';
import { detenerSincronizacion } from './sincronizacion';

// Sesión real contra el backend (cookie HttpOnly pi_session). El panel y la app del chofer
// quedan detrás del inicio de sesión: nada es público en el despliegue.
const CACHE_KEY = 'pi_session_user';

export const session = reactive({
  user: null as User | null,
  checked: false
});

function cache(user: User | null) {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* almacenamiento no disponible: la sesión sigue en la cookie */
  }
}

export async function cargarSesion(): Promise<User | null> {
  if (session.checked) return session.user;
  try {
    session.user = await api<User>('/auth/me');
    cache(session.user);
  } catch (err) {
    // Sin conexión, el chofer puede seguir con su ruta guardada (PWA offline-first)
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    let cached: User | null = null;
    try {
      cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    } catch {
      cached = null;
    }
    session.user = offline && cached?.rol === 'chofer' ? cached : null;
    if (!offline) cache(null);
    void err;
  }
  session.checked = true;
  return session.user;
}

export async function iniciarSesion(username: string, password: string) {
  session.user = await api<User>('/auth/login', 'POST', { username, password });
  session.checked = true;
  cache(session.user);
  return session.user;
}

export async function cerrarSesion() {
  detenerSincronizacion();
  try {
    await api('/auth/logout', 'POST', {});
  } finally {
    session.user = null;
    session.checked = true;
    cache(null);
  }
}

// Primera pantalla según el perfil
export const inicioPorRol = (user: User) => (user.rol === 'chofer' ? '/chofer' : '/indicadores');

export const ETIQUETA_ROL: Record<User['rol'], string> = {
  administrador: 'Administrador / dueño',
  administrativo: 'Ventas y coordinación',
  chofer: 'Chofer'
};
