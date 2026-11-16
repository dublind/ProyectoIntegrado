import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';
import { cargarSesion, inicioPorRol } from '../store/useSession';
import { puedeEntrar } from './acceso';
import { iniciarSincronizacion } from '../store/sincronizacion';

const routes: RouteRecordRaw[] = [
  {
    // Panel web del administrativo y del dueño
    path: '/',
    component: AdminLayout,
    meta: { roles: ['administrador', 'administrativo'] },
    children: [
      { path: '', redirect: '/indicadores' },
      {
        path: 'indicadores',
        name: 'Indicadores',
        component: () => import('../views/admin/IndicadoresView.vue'),
        meta: { title: 'Indicadores operativos', descripcion: 'Resumen del día para el dueño' }
      },
      {
        path: 'pedidos',
        name: 'Pedidos',
        component: () => import('../views/admin/PedidosView.vue'),
        meta: { title: 'Pedidos y ventas', descripcion: 'Recepción, cobro y validación de pagos' }
      },
      {
        path: 'despacho',
        name: 'Despacho',
        component: () => import('../views/admin/DespachoView.vue'),
        meta: { title: 'Planificación y despacho', descripcion: 'Calendario por furgón y día, carga en vivo y novedades' }
      },
      {
        path: 'inventario',
        name: 'Inventario',
        component: () => import('../views/admin/InventarioView.vue'),
        meta: { title: 'Bodegas e inventario', descripcion: 'Cuadratura, envases pendientes y cuentas' }
      },
      {
        path: 'seguimiento',
        name: 'Seguimiento',
        component: () => import('../views/admin/SeguimientoView.vue'),
        meta: { title: 'Seguimiento de flota', descripcion: 'Mapa de furgones en ruta (simulación)' }
      }
    ]
  },
  {
    // App móvil del chofer (PWA), separada del panel
    path: '/chofer',
    name: 'Chofer',
    component: () => import('../views/chofer/ChoferView.vue'),
    // El administrador (super usuario) también puede abrir la app del chofer
    meta: { title: 'Ruta del chofer', roles: ['chofer', 'administrador'] }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: 'Iniciar sesión', publica: true }
  },
  {
    // Sistema conectado a la API y a PostgreSQL, con inicio de sesión por perfil
    path: '/sistema',
    name: 'Sistema',
    component: () => import('../views/SprintAppView.vue'),
    meta: { title: 'Sistema con base de datos' }
  },
  {
    path: '/admin',
    redirect: '/indicadores'
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  // Los enlaces con sección (ej: /despacho#hoy) bajan hasta ella; se espera a que la vista termine de montarse
  scrollBehavior(to, from) {
    if (to.hash) {
      const espera = to.path === from.path ? 0 : 350;
      return new Promise(resolve => setTimeout(() => resolve({ el: to.hash, top: 110, behavior: 'smooth' }), espera));
    }
    return { top: 0 };
  }
});

// Todo el sistema requiere sesión; cada perfil entra solo a sus módulos
router.beforeEach(async (to) => {
  const user = await cargarSesion();
  if (to.meta.publica) return user && to.name === 'Login' ? inicioPorRol(user) : true;
  if (!user) return { name: 'Login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
  // Panel y app del chofer comparten el mismo estado en el servidor
  iniciarSincronizacion();
  if (!puedeEntrar(to, user)) return inicioPorRol(user);
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · AguaMantra`
    : 'AguaMantra · Gestión y reparto';
});

export default router;
