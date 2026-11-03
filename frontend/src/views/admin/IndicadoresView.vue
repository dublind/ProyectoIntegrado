<template>
  <div class="view-stack">
    <p class="data-note">
      <Info :size="14" /> Indicadores calculados solo con pedidos, entregas e inventario registrados. El mapa de seguimiento es
      una simulación y no alimenta estas cifras.
    </p>

    <!-- KPIs del día (PBI 74) -->
    <div class="kpi-grid">
      <RouterLink to="/pedidos" class="card kpi">
        <span class="kpi-label"><ClipboardList :size="15" /> Pedidos del día</span>
        <span class="kpi-value">{{ pedidosHoy.length }}</span>
        <span class="kpi-sub">{{ formatCLP(ventasHoy) }} pagados · {{ porCobrarHoy }} por cobrar</span>
      </RouterLink>

      <RouterLink to="/despacho" class="card kpi">
        <span class="kpi-label"><PackageCheck :size="15" /> Entregas del turno</span>
        <span class="kpi-value">{{ entregadas }}<span class="kpi-of">/ {{ paradas.length }}</span></span>
        <div class="kpi-bar"><div class="kpi-fill" :style="{ width: `${pctEntregas}%` }"></div></div>
        <span class="kpi-sub">{{ porVisitar }} por visitar · {{ ausentes }} ausente(s)</span>
      </RouterLink>

      <RouterLink to="/despacho" class="card kpi" :class="{ 'kpi-alert': totalPendientes > 0 }">
        <span class="kpi-label"><Clock :size="15" /> Pendientes</span>
        <span class="kpi-value">{{ totalPendientes }}</span>
        <span class="kpi-sub">{{ porCobrar }} por cobrar · {{ porAsignar }} por asignar · {{ ausentes }} ausencias</span>
      </RouterLink>

      <RouterLink to="/inventario" class="card kpi">
        <span class="kpi-label"><Warehouse :size="15" /> Stock disponible</span>
        <span class="kpi-value">{{ inv.llenosCentral }}<span class="kpi-of">/ {{ appStore.totalStockContinuo.value }}</span></span>
        <span class="kpi-sub">Llenos disponibles sobre stock total físico</span>
      </RouterLink>
    </div>

    <div class="two-col">
      <!-- Avance de la ruta -->
      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Avance de la ruta</h2>
            <p class="card-sub">{{ turno.choferNombre }} · turno {{ turno.turno }} · {{ turno.botellonesCargados }} envases a bordo</p>
          </div>
          <RouterLink to="/seguimiento" class="btn btn-secondary btn-sm"><MapPinned :size="14" /> Mapa</RouterLink>
        </div>
        <div v-if="paradas.length === 0" class="empty-box">No hay paradas asignadas al turno.</div>
        <ol v-else class="route-steps">
          <li v-for="(p, idx) in paradas" :key="p.id" :class="['route-step', `is-${p.estado}`]">
            <span class="step-dot">{{ idx + 1 }}</span>
            <div class="step-body">
              <span class="font-bold">{{ p.clienteNombre }}</span>
              <span class="text-xs text-muted">{{ p.direccion }}, {{ p.comuna }}</span>
            </div>
            <span :class="['badge', getBadgeStopClass(p.estado)]">{{ formatEstadoStop(p.estado) }}</span>
          </li>
        </ol>
      </section>

      <!-- Desglose de pendientes -->
      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Qué requiere atención</h2>
            <p class="card-sub">Desglose de pendientes operativos.</p>
          </div>
        </div>
        <div class="list-rows">
          <RouterLink to="/pedidos" class="list-row link-row">
            <span>Pedidos por cobrar</span><strong class="font-mono">{{ porCobrar }}</strong>
          </RouterLink>
          <RouterLink to="/despacho" class="list-row link-row">
            <span>Pagados sin asignar a ruta</span><strong class="font-mono">{{ porAsignar }}</strong>
          </RouterLink>
          <RouterLink to="/despacho" class="list-row link-row">
            <span>Ausencias a reprogramar</span><strong class="font-mono">{{ ausentes }}</strong>
          </RouterLink>
          <RouterLink to="/inventario" class="list-row link-row">
            <span>Envases pendientes de devolución</span><strong class="font-mono">{{ inv.pendientesDevolucion }}</strong>
          </RouterLink>
          <RouterLink to="/inventario" class="list-row link-row" :class="{ 'row-danger': inv.noRetornaron30d > 0 }">
            <span>No retornados (30+ días)</span><strong class="font-mono">{{ inv.noRetornaron30d }}</strong>
          </RouterLink>
          <RouterLink to="/inventario" class="list-row link-row" :class="{ 'row-danger': inv.rotosBodega > 0 }">
            <span>Rotos esperando baja</span><strong class="font-mono">{{ inv.rotosBodega }}</strong>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ClipboardList, Clock, Info, MapPinned, PackageCheck, Warehouse } from 'lucide-vue-next';
