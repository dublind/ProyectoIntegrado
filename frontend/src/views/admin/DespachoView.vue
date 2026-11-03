<template>
  <div class="view-stack">
    <!-- Furgones -->
    <div class="fleet-grid">
      <div v-for="v in appStore.state.vehiculos" :key="v.id"
        :class="['card', 'fleet-card', { 'is-active': v.id === turno.vehiculoId }]">
        <div class="fleet-head">
          <span class="fleet-icon"><Truck :size="22" /></span>
          <div class="fleet-name">
            <h3>{{ v.modelo }}</h3>
            <span class="font-mono text-sm text-muted">{{ v.patente }} · {{ v.choferAsignado }}</span>
          </div>
          <span v-if="v.id === turno.vehiculoId" :class="['badge', turno.estado === 'finalizado' ? 'badge-neutral' : 'badge-success']">
            {{ turno.estado === 'finalizado' ? 'Turno cerrado' : `Turno ${turno.turno}` }}
          </span>
          <span v-else class="badge badge-neutral">Sin turno</span>
        </div>

        <template v-if="v.id === turno.vehiculoId">
          <div class="cap-box">
            <div class="cap-header">
              <span>Envases a bordo</span>
              <strong class="font-mono">{{ turno.botellonesCargados }} / {{ turno.capacidadMax }}</strong>
            </div>
            <div class="cap-bar" role="progressbar" :aria-valuenow="turno.botellonesCargados" :aria-valuemax="turno.capacidadMax">
              <div class="cap-fill" :style="{ width: `${Math.min(100, (turno.botellonesCargados / turno.capacidadMax) * 100)}%` }"></div>
            </div>
            <span class="text-xs text-muted">{{ appStore.cargaFurgon.value.llenos }} llenos por entregar · {{
              appStore.cargaFurgon.value.vacios }} vacíos recogidos · N_max parametrizable</span>
          </div>
          <div class="fleet-foot">
            <span class="text-sm">{{ paradasPendientes }} de {{ appStore.pedidosDespachoActivo.value.length }} paradas por
              visitar</span>
            <div class="toolbar-actions">
              <RouterLink to="/seguimiento" class="btn btn-secondary btn-sm"><MapPinned :size="14" /> Ver en mapa</RouterLink>
              <button v-if="turno.pedidosIds.length > 0" @click="liquidar" class="btn btn-success btn-sm">
                Liquidar retorno
              </button>
            </div>
          </div>
        </template>
        <p v-else class="text-sm text-muted">Disponible para un segundo turno. Capacidad {{ v.capacidadMax }} botellones.</p>
      </div>
    </div>

    <div class="despacho-grid">
      <!-- Cola de pedidos pagados -->
      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Pedidos pagados por asignar</h2>
            <p class="card-sub">Se cargan al furgón activo respetando N_max.</p>
          </div>
          <span class="badge badge-primary">{{ pedidosListos.length }}</span>
        </div>
        <div v-if="pedidosListos.length === 0" class="empty-box">Todos los pedidos pagados ya están en ruta.</div>
        <div v-else class="list-rows">
          <div v-for="p in pedidosListos" :key="p.id" class="list-row">
            <div class="row-main">
              <span class="font-bold">{{ p.codigo }} · {{ p.clienteNombre }}</span>
              <span class="text-sm text-muted">{{ p.direccion }}, {{ p.comuna }}</span>
              <span class="text-xs text-muted">{{ p.cantidadBidones }} botellón(es) · {{ p.promesaEntrega }}</span>
            </div>
            <button @click="asignar(p)" class="btn btn-primary btn-sm">Asignar al furgón</button>
          </div>
        </div>
      </section>

      <div class="side-stack">
        <!-- Ausencias informadas por el chofer -->
        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">Ausencias a reprogramar</h2>
              <p class="card-sub">Coordina con el cliente si el chofer vuelve hoy o mañana.</p>
            </div>
            <span :class="['badge', ausencias.length ? 'badge-danger' : 'badge-neutral']">{{ ausencias.length }}</span>
          </div>
          <div v-if="ausencias.length === 0" class="empty-box">Sin ausencias en el turno.</div>
          <div v-else class="list-rows">
            <div v-for="p in ausencias" :key="p.id" class="list-row">
              <div class="row-main">
                <span class="font-bold">{{ p.clienteNombre }}</span>
                <span class="text-xs text-muted">{{ p.codigo }} · {{ p.cantidadBidones }} lleno(s) a bordo · {{ p.telefono }}</span>
              </div>
              <div class="row-actions">
                <button @click="reprogramar(p, 'hoy')" class="btn btn-secondary btn-sm">Volver hoy</button>
                <button @click="reprogramar(p, 'manana')" class="btn btn-secondary btn-sm">Mañana</button>
              </div>
            </div>
          </div>
        </section>

        <!-- Saldos de parciales -->
        <section class="card">
          <div class="card-head">
            <div>
              <h2 class="card-title">Saldos de entregas parciales</h2>
              <p class="card-sub">Ya pagados: pasan al turno siguiente sin nuevo cobro.</p>
            </div>
            <span :class="['badge', saldos.length ? 'badge-warning' : 'badge-neutral']">{{ saldos.length }}</span>
          </div>
          <div v-if="saldos.length === 0" class="empty-box">Sin saldos pendientes.</div>
          <div v-else class="list-rows">
            <div v-for="p in saldos" :key="p.id" class="list-row">
              <div class="row-main">
                <span class="font-bold">{{ p.clienteNombre }}</span>
                <span class="text-xs text-muted">{{ p.codigo }} · entregados {{ p.cantidadEntregada }} de {{
                  p.cantidadBidones }} · saldo {{ p.cantidadBidones - (p.cantidadEntregada ?? 0) }} · aceptado por
                  el cliente</span>
              </div>
              <button @click="programarSaldo(p)" class="btn btn-secondary btn-sm">Programar saldo</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { MapPinned, Truck } from 'lucide-vue-next';
