<template>
  <div class="admin-shell">
    <!-- Barra lateral de navegación (en móvil pasa a barra inferior) -->
    <aside class="sidebar">
      <RouterLink to="/indicadores" class="brand">
        <img :src="logoMarca" alt="" class="brand-logo" width="40" height="40" />
        <span class="brand-text">
          <span class="brand-title">AguaMantra</span>
          <span class="brand-sub">Gestión y reparto</span>
        </span>
      </RouterLink>

      <nav class="side-nav" aria-label="Módulos del panel">
        <span class="nav-section">Operación</span>
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="side-link">
          <component :is="item.icon" :size="18" class="side-icon" />
          <span class="side-label">{{ item.label }}</span>
          <span v-if="item.badge && item.badge.value > 0" :class="['side-badge', item.badgeClass]">
            {{ item.badge.value }}
          </span>
        </RouterLink>

        <span class="nav-section">Terreno</span>
        <RouterLink to="/chofer" class="side-link side-link-driver">
          <Smartphone :size="18" class="side-icon" />
          <span class="side-label label-long">App del chofer</span>
          <span class="side-label label-short">Chofer</span>
          <span v-if="paradasPendientes > 0" class="side-badge badge-live">{{ paradasPendientes }}</span>
        </RouterLink>
      </nav>

      <div class="side-footer">
        <div class="profile-avatar">{{ usuario.iniciales }}</div>
        <div class="profile-info">
          <span class="profile-name">{{ usuario.nombre }}</span>
          <span class="profile-role">{{ usuario.rol }}</span>
        </div>
      </div>
    </aside>

    <div class="main-column">
      <header class="topbar">
        <div class="topbar-title">
          <h1>{{ route.meta.title }}</h1>
          <p>{{ route.meta.descripcion }}</p>
        </div>
        <span class="live-pill" title="Se actualiza al instante con lo que registra el chofer">
          <span class="live-dot"></span> En vivo
        </span>
        <RouterLink to="/inventario" :class="['audit-pill', { fail: !appStore.auditoria.value.ok }]"
          :title="appStore.auditoria.value.ok ? 'Todos los módulos cuadran' : 'Hay un descuadre: revisa Inventario'">
          {{ appStore.auditoria.value.ok ? 'Cuadratura OK' : 'Descuadre' }}
        </RouterLink>
        <RouterLink to="/inventario" class="stock-pill" title="Ecuación de cuadratura continua de stock">
          <span class="stock-dot"></span>
          <span class="stock-label">Stock total</span>
          <strong>{{ appStore.totalStockContinuo.value }}</strong>
          <span class="stock-breakdown">{{ appStore.state.inventario.llenosCentral }} disponibles · {{
            appStore.state.inventario.enTransito }} en ruta</span>
        </RouterLink>
      </header>

      <!-- Alerta global de rotación de cuenta -->
      <div v-if="appStore.state.notificacionRotacion" class="alert-banner" role="alert">
        <RefreshCw :size="18" />
        <div class="alert-text">
          <strong>Conmutación automática de cuenta bancaria (regla de 45 comprobantes)</strong>
          <p>{{ appStore.state.notificacionRotacion }}</p>
        </div>
        <button @click="appStore.state.notificacionRotacion = null" class="btn-close" aria-label="Cerrar aviso">&times;</button>
      </div>

      <main class="workspace">
        <FlujoDelDia class="flujo-bar" />
        <RouterView v-slot="{ Component }">
          <Transition name="fade-view" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import logoMarca from '../assets/aguamantra-marca.jpg';
import { ClipboardList, LayoutDashboard, MapPinned, RefreshCw, Smartphone, Truck, Warehouse } from 'lucide-vue-next';
import FlujoDelDia from '../components/FlujoDelDia.vue';
import { appStore } from '../store/useAppStore';
import { notificar } from '../store/useToast';

const route = useRoute();

// Lo que el chofer registra en su app (otra pestaña) aparece aquí al instante
appStore.alRecibirActividadRemota(nuevas => {
  nuevas.filter(a => a.origen === 'chofer').reverse().forEach(a => {
    notificar(`Chofer: ${a.texto}`, a.tipo === 'error' ? 'error' : a.tipo === 'exito' ? 'exito' : 'info', 5000);
  });
});

const pedidosPorCobrar = computed(() => appStore.state.pedidos.filter(p => p.estado === 'pendiente_pago').length);
const pedidosPorDespachar = computed(() => appStore.state.pedidos.filter(p => p.estado === 'pagado').length);
const alertasInventario = computed(() => appStore.registrosPendientes.value.length);
const paradasPendientes = computed(() => appStore.pedidosDespachoActivo.value.filter(p => p.estado === 'en_despacho').length);

const navItems = [
  { to: '/indicadores', label: 'Indicadores', icon: LayoutDashboard },
  { to: '/pedidos', label: 'Pedidos', icon: ClipboardList, badge: pedidosPorCobrar, badgeClass: 'badge-warn' },
  { to: '/despacho', label: 'Despacho', icon: Truck, badge: pedidosPorDespachar, badgeClass: '' },
  { to: '/inventario', label: 'Inventario', icon: Warehouse, badge: alertasInventario, badgeClass: 'badge-warn' },
  { to: '/seguimiento', label: 'Seguimiento', icon: MapPinned }
];

// El dueño revisa indicadores e inventario; la secretaría opera pedidos y despacho
const usuario = computed(() => {
  if (route.path.startsWith('/indicadores') || route.path.startsWith('/inventario')) {
    return { nombre: 'Erick Operaciones', rol: 'Administrador / dueño', iniciales: 'EO' };
  }
  return { nombre: 'Secretaría', rol: 'Ventas y coordinación', iniciales: 'SV' };
});
</script>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: 248px 1fr;
  min-height: 100vh;
  background: var(--bg-main);
}

