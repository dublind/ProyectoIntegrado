import { createRouter, createWebHistory } from 'vue-router';
import AdminLayout from '../layouts/AdminLayout.vue';

const routes = [
  {
    // Panel web del administrativo y del dueño
    path: '/',
    component: AdminLayout,
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
    meta: { title: 'Ruta del chofer' }
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

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · AguaMantra`
    : 'AguaMantra · Gestión y reparto';
});

export default router;
