import type { RouteLocationNormalized, RouteLocationResolved } from 'vue-router';
import type { User } from '../services/api';

// Perfiles con acceso a cada ruta (meta.roles). Sin meta.roles: cualquier sesión iniciada.
export function puedeEntrar(to: RouteLocationNormalized | RouteLocationResolved, user: User) {
  const roles = to.matched.flatMap(r => (r.meta.roles as User['rol'][] | undefined) ?? []);
  return roles.length === 0 || roles.includes(user.rol);
}