import { appStore } from '../../store/useAppStore';
import { formatCLP, formatEstadoStop, getBadgeStopClass, hoyISO } from '../../utils/formato';

const inv = computed(() => appStore.state.inventario);
const turno = computed(() => appStore.state.turnoActivo);
const paradas = computed(() => appStore.pedidosDespachoActivo.value);

const pedidosHoy = computed(() => appStore.state.pedidos.filter(p => p.fechaCreacion.startsWith(hoyISO())));
const ventasHoy = computed(() => pedidosHoy.value
  .filter(p => p.estado !== 'pendiente_pago' && p.estado !== 'cancelado')
  .reduce((acc, p) => acc + p.total, 0));
const porCobrarHoy = computed(() => pedidosHoy.value.filter(p => p.estado === 'pendiente_pago').length);

const entregadas = computed(() => paradas.value.filter(p => p.estado === 'entregado' || p.estado === 'parcial').length);
const porVisitar = computed(() => paradas.value.filter(p => p.estado === 'en_despacho').length);
const ausentes = computed(() => appStore.state.pedidos.filter(p => p.estado === 'ausente').length);
const pctEntregas = computed(() => (paradas.value.length ? (entregadas.value / paradas.value.length) * 100 : 0));

const porCobrar = computed(() => appStore.state.pedidos.filter(p => p.estado === 'pendiente_pago').length);
const porAsignar = computed(() => appStore.state.pedidos.filter(p => p.estado === 'pagado').length);
const totalPendientes = computed(() => porCobrar.value + porAsignar.value + ausentes.value);
</script>

<style scoped>
.data-note {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--zun-gris);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.kpi {
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-decoration: none;
  color: inherit;
}

.kpi:hover {
  border-color: var(--zun-rojo);
  box-shadow: 3px 3px 0 var(--zun-rojo);
  transform: translate(-2px, -2px);
}

.kpi-alert {
  border-color: rgba(245, 158, 11, 0.5);
  background: var(--zun-ambar-light);
}

.kpi-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--zun-gris);
}

.kpi-value {
  font-family: var(--font-mono);
  font-size: 2.4rem;
  font-weight: 800;
  line-height: 1;
  color: var(--zun-negro);
}

.kpi-of {
  font-size: 1rem;
  font-weight: 500;
  color: var(--zun-gris);
  margin-left: 6px;
}

.kpi-sub {
  font-size: 0.8rem;
  color: var(--zun-gris);
}

.kpi-bar {
  height: 6px;
  background: var(--zun-border);
  border-radius: 9999px;
  overflow: hidden;
}

.kpi-fill {
  height: 100%;
  background: var(--zun-verde);
  transition: width 0.3s;
}

.two-col {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.route-steps {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.route-step {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--zun-border);
}

.route-step:last-child {
  border-bottom: none;
}

.step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid var(--zun-negro);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  flex-shrink: 0;
}

.route-step.is-entregado .step-dot,
.route-step.is-parcial .step-dot {
  background: var(--zun-verde);
  border-color: var(--zun-verde);
  color: #ffffff;
}

.route-step.is-ausente .step-dot {
  border-color: var(--zun-rojo);
  color: var(--zun-rojo);
}

.step-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.link-row {
  text-decoration: none;
  color: var(--zun-text);
  font-size: 0.88rem;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.link-row:hover {
  border-color: var(--zun-rojo);
  background: var(--zun-blanco);
}

.row-danger {
  background: var(--zun-rojo-light);
  border-color: rgba(255, 38, 42, 0.3);
}

@media (max-width: 1000px) {
  .two-col {
    grid-template-columns: 1fr;
  }
}
</style>
