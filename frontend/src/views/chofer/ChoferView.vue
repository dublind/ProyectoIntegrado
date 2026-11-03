<template>
  <div class="driver-backdrop">
    <div class="driver-app">
      <!-- Barra superior de la app -->
      <header class="app-bar">
        <RouterLink to="/despacho" class="icon-btn" aria-label="Volver al panel"><ArrowLeft :size="20" /></RouterLink>
        <div class="app-bar-title">
          <strong>Mi ruta</strong>
          <span>{{ turno.choferNombre }} · turno {{ turno.turno }}</span>
        </div>
        <button @click="appStore.state.modoOffline = !appStore.state.modoOffline"
          :class="['net-pill', { offline: appStore.state.modoOffline }]" :aria-pressed="appStore.state.modoOffline">
          <component :is="appStore.state.modoOffline ? WifiOff : Wifi" :size="14" />
          {{ appStore.state.modoOffline ? 'Offline' : 'Online' }}
        </button>
      </header>

      <div v-if="appStore.state.modoOffline" class="offline-banner">
        Sin conexión: los cambios se guardan en el teléfono y se sincronizan al reconectar.
      </div>

      <!-- Resumen de carga -->
      <section class="cargo">
        <div class="cargo-col">
          <span class="c-val">{{ llenosPorEntregar }}</span>
          <span class="c-lbl">Llenos por entregar</span>
        </div>
        <div class="cargo-col">
          <span class="c-val">{{ turno.botellonesCargados }}</span>
          <span class="c-lbl">Envases a bordo</span>
        </div>
        <div class="cargo-col">
          <span :class="['c-val', { 'text-warning': retirosTotales > 0 }]">{{ retirosTotales }}</span>
          <span class="c-lbl">Vacíos a retirar</span>
        </div>
      </section>

      <div class="progress-strip">
        <div class="progress-fill" :style="{ width: `${progreso}%` }"></div>
      </div>

      <!-- Pestañas -->
      <div class="tabs" role="tablist">
        <button role="tab" :aria-selected="tab === 'pendientes'" :class="{ active: tab === 'pendientes' }" @click="tab = 'pendientes'">
          Por visitar <span class="tab-count">{{ pendientes.length }}</span>
        </button>
        <button role="tab" :aria-selected="tab === 'completadas'" :class="{ active: tab === 'completadas' }" @click="tab = 'completadas'">
          Completadas <span class="tab-count">{{ completadas.length }}</span>
        </button>
      </div>

      <main class="stops">
        <p v-if="paradas.length === 0" class="empty-box">No tienes paradas asignadas. Espera la carga del próximo turno.</p>
        <p v-else-if="listaActual.length === 0" class="empty-box">
          {{ tab === 'pendientes' ? '¡Ruta completa! Vuelve a bodega central para liquidar.' : 'Aún no completas paradas.' }}
        </p>

        <article v-for="p in listaActual" :key="p.id"
          :class="['stop', { 'is-next': p.id === siguienteId, 'is-absent': p.estado === 'ausente' }]">
          <div class="stop-head">
            <span class="stop-seq">Parada {{ ordenDe(p.id) }}</span>
            <span :class="['badge', getBadgeStopClass(p.estado)]">{{ formatEstadoStop(p.estado) }}</span>
          </div>

          <h2 class="stop-client">{{ p.clienteNombre }}</h2>
          <p class="stop-address"><MapPin :size="14" /> {{ p.direccion }}, {{ p.comuna }}</p>

          <div class="stop-chips">
            <span class="chip"><Droplet :size="13" /> {{ p.cantidadBidones }} × {{ p.tipoProducto.replace('Agua Purificada ', '') }}</span>
            <span class="chip chip-ok">Pagado</span>
          </div>

          <!-- Retiro pendiente de entregas anteriores (sin antigüedad: reservado al administrativo) -->
          <div v-if="retirosDe(p.clienteId) > 0" class="pickup-box">
            <div>
              <strong>Retirar {{ retirosDe(p.clienteId) }} envase(s) vacío(s)</strong>
              <span>Pendiente de una entrega anterior.</span>
            </div>
            <button @click="retirar(p)" class="btn btn-secondary btn-sm">Retirado</button>
          </div>

          <template v-if="p.estado === 'en_despacho'">
            <button @click="entregar(p)" class="btn btn-success btn-main">
              <Check :size="18" /> Entregado
            </button>
            <div class="sub-actions">
              <button @click="abrirNovedad(p)" class="btn btn-secondary btn-sub">
                <AlertTriangle :size="15" /> Reportar novedad
              </button>
              <a :href="`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.direccion + ', ' + p.comuna)}`"
                target="_blank" rel="noopener" class="btn btn-secondary btn-sub">
                <Navigation :size="15" /> Navegar
              </a>
            </div>
          </template>

          <div v-else-if="p.estado === 'ausente'" class="result result-warn">
            Cliente ausente. Informado al administrativo para coordinar regreso hoy o mañana.
          </div>
          <div v-else class="result">
            <template v-if="p.estado === 'parcial'">
              Entrega parcial: {{ p.cantidadEntregada }} de {{ p.cantidadBidones }}. Saldo aceptado por el cliente, sin
              nuevo cobro.
            </template>
            <template v-else-if="p.envasesNoDevueltos">
              Entregado. {{ p.envasesNoDevueltos }} vacío(s) quedaron pendientes de devolución.
            </template>
            <template v-else>Entregado con intercambio de envases.</template>
          </div>
        </article>
      </main>

      <!-- Hoja inferior: reportar novedad -->
      <Transition name="sheet">
        <div v-if="novedadPedido" class="sheet-overlay" @click.self="cerrarNovedad">
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-novedad">
            <div class="sheet-grip"></div>
            <h3 id="titulo-novedad">Reportar novedad</h3>
            <p class="sheet-sub">{{ novedadPedido.clienteNombre }} · {{ novedadPedido.cantidadBidones }} botellón(es). Sin
              fotografía obligatoria.</p>

            <div class="options">
              <label :class="['option', { selected: tipoNovedad === 'ausente' }]">
                <input type="radio" value="ausente" v-model="tipoNovedad" />
                <DoorClosed :size="20" />
                <span><strong>Cliente ausente</strong><small>No se entrega. El administrativo coordina volver hoy o
                    mañana.</small></span>
              </label>
              <label :class="['option', { selected: tipoNovedad === 'pendiente' }]">
                <input type="radio" value="pendiente" v-model="tipoNovedad" />
                <PackageX :size="20" />
                <span><strong>Vacío no devuelto</strong><small>Se entrega el agua; el envase queda pendiente de
                    devolución.</small></span>
              </label>
              <label :class="['option', { selected: tipoNovedad === 'roto' }]">
                <input type="radio" value="roto" v-model="tipoNovedad" />
                <ShieldAlert :size="20" />
                <span><strong>Botellón roto (entrega parcial)</strong><small>Se informa al administrativo; el saldo pasa al
                    turno siguiente.</small></span>
              </label>
            </div>

            <div v-if="tipoNovedad === 'pendiente' || tipoNovedad === 'roto'" class="stepper-row">
              <span>{{ tipoNovedad === 'roto' ? 'Botellones rotos' : 'Vacíos no devueltos' }}</span>
              <div class="stepper">
                <button @click="cantidadNovedad = Math.max(1, cantidadNovedad - 1)" aria-label="Menos">−</button>
                <strong>{{ cantidadNovedad }}</strong>
                <button @click="cantidadNovedad = Math.min(novedadPedido.cantidadBidones, cantidadNovedad + 1)" aria-label="Más">+</button>
              </div>
            </div>

            <div v-if="tipoNovedad === 'roto'" :class="['form-group', { 'has-error': errorAceptacion }]">
              <label class="check">
                <input type="checkbox" v-model="aceptacionCliente" @change="errorAceptacion = ''" />
                Informé al cliente y aceptó recibir {{ novedadPedido.cantidadBidones - cantidadNovedad }} de {{
                  novedadPedido.cantidadBidones }}
              </label>
              <span v-if="errorAceptacion" class="field-error" role="alert">{{ errorAceptacion }}</span>
            </div>

            <div class="sheet-actions">
              <button @click="cerrarNovedad" class="btn btn-secondary">Cancelar</button>
              <button @click="enviarNovedad" class="btn btn-primary" :disabled="!tipoNovedad">Registrar</button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  AlertTriangle, ArrowLeft, Check, DoorClosed, Droplet, MapPin, Navigation, PackageX, ShieldAlert, Wifi, WifiOff
} from 'lucide-vue-next';
import { appStore } from '../../store/useAppStore';
import { notificar } from '../../store/useToast';
import { formatEstadoStop, getBadgeStopClass } from '../../utils/formato';
import type { Pedido } from '../../types';

