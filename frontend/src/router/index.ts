import { createRouter, createWebHistory } from 'vue-router';
import PortalHub from '../views/PortalHub.vue';
import AdminView from '../views/AdminView.vue';
import ChoferView from '../views/ChoferView.vue';

const routes = [
  {
    path: '/',
    name: 'PortalHub',
    component: PortalHub,
    meta: { title: 'Portal Distribución de Agua - Sprint 1' }
  },
  {
    path: '/admin',
    name: 'AdminView',
    component: AdminView,
    meta: { title: 'Administración de Pedidos - Tarea #48' }
  },
  {
    path: '/chofer',
    name: 'ChoferView',
    component: ChoferView,
    meta: { title: 'App Móvil de Reparto - Tarea #49' }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, _from, next) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} | Proyecto Integrado`;
  }
  next();
});

export default router;
