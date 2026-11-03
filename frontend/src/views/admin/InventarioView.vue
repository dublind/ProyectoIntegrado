<template>
  <div class="view-stack">
    <div class="view-toolbar">
      <p class="text-sm text-muted">Los envases fuera de bodega no se cuentan como disponibles. Los rotos siguen en el total
        físico hasta su baja.</p>
      <div class="toolbar-actions">
        <button @click="appStore.sincronizarInventario()" class="btn btn-secondary btn-sm">
          <RefreshCw :size="14" /> Sincronizar
        </button>
        <button @click="confirmarReset = true" class="btn btn-secondary btn-sm">
          <RotateCcw :size="14" /> Restablecer demo
        </button>
      </div>
    </div>

    <!-- Auditoría de cuadratura: se recalcula con cada acción del panel o del chofer -->
    <section :class="['card', 'audit-card', auditoria.ok ? 'audit-ok' : 'audit-fail']">
      <div class="card-head">
        <div>
          <h2 class="card-title">
            <component :is="auditoria.ok ? ShieldCheck : ShieldAlert" :size="18" />
            {{ auditoria.ok ? 'Cuadratura correcta' : 'Descuadre detectado' }}
          </h2>
          <p class="card-sub">Se verifica en cada acción, incluidas las que registra el chofer desde su app. Última
            actualización: {{ horaActualizacion }}.</p>
        </div>
      </div>
      <ul class="audit-list">
        <li v-for="c in auditoria.controles" :key="c.nombre" :class="{ fail: !c.ok }">
          <component :is="c.ok ? CircleCheck : CircleX" :size="16" />
          <strong>{{ c.nombre }}</strong>
          <span>{{ c.detalle }}</span>
        </li>
      </ul>
    </section>

    <!-- Pedidos de prueba -->
    <section class="card demo-card">
      <div>
        <h2 class="card-title">Pedidos de prueba</h2>
        <p class="card-sub">Crea compras ficticias con las mismas acciones de la app: ~25% queda por cobrar, el resto se
          paga y se carga al furgón mientras haya capacidad.</p>
      </div>
      <div class="demo-actions">
        <select v-model.number="cantidadDemo" aria-label="Cantidad de pedidos de prueba">
          <option :value="5">5 pedidos</option>
          <option :value="10">10 pedidos</option>
          <option :value="20">20 pedidos</option>
          <option :value="40">40 pedidos</option>
        </select>
        <button @click="generarDemo" class="btn btn-primary btn-sm"><Sparkles :size="14" /> Generar</button>
      </div>
    </section>

    <!-- Disponibles vs total físico (PBI 72, criterio 4) -->
    <div class="split-grid">
      <section class="card stock-block">
        <span class="block-label">Disponibles para despacho</span>
        <div class="block-value">{{ inv.llenosCentral }}<span class="unit">llenos en bodega central</span></div>
      </section>
      <section class="card stock-block">
        <span class="block-label">Total físico en bodega</span>
        <div class="block-value">{{ totalFisicoBodega }}<span class="unit">llenos + vacíos + rotos</span></div>
      </section>
      <section class="card stock-block">
        <span class="block-label">En el furgón</span>
        <div class="block-value">{{ carga.total }}<span class="unit">{{ carga.llenos }} llenos por entregar · {{ carga.vacios }}
            vacíos recogidos</span></div>
      </section>
      <section class="card stock-block">
        <span class="block-label">En clientes</span>
        <div class="block-value">{{ inv.pendientesDevolucion }}<span class="unit">envases pendientes de devolución</span></div>
      </section>
    </div>

    <!-- Ecuación continua -->
    <section class="card sync-card">
      <div class="card-head">
        <div>
          <h2 class="card-title">Cuadratura continua de stock</h2>
          <p class="card-sub">Sincronizada con despacho, chofer y fichas de clientes.</p>
        </div>
        <span class="badge badge-primary">En tiempo real</span>
      </div>
      <div class="equation-strip">
        <div class="eq-item"><span class="eq-num">{{ inv.llenosCentral }}</span><span class="eq-lbl">Llenos</span></div>
        <span class="eq-op">+</span>
        <div class="eq-item"><span class="eq-num text-success">{{ inv.vaciosCentral }}</span><span class="eq-lbl">Vacíos</span></div>
        <span class="eq-op">+</span>
        <div class="eq-item"><span class="eq-num">{{ inv.enTransito }}</span><span class="eq-lbl">En furgón</span></div>
        <span class="eq-op">+</span>
        <div class="eq-item"><span class="eq-num text-warning">{{ inv.pendientesDevolucion }}</span><span class="eq-lbl">Pendientes</span></div>
        <span class="eq-op">+</span>
        <div class="eq-item"><span class="eq-num text-danger">{{ inv.rotosBodega }}</span><span class="eq-lbl">Rotos</span></div>
        <span class="eq-op">=</span>
        <div class="eq-total"><span class="eq-num font-mono">{{ appStore.totalStockContinuo.value }}</span><span class="eq-lbl">Stock total</span></div>
      </div>
      <div class="sync-ops">
        <span class="text-sm text-muted">Bajas definitivas acumuladas: <strong>{{ inv.bajasDefinitivas60d }}</strong>
          (fuera del total)</span>
        <div class="toolbar-actions">
          <button v-if="inv.vaciosCentral >= 10" @click="appStore.sanitizarYRecargar(10)" class="btn btn-secondary btn-sm">
            Sanitizar y rellenar 10 vacíos
          </button>
          <button v-if="inv.rotosBodega > 0" @click="confirmarBajaRoto = true" class="btn btn-danger-outline btn-sm">
            Autorizar baja de roto ({{ inv.rotosBodega }})
          </button>
        </div>
      </div>
    </section>

    <!-- Envases pendientes de devolución (PBI 72, criterios 1-3) -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2 class="card-title">Envases pendientes de devolución</h2>
          <p class="card-sub">A los 30 días pasan a no retornados; a los 60, solo el administrador puede darlos de baja.</p>
        </div>
        <div class="legend">
          <span class="badge badge-warning">Pendiente</span>
          <span class="badge badge-danger">No retornó (30+)</span>
        </div>
      </div>
      <div v-if="appStore.registrosPendientes.value.length === 0" class="empty-box">No hay envases pendientes. 👌</div>
      <div v-else class="table-wrap">
        <table class="mini-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Pedido</th>
              <th>Fecha original</th>
              <th>Antigüedad</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in appStore.registrosPendientes.value" :key="r.id">
              <td class="font-bold">{{ r.clienteNombre }} <span class="text-xs text-muted">({{ r.cantidad }})</span></td>
              <td class="font-mono">{{ r.pedidoCodigo }}</td>
              <td class="font-mono">{{ formatFechaCorta(r.fechaOrigen) }}</td>
              <td class="font-mono">{{ r.dias }} días</td>
              <td>
                <span v-if="r.dias >= 60" class="badge badge-danger">Baja disponible</span>
                <span v-else-if="r.dias >= 30" class="badge badge-danger">No retornó</span>
                <span v-else class="badge badge-warning">Pendiente</span>
              </td>
              <td class="cell-right">
                <button v-if="r.dias >= 60" @click="registroBaja = r" class="btn btn-danger-outline btn-sm">Dar de baja</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details v-if="historial.length" class="historial">
        <summary>Historial de resoluciones ({{ historial.length }})</summary>
        <div class="list-rows">
          <div v-for="r in historial" :key="r.id" class="list-row">
            <div class="row-main">
              <span class="font-bold">{{ r.clienteNombre }} · {{ r.pedidoCodigo }}</span>
              <span class="text-xs text-muted">Origen {{ formatFechaCorta(r.fechaOrigen) }} · resuelto {{ r.fechaResolucion }}</span>
            </div>
            <span :class="['badge', r.estado === 'retirado' ? 'badge-success' : 'badge-danger']">
              {{ r.estado === 'retirado' ? 'Retirado' : 'Baja por no retorno' }}
            </span>
          </div>
        </div>
      </details>
    </section>

    <!-- Cuentas bancarias -->
    <section class="card">
      <div class="card-head">
        <div>
          <h2 class="card-title">Cuentas bancarias de transferencias</h2>
          <p class="card-sub">Al acumular 45 comprobantes se conmuta automáticamente a la siguiente cuenta.</p>
        </div>
        <span class="badge badge-primary">Regla activa</span>
      </div>
      <div class="list-rows">
        <div v-for="cta in appStore.state.cuentasBancarias" :key="cta.id" :class="['list-row', { 'is-active-account': cta.activa }]">
          <div class="row-main">
            <span class="acc-title">
              <strong>{{ cta.banco }}</strong>
              <span v-if="cta.activa" class="badge badge-success">Activa</span>
              <span v-else class="badge badge-neutral">En espera</span>
            </span>
            <span class="text-sm font-mono text-muted">{{ cta.tipoCuenta }} · {{ cta.numeroCuenta }}</span>
          </div>
          <div class="acc-counter">
            <div class="counter-label"><span>Comprobantes</span><strong>{{ cta.comprobantesProcesados }} / 45</strong></div>
            <div class="counter-bar"><div class="counter-fill" :style="{ width: `${(cta.comprobantesProcesados / 45) * 100}%` }"></div></div>
          </div>
        </div>
      </div>
    </section>

    <!-- Confirmaciones (reemplazan confirm() del navegador) -->
    <div v-if="confirmarBajaRoto" class="modal-overlay" @click.self="confirmarBajaRoto = false">
      <div class="modal-content modal-sm" role="alertdialog" aria-modal="true">
        <div class="modal-header"><h3>Autorizar baja física</h3></div>
        <div class="modal-body">Confirma la inspección física y la baja definitiva de 1 botellón inservible de la bodega de rotos.</div>
        <div class="modal-footer">
          <button @click="confirmarBajaRoto = false" class="btn btn-secondary">Cancelar</button>
          <button @click="bajaRoto" class="btn btn-accent-red">Autorizar baja</button>
        </div>
      </div>
    </div>

    <div v-if="registroBaja" class="modal-overlay" @click.self="registroBaja = null">
      <div class="modal-content modal-sm" role="alertdialog" aria-modal="true">
        <div class="modal-header"><h3>Baja por no retorno</h3></div>
        <div class="modal-body">
          {{ registroBaja.cantidad }} envase(s) de <strong>{{ registroBaja.clienteNombre }}</strong> sin devolución desde el
          {{ formatFechaCorta(registroBaja.fechaOrigen) }}. Quedará un mensaje persistente en la ficha del cliente para el
          administrativo.
        </div>
        <div class="modal-footer">
          <button @click="registroBaja = null" class="btn btn-secondary">Cancelar</button>
          <button @click="bajaNoRetornado" class="btn btn-accent-red">Dar de baja</button>
        </div>
      </div>
    </div>

    <div v-if="confirmarReset" class="modal-overlay" @click.self="confirmarReset = false">
      <div class="modal-content modal-sm" role="alertdialog" aria-modal="true">
        <div class="modal-header"><h3>Restablecer datos demo</h3></div>
        <div class="modal-body">Se perderán los pedidos y movimientos registrados en este navegador.</div>
        <div class="modal-footer">
          <button @click="confirmarReset = false" class="btn btn-secondary">Cancelar</button>
          <button @click="reset" class="btn btn-primary">Restablecer</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CircleCheck, CircleX, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-vue-next';