const turno = computed(() => appStore.state.turnoActivo);
const paradas = computed(() => appStore.pedidosDespachoActivo.value);
const pendientes = computed(() => paradas.value.filter(p => p.estado === 'en_despacho' || p.estado === 'ausente'));
const completadas = computed(() => paradas.value.filter(p => p.estado === 'entregado' || p.estado === 'parcial'));
const siguienteId = computed(() => paradas.value.find(p => p.estado === 'en_despacho')?.id);

const tab = ref<'pendientes' | 'completadas'>('pendientes');
const listaActual = computed(() => (tab.value === 'pendientes' ? pendientes.value : completadas.value));

const llenosPorEntregar = computed(() => paradas.value
  .filter(p => p.estado === 'en_despacho' || p.estado === 'ausente')
  .reduce((acc, p) => acc + p.cantidadBidones, 0));
const retirosTotales = computed(() => {
  const clientes = new Set(paradas.value.map(p => p.clienteId));
  return [...clientes].reduce((acc, id) => acc + appStore.retirosPendientesCliente(id), 0);
});
const progreso = computed(() => (paradas.value.length ? (completadas.value.length / paradas.value.length) * 100 : 0));

function ordenDe(id: string) {
  return paradas.value.findIndex(p => p.id === id) + 1;
}

