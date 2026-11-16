import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    descripcion?: string;
    // Perfiles que pueden entrar; sin valor, cualquier sesión iniciada
    roles?: Array<'administrador' | 'administrativo' | 'chofer'>;
    // Ruta accesible sin sesión (solo el inicio de sesión)
    publica?: boolean;
  }
}