import { appStore } from '../../store/useAppStore';
import { notificar } from '../../store/useToast';
import type { Pedido } from '../../types';

const turno = computed(() => appStore.state.turnoActivo);
const pedidosListos = computed(() => appStore.state.pedidos.filter(p => p.estado === 'pagado'));
const paradasPendientes = computed(() => appStore.pedidosDespachoActivo.value.filter(p => p.estado === 'en_despacho').length);
const ausencias = computed(() => appStore.state.pedidos.filter(p => p.estado === 'ausente'));
const saldos = computed(() => appStore.state.pedidos.filter(p =>
  p.estado === 'parcial' && !p.saldoProgramado && (p.cantidadEntregada ?? p.cantidadBidones) < p.cantidadBidones
));

function asignar(p: Pedido) {
  try {
    appStore.asignarPedidoADespacho(p.id);
    notificar(`${p.codigo} asignado al furgón activo.`, 'exito');
  } catch (err) {
    notificar((err as Error).message, 'error', 6000);
  }
}

function reprogramar(p: Pedido, cuando: 'hoy' | 'manana') {
  appStore.reprogramarAusente(p.id, cuando);
  notificar(cuando === 'hoy'
    ? `${p.clienteNombre} vuelve a la ruta de hoy.`
    : `${p.codigo} reprogramado para mañana y devuelto a la cola de despacho.`, 'info');
}

function programarSaldo(p: Pedido) {
  appStore.programarSaldoParcial(p.id);
  notificar(`Saldo de ${p.codigo} agregado a la cola con su pago original.`, 'exito');
}

function liquidar() {
  const r = appStore.liquidarRetornoFurgonCentral();
  notificar(`Retorno liquidado: ${r.vaciosRecolectados} vacíos y ${r.llenosNoEntregados} llenos ingresan a bodega central.`, 'exito', 6000);
}
</script>

<style scoped>
.fleet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}

.fleet-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fleet-card.is-active {
  border: 2px solid var(--zun-negro);
}

.fleet-head {
  display: flex;
  align-items: center;
  gap: 14px;
}

.fleet-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.fleet-name {
  flex: 1;
  min-width: 0;
}

.fleet-name h3 {
  font-family: var(--font-display);
  font-size: 1.02rem;
  font-weight: 800;
  color: var(--zun-negro);
}

.cap-box {
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
}

.cap-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.86rem;
  margin-bottom: 8px;
}

.cap-bar {
  height: 8px;
  background: var(--zun-border);
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 6px;
}

.cap-fill {
  height: 100%;
  background: var(--zun-negro);
  border-radius: 9999px;
  transition: width 0.3s;
}

.fleet-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.despacho-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.side-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

@media (max-width: 1100px) {
  .despacho-grid {
    grid-template-columns: 1fr;
  }
}
</style>
