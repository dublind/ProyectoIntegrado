<template>
  <div class="chofer-screen-wrapper">
    <!-- Marco simulador de móvil o vista fluida -->
    <div class="mobile-frame">
      <!-- Status Bar Móvil PWA -->
      <header class="pwa-header">
        <div class="header-top">
          <router-link to="/" class="pwa-back">&larr; Portal</router-link>
          <div class="connection-status" :class="{ offline: appStore.state.modoOffline }">
            <span class="status-dot"></span>
            <span>{{ appStore.state.modoOffline ? 'Modo offline (local)' : 'Online (sincronizado)' }}</span>
          </div>
          <button @click="toggleOffline" class="btn-toggle-net" title="Simular desconexión de red">
            {{ appStore.state.modoOffline ? '📶 Conectar' : '📴 Desconectar' }}
          </button>
        </div>

        <div class="chofer-profile-bar">
          <div class="driver-avatar">🚚</div>
          <div class="driver-info">
            <span class="driver-name">{{ appStore.state.turnoActivo.choferNombre }}</span>
            <span class="truck-plate">
              Furgón 1 • Peugeot Partner ({{ appStore.state.turnoActivo.botellonesCargados }}/{{ appStore.state.turnoActivo.capacidadMax }} botellones)
            </span>
          </div>
          <span class="badge badge-success">Turno {{ appStore.state.turnoActivo.turno }}</span>
        </div>
      </header>

      <!-- Resumen de Carga del Furgón -->
      <section class="truck-load-card">
        <div class="load-metric">
          <span class="l-num text-primary">{{ botellonesPorEntregar }}</span>
          <span class="l-txt">Llenos por entregar</span>
        </div>
        <div class="load-divider"></div>
        <div class="load-metric">
          <span class="l-num text-success">{{ envasesVaciosRecolectados }}</span>
          <span class="l-txt">Vacíos recolectados</span>
        </div>
        <div class="load-divider"></div>
        <div class="load-metric">
          <span class="l-num text-warning">{{ pendientesRetiroCount }}</span>
          <span class="l-txt">Pendientes</span>
        </div>
      </section>

      <!-- Lista de Paradas en Orden Geográfico -->
      <main class="stops-container">
        <div class="stops-header">
          <h2>Hoja de ruta (orden geográfico)</h2>
          <span class="stops-count">{{ paradasCompletadas }} / {{ paradasTotales }} paradas</span>
        </div>

        <div class="stops-list">
          <div 
            v-for="(pedido, index) in paradasOrdenadas" 
            :key="pedido.id"
            :class="['stop-card', { 'is-active': index === paradaActivaIndex && pedido.estado === 'en_despacho', 'is-done': pedido.estado === 'entregado' || pedido.estado === 'parcial', 'is-absent': pedido.estado === 'ausente' }]"
          >
            <!-- Badge Número de Parada -->
            <div class="stop-badge-row">
              <span class="stop-num">Parada #{{ index + 1 }}</span>
              <span :class="['badge', getBadgeStopClass(pedido.estado)]">
                {{ formatEstadoStop(pedido.estado) }}
              </span>
            </div>

            <!-- Datos de Entrega -->
            <div class="stop-client-name">{{ pedido.clienteNombre }}</div>
            <div class="stop-address">
              📍 {{ pedido.direccion }}, {{ pedido.comuna }}
            </div>

            <div class="stop-order-details">
              <span class="botellones-tag">💧 Entregar: {{ pedido.cantidadBidones }} botellón(es)</span>
              <span class="payment-check">
                {{ pedido.medioPago === 'webpay' ? '✅ Pagado Webpay' : '✅ Pagado transf.' }}
              </span>
            </div>

            <!-- Alerta Retiro Obligatorio de Deuda Anterior -->
            <div v-if="pedido.tieneAlertaDeuda && pedido.estado === 'en_despacho'" class="pickup-debt-notice">
              ⚠️ <strong>Retiro pendiente anterior:</strong> Cliente debe entregar {{ pedido.deudaEnvasesPendiente }} envase(s) vacío(s) retenido(s).
            </div>

            <!-- Botones de Acción para Parada Activa -->
            <div v-if="pedido.estado === 'en_despacho'" class="stop-actions">
              <!-- Botón Principal 1 Toque -->
              <button @click="confirmarEntregaRapida(pedido)" class="btn btn-success btn-large-touch">
                <span class="check-icon">✓</span> Confirmar entrega
              </button>

              <!-- Botón Reportar Incidencia -->
              <div class="secondary-actions-row">
                <button @click="abrirModalIncidencia(pedido)" class="btn btn-secondary btn-sm-touch">
                  ⚠️ Reportar excepción
                </button>
                <a :href="`https://maps.google.com/?q=${encodeURIComponent(pedido.direccion + ' ' + pedido.comuna)}`" target="_blank" class="btn btn-secondary btn-sm-touch btn-gps">
                  🗺️ Navegar
                </a>
              </div>
            </div>

            <!-- Resumen si ya fue procesada -->
            <div v-else class="stop-summary-done">
              <span v-if="pedido.estado === 'entregado'">✓ Entrega finalizada exitosamente</span>
              <span v-else-if="pedido.estado === 'ausente'">❌ Cliente ausente en visita</span>
              <span v-else-if="pedido.estado === 'parcial'">⚠️ Entrega parcial registrada</span>
              <span v-if="pedido.incidencia" class="incidencia-text">
                ({{ pedido.incidencia.tipo }}: {{ pedido.incidencia.detalle }})
              </span>
            </div>
          </div>
        </div>
      </main>

      <!-- MODAL REPORTAR EXCEPCIÓN / ENVASES (Chofer en Terreno) -->
      <div v-if="modalIncidenciaPedido" class="modal-overlay" @click.self="modalIncidenciaPedido = null">
        <div class="modal-content modal-mobile">
          <div class="modal-header">
            <h3>Reportar novedad de parada</h3>
            <button @click="modalIncidenciaPedido = null" class="btn-close" aria-label="Cerrar">&times;</button>
          </div>
          <div class="modal-body">
            <p class="modal-client-note">
              Cliente: <strong>{{ modalIncidenciaPedido.clienteNombre }}</strong><br>
              <em>No se requiere fotografía obligatoria según política operativa.</em>
            </p>

            <div class="exception-options">
              <!-- Opción 1: Botellón Pendiente -->
              <button @click="ejecutarIncidencia('pendiente')" class="btn-exception-option opt-warning">
                <div class="opt-icon">📦</div>
                <div class="opt-text">
                  <strong>Botellón pendiente</strong>
                  <span>Cliente no tiene el envase vacío. Se le entrega el agua y se registra la deuda en el sistema.</span>
                </div>
              </button>

              <!-- Opción 2: Cliente Ausente -->
              <button @click="ejecutarIncidencia('ausente')" class="btn-exception-option opt-danger">
                <div class="opt-icon">🚪</div>
                <div class="opt-text">
                  <strong>Cliente no responde / ausente</strong>
                  <span>No se pudo concretar la entrega. Se reprogramará para volver más tarde o mañana.</span>
                </div>
              </button>

              <!-- Opción 3: Botellón Roto / Fisurado -->
              <button @click="ejecutarIncidencia('roto')" class="btn-exception-option opt-danger">
                <div class="opt-icon">💥</div>
                <div class="opt-text">
                  <strong>Botellón roto en trayecto</strong>
                  <span>Fisurado en furgón. Entrega parcial aceptada por el cliente. Entra a bodega de rotos.</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { appStore } from '../store/useAppStore';
