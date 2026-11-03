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
        meta: { title: 'Despacho y furgones', descripcion: 'Carga del turno, ausencias y saldos' }
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
  routes
});

router.afterEach((to) => {
  document.title = to.meta.title
    ? `${to.meta.title} · Aguas purificadas`
    : 'Sistema de gestión y distribución de agua purificada';
});

export default router;