import { generarPedidosDemo } from '../../store/demo';
import { appStore } from '../../store/useAppStore';
import { notificar } from '../../store/useToast';
import { formatFechaCorta } from '../../utils/formato';
import type { RegistroEnvase } from '../../types';

const inv = computed(() => appStore.state.inventario);
const carga = computed(() => appStore.cargaFurgon.value);
const auditoria = computed(() => appStore.auditoria.value);
const horaActualizacion = computed(() => {
  const t = appStore.state.actualizadoEn;
  return t ? new Date(t).toLocaleTimeString('es-CL') : '—';
});

const cantidadDemo = ref(20);

function generarDemo() {
  const r = generarPedidosDemo(cantidadDemo.value);
  notificar(`${r.creados} pedidos creados: ${r.pagados} pagados, ${r.asignados} cargados al furgón${r.sinCupo ? `, ${r.sinCupo} esperan cupo` : ''}.`, 'exito', 6000);
}
const totalFisicoBodega = computed(() => inv.value.llenosCentral + inv.value.vaciosCentral + inv.value.rotosBodega);
const historial = computed(() => appStore.state.registrosEnvases.filter(r => r.estado !== 'pendiente').slice().reverse());

const confirmarBajaRoto = ref(false);
const confirmarReset = ref(false);
const registroBaja = ref<RegistroEnvase | null>(null);

