import { createRouter, createWebHistory } from 'vue-router';
import SprintAppView from '../views/SprintAppView.vue';

const routes = [
  {
    path: '/',
    name: 'MainApp',
    component: SprintAppView,
    meta: { title: 'Sistema de gestión y distribución de agua purificada' }
  },
  {
    path: '/admin',
    redirect: '/'
  },
  {
    path: '/chofer',
    redirect: '/'
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

router.beforeEach((to, _from, next) => {
  if (to.meta.title) {
    document.title = `${to.meta.title}`;
  }
  next();
});

export default router;