function retirosDe(clienteId: string) {
  return appStore.retirosPendientesCliente(clienteId);
}

function entregar(p: Pedido) {
  appStore.confirmarEntregaChofer(p.id);
  notificar(`Entrega a ${p.clienteNombre} registrada.`, 'exito', 2800);
}

function retirar(p: Pedido) {
  const n = appStore.registrarRetiroChofer(p.id);
  if (n > 0) notificar(`${n} envase(s) retirado(s). Alerta resuelta.`, 'exito', 2800);
}

// Hoja de novedades
const novedadPedido = ref<Pedido | null>(null);
const tipoNovedad = ref<'' | 'pendiente' | 'ausente' | 'roto'>('');
const cantidadNovedad = ref(1);
const aceptacionCliente = ref(false);
const errorAceptacion = ref('');

watch(tipoNovedad, () => {
  cantidadNovedad.value = 1;
  errorAceptacion.value = '';
});

function abrirNovedad(p: Pedido) {
  novedadPedido.value = p;
  tipoNovedad.value = '';
  aceptacionCliente.value = false;
  errorAceptacion.value = '';
}

function cerrarNovedad() {
  novedadPedido.value = null;
}

function enviarNovedad() {
  const p = novedadPedido.value;
  if (!p || !tipoNovedad.value) return;

  if (tipoNovedad.value === 'roto' && !aceptacionCliente.value) {
    errorAceptacion.value = 'Confirma que informaste al cliente y que aceptó la entrega parcial.';
    return;
  }

  const detalles = {
    pendiente: `${cantidadNovedad.value} vacío(s) no devuelto(s) por el cliente.`,
    ausente: 'No respondió llamadas ni timbre.',
    roto: `${cantidadNovedad.value} botellón(es) fisurado(s) en el traslado. Entrega parcial aceptada.`
  };

  try {
    appStore.reportarIncidenciaChofer(p.id, tipoNovedad.value, detalles[tipoNovedad.value], {
      cantidad: cantidadNovedad.value,
      aceptacionCliente: aceptacionCliente.value
    });
    notificar(tipoNovedad.value === 'ausente'
      ? 'Ausencia informada al administrativo.'
      : 'Novedad registrada e informada al administrativo.', 'info', 3000);
    cerrarNovedad();
  } catch (err) {
    errorAceptacion.value = (err as Error).message;
  }
}
</script>

<style scoped>
.driver-backdrop {
  min-height: 100vh;
  background: var(--zun-gris-cielo);
  display: flex;
  justify-content: center;
}

.driver-app {
  position: relative;
  width: 100%;
  max-width: 460px;
  min-height: 100vh;
  background: var(--zun-blanco-cielo);
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 0 1px var(--zun-border), 0 20px 50px -20px rgba(0, 0, 0, 0.25);
}

.app-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--zun-negro);
  color: #ffffff;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.app-bar-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.app-bar-title strong {
  font-size: 1.05rem;
}

.app-bar-title span {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  opacity: 0.75;
}

.net-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  background: var(--zun-verde);
  color: #ffffff;
}