function bajaRoto() {
  appStore.autorizarBajaRotoAdmin(1);
  confirmarBajaRoto.value = false;
  notificar('Baja física autorizada.', 'exito');
}

function bajaNoRetornado() {
  if (!registroBaja.value) return;
  try {
    appStore.darDeBajaNoRetornado(registroBaja.value.id);
    notificar(`Baja registrada para ${registroBaja.value.clienteNombre}.`, 'exito');
  } catch (err) {
    notificar((err as Error).message, 'error');
  }
  registroBaja.value = null;
}

function reset() {
  appStore.resetDemoData();
  confirmarReset.value = false;
  notificar('Datos demo restablecidos.', 'info');
}
</script>

<style scoped>
.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.split-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.stock-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.block-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--zun-gris);
}

.block-value {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 800;
  color: var(--zun-negro);
  line-height: 1.1;
  display: flex;
  flex-direction: column;
}

.block-value .unit {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--zun-gris);
  margin-top: 4px;
}

.sync-card {
  border-left: 4px solid var(--zun-rojo);
}

.equation-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 18px 22px;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
}

.eq-item,
.eq-total {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.eq-num {
  font-family: var(--font-mono);
  font-size: 1.4rem;
  font-weight: 800;
}

.eq-lbl {
  font-size: 0.72rem;
  color: var(--zun-gris);
}

.eq-op {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--zun-gris);
}