import type { Pedido } from '../types';

const modalIncidenciaPedido = ref<Pedido | null>(null);

const paradasOrdenadas = computed(() => {
  return appStore.pedidosDespachoActivo.value;
});

const paradasTotales = computed(() => paradasOrdenadas.value.length);
const paradasCompletadas = computed(() => 
  paradasOrdenadas.value.filter(p => p.estado !== 'en_despacho').length
);

const paradaActivaIndex = computed(() => {
  return paradasOrdenadas.value.findIndex(p => p.estado === 'en_despacho');
});

const botellonesPorEntregar = computed(() => {
  return paradasOrdenadas.value
    .filter(p => p.estado === 'en_despacho')
    .reduce((sum, p) => sum + p.cantidadBidones, 0);
});

const envasesVaciosRecolectados = computed(() => {
  return paradasOrdenadas.value
    .filter(p => p.estado === 'entregado')
    .reduce((sum, p) => sum + p.cantidadBidones, 0);
});

const pendientesRetiroCount = computed(() => {
  return paradasOrdenadas.value
    .filter(p => p.incidencia?.tipo === 'pendiente')
    .length;
});

function formatEstadoStop(estado: string) {
  const map: Record<string, string> = {
    en_despacho: 'Por Entregar',
    entregado: 'Entregado ✓',
    parcial: 'Parcial',
    ausente: 'Ausente'
  };
  return map[estado] || estado;
}

function getBadgeStopClass(estado: string) {
  const map: Record<string, string> = {
    en_despacho: 'badge-primary',
    entregado: 'badge-success',
    parcial: 'badge-warning',
    ausente: 'badge-danger'
  };
  return map[estado] || 'badge-neutral';
}

function confirmarEntregaRapida(pedido: Pedido) {
  appStore.confirmarEntregaChofer(pedido.id);
}