.net-pill.offline {
  background: var(--zun-ambar);
}

.offline-banner {
  padding: 10px 16px;
  background: var(--zun-ambar-light);
  color: #92400e;
  font-size: 0.8rem;
  border-bottom: 1px solid rgba(245, 158, 11, 0.4);
}

.cargo {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 18px 12px;
  background: var(--zun-blanco);
}

.cargo-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border-right: 1px solid var(--zun-border);
}

.cargo-col:last-child {
  border-right: none;
}

.c-val {
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--zun-negro);
  line-height: 1.1;
}

.c-lbl {
  font-size: 0.7rem;
  color: var(--zun-gris);
  font-weight: 600;
  margin-top: 4px;
}

.progress-strip {
  height: 4px;
  background: var(--zun-border);
}

.progress-fill {
  height: 100%;
  background: var(--zun-verde);
  transition: width 0.35s;
}

.tabs {
  display: flex;
  gap: 6px;
  padding: 12px 16px 0;
}

.tabs button {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--zun-gris);
  border: 1px solid var(--zun-border);
  background: var(--zun-blanco);
}

.tabs button.active {
  background: var(--zun-negro);
  border-color: var(--zun-negro);
  color: #ffffff;
}

.tab-count {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  opacity: 0.7;
  margin-left: 4px;
}

.stops {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 16px 32px;
}

.stop {
  background: var(--zun-blanco);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-md);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: var(--shadow-sm);
}

.stop.is-next {
  border: 2px solid var(--zun-negro);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.stop.is-absent {
  border-color: rgba(255, 38, 42, 0.35);
}

.stop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stop-seq {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--zun-gris);
}

.stop-client {
  font-size: 1.12rem;
  font-weight: 800;
  color: var(--zun-negro);
  line-height: 1.25;
}

.stop-address {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.86rem;
  color: var(--zun-gris-dark);
}

.stop-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
}

.chip-ok {
  color: #065f46;
  background: var(--zun-verde-light);
  border-color: rgba(16, 185, 129, 0.3);
}

.pickup-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--zun-ambar-light);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #92400e;
  font-size: 0.82rem;
}

.pickup-box div {
  display: flex;
  flex-direction: column;
}

.btn-main {
  width: 100%;
  padding: 16px;
  font-size: 1.02rem;
  font-weight: 800;
}

.sub-actions {
  display: flex;
  gap: 10px;
}

.btn-sub {
  flex: 1;
  padding: 11px 8px;
  font-size: 0.82rem;
}

.result {
  font-size: 0.84rem;
  font-weight: 600;
  color: #065f46;
}

.result-warn {
  color: #991b1b;
}

/* Hoja inferior */
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(17, 17, 17, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 460px;
  background: var(--zun-blanco);
  border-radius: 20px 20px 0 0;
  padding: 10px 20px calc(20px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 92vh;
  overflow-y: auto;
}

.sheet-grip {
  width: 44px;
  height: 5px;
  border-radius: 9999px;
  background: var(--zun-gris-light);
  align-self: center;
}

.sheet h3 {
  font-size: 1.15rem;
  font-weight: 800;
}

.sheet-sub {
  font-size: 0.82rem;
  color: var(--zun-gris);
  margin-top: -8px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.option input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.option.selected {
  border: 2px solid var(--zun-negro);
  background: var(--zun-blanco-sutil);
}

.option span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option small {
  font-size: 0.78rem;
  color: var(--zun-gris);
  line-height: 1.4;
}

.stepper-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.88rem;
  font-weight: 600;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stepper button {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--zun-border);
  font-size: 1.2rem;
  font-weight: 700;
}

.stepper strong {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  min-width: 20px;
  text-align: center;
}

.check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.86rem !important;
  font-weight: 600 !important;
  line-height: 1.4;
}

.check input {
  width: 20px;
  height: 20px;
  padding: 0;
  margin-top: 1px;
  flex-shrink: 0;
  accent-color: var(--zun-negro);
}

.sheet-actions {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
}

.sheet-actions .btn:disabled {
  opacity: 0.45;
  pointer-events: none;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(100%);
}

@media (min-width: 520px) {
  .driver-backdrop {
    padding: 24px 0;
  }

  .driver-app {
    min-height: calc(100vh - 48px);
    border-radius: 28px;
    overflow: clip; /* clip (no hidden) para no romper la barra sticky */
  }
}
</style>