/* ==========================================================================
   SIDEBAR
   ========================================================================== */
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--zun-blanco);
  border-right: 1px solid var(--zun-border);
  padding: 22px 16px;
  gap: 26px;
}

/* Franja con el cielo del logo */
.sidebar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--am-cielo);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px;
  text-decoration: none;
}

.brand-logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--zun-blanco), 0 0 0 3px var(--am-hielo);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease;
}

.brand:hover .brand-logo {
  transform: rotate(-4deg) scale(1.05);
  box-shadow: 0 0 0 2px var(--zun-blanco), 0 0 0 3px var(--am-cian);
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-family: var(--font-marca);
  font-size: 1.22rem;
  font-weight: 700;
  color: var(--am-noche);
  letter-spacing: -0.01em;
  line-height: 1.1;
}

.brand-sub {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--zun-gris);
}

.side-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.nav-section {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--zun-gris-medium);
  padding: 14px 12px 6px;
}

.side-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--zun-gris-dark);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.side-link:hover {
  color: var(--acento);
  border-color: var(--acento);
  box-shadow: 2px 2px 0 var(--acento);
  transform: translate(-1px, -1px);
}

.side-link.router-link-active {
  background: var(--am-noche);
  color: #ffffff;
  border-color: var(--am-noche);
  box-shadow: inset 3px 0 0 var(--am-hielo);
}

.side-icon {
  flex-shrink: 0;
}

.side-label {
  flex: 1;
}

.label-short {
  display: none;
}

.side-badge {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  text-align: center;
  background: var(--zun-negro);
  color: #ffffff;
}

.side-link.router-link-active .side-badge {
  background: #ffffff;
  color: var(--zun-negro);
}

.side-badge.badge-warn {
  background: var(--zun-rojo);
  color: #ffffff;
}

.side-badge.badge-live {
  background: var(--zun-verde);
  color: #ffffff;
}

.side-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 10px 0;
  border-top: 1px solid var(--zun-border);
}

.profile-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--zun-negro);
  flex-shrink: 0;
}

.profile-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.profile-name {
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--zun-negro);
}

.profile-role {
  font-size: 0.72rem;
  color: var(--zun-gris);
}

/* ==========================================================================
   COLUMNA PRINCIPAL
   ========================================================================== */
.main-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 32px;
  background: rgba(249, 250, 255, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--zun-border);
}

.topbar-title h1 {
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--zun-negro);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.topbar-title p {
  font-size: 0.84rem;
  color: var(--zun-gris);
}

.topbar-title {
  flex: 1;
  min-width: 0;
}

.live-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  color: #065f46;
  white-space: nowrap;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--zun-verde);
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
  animation: live 1.8s infinite;
}

@keyframes live {
  70% { box-shadow: 0 0 0 7px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

.audit-pill {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--zun-verde-light);
  color: #065f46;
  border: 1px solid rgba(16, 185, 129, 0.3);
  text-decoration: none;
  white-space: nowrap;
}

.audit-pill.fail {
  background: var(--zun-rojo);
  color: #ffffff;
  border-color: var(--zun-rojo);
}

.flujo-bar {
  margin-bottom: 22px;
}

.stock-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--zun-blanco);
  border: 1px solid var(--zun-border);
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--zun-text);
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.stock-pill:hover {
  border-color: var(--acento);
  box-shadow: 2px 2px 0 var(--acento);
  transform: translate(-1px, -1px);
}

.stock-dot {
  width: 9px;
  height: 9px;
  background: var(--zun-verde);
  border-radius: 50%;
}

.stock-pill strong {
  color: var(--zun-negro);
}

.stock-breakdown {
  color: var(--zun-gris);
  font-size: 0.74rem;
}

.alert-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 20px 32px 0;
  padding: 14px 18px;
  background: var(--zun-ambar-light);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: var(--radius-sm);
  color: #78350f;
  font-size: 0.86rem;
}

.alert-text {
  flex: 1;
}

.workspace {
  flex: 1;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  padding: 28px 32px 48px;
}

.fade-view-enter-active,
.fade-view-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.fade-view-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.fade-view-leave-to {
  opacity: 0;
}

/* ==========================================================================
   RESPONSIVE: barra inferior tipo app en pantallas angostas
   ========================================================================== */
@media (max-width: 900px) {
  .admin-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: fixed;
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    height: auto;
    z-index: 200;
    flex-direction: row;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
    border-right: none;
    border-top: 1px solid var(--zun-border);
    gap: 0;
  }

  .brand,
  .side-footer,
  .nav-section {
    display: none;
  }

  .side-nav {
    flex-direction: row;
    justify-content: space-around;
    gap: 2px;
  }

  .side-link {
    position: relative;
    flex-direction: column;
    gap: 3px;
    padding: 7px 4px;
    flex: 1;
    font-size: 0.66rem;
    text-align: center;
  }

  .side-link:hover {
    box-shadow: none;
    transform: none;
  }

  .side-label {
    white-space: nowrap;
  }

  .label-long {
    display: none;
  }

  .label-short {
    display: inline;
  }

  .side-badge {
    position: absolute;
    top: 2px;
    right: calc(50% - 22px);
    min-width: 18px;
    padding: 0 5px;
    font-size: 0.62rem;
  }

  .topbar {
    padding: 14px 16px;
  }

  .topbar-title h1 {
    font-size: 1.15rem;
  }

  .topbar-title p,
  .stock-label,
  .stock-breakdown {
    display: none;
  }

  .alert-banner {
    margin: 14px 16px 0;
  }

  .workspace {
    padding: 18px 16px 96px;
  }
}
</style>