function abrirModalIncidencia(pedido: Pedido) {
  modalIncidenciaPedido.value = pedido;
}

function ejecutarIncidencia(tipo: 'pendiente' | 'ausente' | 'roto') {
  if (!modalIncidenciaPedido.value) return;
  const detalleMap: Record<string, string> = {
    pendiente: 'Cliente olvidó bajar envases vacíos a conserjería.',
    ausente: 'No contestó timbre ni llamadas en domicilio.',
    roto: 'Envase fisurado por manipulación en furgón.'
  };
  appStore.reportarIncidenciaChofer(modalIncidenciaPedido.value.id, tipo, detalleMap[tipo]);
  modalIncidenciaPedido.value = null;
}

function toggleOffline() {
  appStore.state.modoOffline = !appStore.state.modoOffline;
}
</script>

<style scoped>
.chofer-screen-wrapper {
  min-height: 100vh;
  background: #0f172a;
  display: flex;
  justify-content: center;
  padding: 20px 10px;
}

.mobile-frame {
  width: 100%;
  max-width: 460px;
  background: #f8fafc;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  border: 4px solid #1e293b;
}

.pwa-header {
  background: #ffffff;
  border-bottom: 1px solid var(--border);
  padding: 16px 20px;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.pwa-back {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary);
  text-decoration: none;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--success);
}
.connection-status.offline {
  color: #d97706;
}
.status-dot {
  width: 7px;
  height: 7px;
  background: currentColor;
  border-radius: 50%;
}

.btn-toggle-net {
  font-size: 0.72rem;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 600;
}

.chofer-profile-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.driver-avatar {
  font-size: 1.8rem;
}
.driver-info {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}
.driver-name {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}
.truck-plate {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.truck-load-card {
  background: #ffffff;
  margin: 12px 16px 0;
  border-radius: var(--radius-md);
  padding: 12px;
  border: 1px solid var(--border);
  display: flex;
  justify-content: space-around;
  align-items: center;
}
.load-metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.l-num {
  font-size: 1.4rem;
  font-weight: 800;
  line-height: 1.1;
}
.l-txt {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-weight: 600;
  margin-top: 2px;
}
.load-divider {
  width: 1px;
  height: 28px;
  background: var(--border);
}

.stops-container {
  padding: 16px;
  flex-grow: 1;
  overflow-y: auto;
}

.stops-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.stops-header h2 {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}
.stops-count {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--primary);
}

.stops-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stop-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: all 0.2s;
}

.stop-card.is-active {
  border-color: var(--primary);
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.15);
  background: #ffffff;
}

.stop-card.is-done {
  opacity: 0.75;
  background: #f8fafc;
}

.stop-badge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.stop-num {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--text-muted);
  text-transform: uppercase;
}

.stop-client-name {
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 4px;
}

.stop-address {
  font-size: 0.85rem;
  color: #475569;
  margin-bottom: 10px;
}

.stop-order-details {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.botellones-tag {
  font-size: 0.8rem;
  font-weight: 700;
  color: #0284c7;
  background: #e0f2fe;
  padding: 4px 8px;
  border-radius: 6px;
}
.payment-check {
  font-size: 0.75rem;
  font-weight: 700;
  color: #059669;
}

.pickup-debt-notice {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.78rem;
  color: #92400e;
  margin-bottom: 12px;
}

.stop-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-large-touch {
  width: 100%;
  padding: 14px;
  font-size: 1.05rem;
  border-radius: 10px;
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);
}
.check-icon {
  font-size: 1.2rem;
  font-weight: 900;
}

.secondary-actions-row {
  display: flex;
  gap: 8px;
}

.btn-sm-touch {
  flex: 1;
  padding: 9px;
  font-size: 0.8rem;
  border-radius: 8px;
}
.btn-gps {
  text-decoration: none;
}

.stop-summary-done {
  padding-top: 6px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #059669;
}
.incidencia-text {
  display: block;
  font-size: 0.75rem;
  color: var(--danger);
  margin-top: 2px;
}

/* Modal Mobile Exception Options */
.modal-mobile {
  max-width: 440px;
  width: 100%;
  border-radius: 20px;
}

.modal-mobile .modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.modal-mobile .modal-header h3 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.modal-mobile .modal-body {
  padding: 20px 24px 28px;
}

.modal-client-note {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 16px;
  line-height: 1.5;
}

.exception-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.btn-exception-option {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  text-align: left;
  transition: all 0.15s ease;
  background: #ffffff;
}
.btn-exception-option:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateY(-1px);
}

.opt-icon {
  font-size: 1.6rem;
  line-height: 1;
}
.opt-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.opt-text strong {
  font-size: 0.92rem;
  color: #0f172a;
}
.opt-text span {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.45;
}
</style>