.eq-total {
  background: var(--zun-blanco);
  border: 2px solid var(--zun-negro);
  padding: 6px 18px;
  border-radius: 8px;
}

.sync-ops {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.legend {
  display: flex;
  gap: 6px;
}

.table-wrap {
  overflow-x: auto;
}

.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.mini-table th {
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--zun-gris);
  padding: 10px 12px;
  border-bottom: 1px solid var(--zun-border);
  white-space: nowrap;
}

.mini-table td {
  padding: 12px;
  border-bottom: 1px solid var(--zun-border);
  white-space: nowrap;
}

.cell-right {
  text-align: right;
}

.historial {
  margin-top: 18px;
}

.historial summary {
  cursor: pointer;
  font-size: 0.86rem;
  font-weight: 700;
  margin-bottom: 12px;
}

.is-active-account {
  background: var(--zun-blanco);
  border: 2px solid var(--zun-negro);
}

.acc-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.acc-counter {
  min-width: 220px;
}

.counter-label {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  margin-bottom: 6px;
}

.counter-bar {
  height: 8px;
  background: var(--zun-border);
  border-radius: 9999px;
  overflow: hidden;
}

.counter-fill {
  height: 100%;
  background: var(--zun-negro);
}

.audit-card .card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.audit-ok {
  border-left: 4px solid var(--zun-verde);
}

.audit-ok .card-title {
  color: #065f46;
}

.audit-fail {
  border-left: 4px solid var(--zun-rojo);
  background: var(--zun-rojo-light);
}

.audit-fail .card-title {
  color: #991b1b;
}

.audit-list {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px 20px;
}

.audit-list li {
  display: grid;
  grid-template-columns: 16px 1fr;
  column-gap: 8px;
  align-items: center;
  font-size: 0.84rem;
  color: #065f46;
}

.audit-list li span {
  grid-column: 2;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--zun-gris);
}

.audit-list li.fail {
  color: #991b1b;
}

.demo-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.demo-actions {
  display: flex;
  gap: 8px;
}

.demo-actions select {
  padding: 8px 12px;
}

.modal-sm {
  max-width: 440px;
}

.modal-sm .modal-body {
  font-size: 0.92rem;
  line-height: 1.55;
}
</style>
