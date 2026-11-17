<template>
  <div class="view-stack">
    <div class="view-toolbar">
      <div class="filter-tags" role="tablist" aria-label="Filtrar por estado">
        <button v-for="st in estadosFiltro" :key="st" role="tab" :aria-selected="filtroEstado === st"
          :class="['tag-btn', { active: filtroEstado === st }]" @click="filtroEstado = st">
          {{ formatEstadoLabel(st) }}
          <span class="tag-count">{{ conteoEstado(st) }}</span>
        </button>
      </div>
      <button @click="mostrarModalPedido = true" class="btn btn-primary">
        <Plus :size="16" /> Crear pedido
      </button>
    </div>

    <div class="search-input-wrapper">
      <Search :size="16" class="search-icon" />
      <input v-model="filtroBusqueda" type="search" aria-label="Buscar pedidos"
        placeholder="Buscar por cliente, teléfono, dirección o código..." />
    </div>

    <div class="table-card card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Cliente y contacto</th>
            <th>Dirección</th>
            <th>Bidones</th>
            <th>Pago</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in pedidosFiltrados" :key="p.id" :class="{ 'row-warning': p.tieneAlertaDeuda }">
            <td class="font-mono font-bold nowrap" data-label="Código">{{ p.codigo }}</td>
            <td data-label="Cliente">
              <div class="cell-stack">
                <span class="font-bold">{{ p.clienteNombre }}</span>
                <span class="text-sm text-muted">{{ p.telefono }}</span>
                <span v-if="p.tieneAlertaDeuda" class="badge badge-alert">Debe {{ p.deudaEnvasesPendiente }}
                  envase(s)</span>
              </div>
            </td>
            <td data-label="Dirección">
              <div class="cell-stack">
                <span>{{ p.direccion }}</span>
                <span class="comuna-pill">{{ p.comuna }}</span>
              </div>
            </td>
            <td data-label="Bidones">
              <span v-if="p.tipo === 'retiro'" class="badge badge-alert">Retiro {{ p.retiroEnvases }} vacío(s)</span>
              <span v-else class="badge badge-neutral">{{ p.cantidadBidones }} x 20L</span>
            </td>
            <td data-label="Pago">
              <div class="cell-stack">
                <span class="font-semibold">{{ p.medioPago === 'webpay' ? 'Webpay Plus' : 'Transferencia' }}</span>
                <span class="text-xs text-muted">{{ p.promesaEntrega }}</span>
              </div>
            </td>
            <td class="font-mono font-bold" data-label="Total">
              {{ p.tipo === 'retiro' ? 'Sin cobro' : p.total === 0 && p.pedidoOrigenCodigo ? 'Pagado' : formatCLP(p.total) }}
            </td>
            <td data-label="Estado">
              <span :class="['badge', getBadgeClass(p.estado)]">{{ formatEstado(p.estado) }}</span>
            </td>
            <td data-label="Acción">
              <div class="action-buttons">
                <button v-if="p.requiereAutorizacion && esAdministrativo && p.estado !== 'cancelado' && p.estado !== 'entregado'"
                  @click="abrirAutorizacion(p)" class="btn btn-secondary btn-sm"
                  title="Cliente con envases no retornados: coordina por WhatsApp y decide">
                  Autorizar
                </button>
                <span v-else-if="p.requiereAutorizacion && p.estado !== 'cancelado' && p.estado !== 'entregado'"
                  class="badge badge-alert" title="Lo autoriza el administrativo">Requiere autorización</span>
                <template v-if="p.estado === 'pendiente_pago'">
                  <button v-if="p.medioPago === 'webpay'" @click="Webpay(p)" class="btn btn-secondary btn-sm"
                    title="Webpay real pendiente de Transbank: registra una simulación identificada" :disabled="ocupado">
                    Confirmar Webpay
                  </button>
                  <button v-else @click="abrirModalTransferencia(p)" class="btn btn-secondary btn-sm">
                    Validar transf.
                  </button>
                </template>
                <button v-if="p.estado === 'pagado' && !p.requiereAutorizacion" @click="asignarDespacho(p)"
                  class="btn btn-primary btn-sm" :disabled="ocupado">
                  Asignar hoy
                </button>
                <button @click="pedidoDetalle = p" class="btn btn-secondary btn-sm" aria-label="Ver detalle">
                  <Eye :size="15" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="pedidosFiltrados.length === 0">
            <td colspan="8" class="empty-state">No se encontraron pedidos con los criterios seleccionados.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <NuevoPedidoModal v-if="mostrarModalPedido" @cerrar="mostrarModalPedido = false" />

    <!-- Autorizar pedido de un cliente con envases no retornados (solo administrativo) -->
    <div v-if="modalAutorizacion" class="modal-overlay" @click.self="modalAutorizacion = null">
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="titulo-autorizar">
        <div class="modal-header">
          <h2 id="titulo-autorizar">Autorizar pedido {{ modalAutorizacion.codigo }}</h2>
          <button @click="modalAutorizacion = null" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body">
          <p class="mb-4">{{ modalAutorizacion.clienteNombre }} tiene envases no retornados. Coordina por WhatsApp y
            registra la decisión. Ninguna autorización suma stock.</p>
          <p v-if="notaCliente(modalAutorizacion)" class="text-sm text-muted mb-4 nota-cliente">{{ notaCliente(modalAutorizacion) }}</p>
          <div class="form-group">
            <label for="motivo-autorizacion">Motivo o acuerdo</label>
            <input id="motivo-autorizacion" type="text" v-model="motivoAutorizacion" maxlength="300"
              placeholder="Ej: devolverá los envases en esta entrega" />
          </div>
        </div>
        <div class="modal-footer">
          <button @click="autorizar('SIN_RETORNO')" class="btn btn-secondary" :disabled="ocupado || !motivoAutorizacion.trim()">
            Autorizar sin retorno
          </button>
          <button @click="autorizar('CON_RETORNO')" class="btn btn-primary" :disabled="ocupado || !motivoAutorizacion.trim()">
            Autorizar con retorno
          </button>
        </div>
      </div>
    </div>

    <!-- Validar transferencia bancaria manual -->
    <div v-if="modalTransferenciaPedido" class="modal-overlay" @click.self="modalTransferenciaPedido = null">
      <div class="modal-content" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>Validar transferencia bancaria</h2>
          <button @click="modalTransferenciaPedido = null" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body">
          <p class="mb-4">
            Pedido <strong>{{ modalTransferenciaPedido.codigo }}</strong> · Monto
            <strong>{{ formatCLP(modalTransferenciaPedido.total) }}</strong>
          </p>
          <div class="current-bank-box mb-4">
            <span class="label">Cuenta de abono</span>
            <strong>{{ appStore.cuentaActiva.value.banco }} ({{ appStore.cuentaActiva.value.numeroCuenta }})</strong>
          </div>
          <div class="form-group">
            <label for="comprobante">Comprobante recibido</label>
            <input id="comprobante" type="text" v-model="comprobanteNombre" placeholder="comprobante_banco_123.jpg" />
          </div>
        </div>
        <div class="modal-footer">
          <button @click="modalTransferenciaPedido = null" class="btn btn-secondary">Cancelar</button>
          <button @click="confirmarTransferencia" class="btn btn-success" :disabled="ocupado || !comprobanteNombre.trim()">
            Aprobar y liberar a despacho
          </button>
        </div>
      </div>
    </div>

    <!-- Detalle del pedido -->
    <div v-if="pedidoDetalle" class="modal-overlay" @click.self="pedidoDetalle = null">
      <div class="modal-content" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h2>Pedido {{ pedidoDetalle.codigo }}</h2>
          <button @click="pedidoDetalle = null" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body">
          <div class="detail-row"><strong>Cliente:</strong> {{ pedidoDetalle.clienteNombre }}</div>
          <div class="detail-row"><strong>Teléfono:</strong> {{ pedidoDetalle.telefono }}</div>
          <div class="detail-row"><strong>Dirección:</strong> {{ pedidoDetalle.direccion }}, {{ pedidoDetalle.comuna }}
          </div>
          <div class="detail-row"><strong>Cantidad:</strong> {{ pedidoDetalle.cantidadBidones }} botellones (20L)</div>
          <div class="detail-row" v-if="pedidoDetalle.cantidadEntregada !== undefined">
            <strong>Entregados:</strong> {{ pedidoDetalle.cantidadEntregada }}
            <span v-if="pedidoDetalle.envasesNoDevueltos"> · {{ pedidoDetalle.envasesNoDevueltos }} vacío(s) sin
              devolver</span>
          </div>
          <div class="detail-row"><strong>Total:</strong> {{ formatCLP(pedidoDetalle.total) }}
            <span v-if="pedidoDetalle.recargoDelivery" class="text-muted">(incluye delivery {{
              formatCLP(pedidoDetalle.recargoDelivery) }})</span>
          </div>
          <div class="detail-row"><strong>Estado:</strong> {{ formatEstado(pedidoDetalle.estado) }}</div>
          <div class="detail-row"><strong>Creado:</strong> {{ pedidoDetalle.fechaCreacion }}</div>
          <div class="detail-row" v-if="pedidoDetalle.pedidoOrigenCodigo">
            <strong>Saldo de:</strong> {{ pedidoDetalle.pedidoOrigenCodigo }} (pago original)
          </div>
          <div class="detail-row" v-if="pedidoDetalle.autorizacion && pedidoDetalle.autorizacion !== 'LIBRE'">
            <strong>Autorización:</strong> {{ textoAutorizacion(pedidoDetalle.autorizacion) }}
          </div>
          <div class="detail-row" v-if="pedidoDetalle.incidencia">
            <strong>Incidencia:</strong>
            <span class="badge badge-danger">{{ pedidoDetalle.incidencia.tipo }}: {{ pedidoDetalle.incidencia.detalle
              }}</span>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="pedidoDetalle = null" class="btn btn-primary">Cerrar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Eye, Plus, Search } from 'lucide-vue-next';
import NuevoPedidoModal from '../../components/NuevoPedidoModal.vue';
import { appStore } from '../../store/useAppStore';
import { notificar } from '../../store/useToast';
import { session } from '../../store/useSession';
import { formatCLP, formatEstado, formatEstadoLabel, getBadgeClass } from '../../utils/formato';
import type { Pedido } from '../../types';

const estadosFiltro = ['todos', 'pendiente_pago', 'pagado', 'programado', 'en_despacho', 'entregado'];

const filtroBusqueda = ref('');
const filtroEstado = ref('todos');

// La barra de flujo puede abrir esta vista ya filtrada (ej: /pedidos?estado=pendiente_pago)
const route = useRoute();
watch(() => route.query.estado, estado => {
  if (typeof estado === 'string' && estadosFiltro.includes(estado)) filtroEstado.value = estado;
}, { immediate: true });
const mostrarModalPedido = ref(false);
const modalTransferenciaPedido = ref<Pedido | null>(null);
const comprobanteNombre = ref('');
const pedidoDetalle = ref<Pedido | null>(null);

function conteoEstado(estado: string) {
  return estado === 'todos'
    ? appStore.state.pedidos.length
    : appStore.state.pedidos.filter(p => p.estado === estado).length;
}

const pedidosFiltrados = computed(() => {
  const q = filtroBusqueda.value.toLowerCase().trim();
  return appStore.state.pedidos.filter(p => {
    const matchFiltro = filtroEstado.value === 'todos' || p.estado === filtroEstado.value;
    const matchQuery = !q ||
      p.codigo.toLowerCase().includes(q) ||
      p.clienteNombre.toLowerCase().includes(q) ||
      p.telefono.includes(q) ||
      p.direccion.toLowerCase().includes(q);
    return matchFiltro && matchQuery;
  });
});

const esAdministrativo = computed(() => session.user?.rol === 'administrativo');
const ocupado = ref(false);

// Ejecuta una acción del servidor y muestra su resultado o el motivo del rechazo
async function ejecutar(accion: () => Promise<unknown>, exito: string) {
  if (ocupado.value) return false;
  ocupado.value = true;
  try {
    await accion();
    notificar(exito, 'exito');
    return true;
  } catch (err) {
    notificar((err as Error).message, 'error', 6000);
    return false;
  } finally {
    ocupado.value = false;
  }
}

// Webpay real pendiente de Transbank (bug 95): queda registrado como simulación
function Webpay(p: Pedido) {
  void ejecutar(() => appStore.simularPagoWebpay(p.id), `Pago Webpay (simulación) de ${p.codigo} registrado. Listo para planificar.`);
}

function abrirModalTransferencia(p: Pedido) {
  modalTransferenciaPedido.value = p;
  comprobanteNombre.value = `comprobante_${p.codigo.toLowerCase()}.pdf`;
}

async function confirmarTransferencia() {
  const p = modalTransferenciaPedido.value;
  if (!p) return;
  const ok = await ejecutar(() => appStore.validarTransferenciaManual(p.id, comprobanteNombre.value.trim()),
    `Transferencia de ${p.codigo} aprobada.`);
  if (ok) modalTransferenciaPedido.value = null;
}

async function asignarDespacho(p: Pedido) {
  if (ocupado.value) return;
  ocupado.value = true;
  try {
    const v = await appStore.asignarPedidoADespacho(p.id);
    notificar(`${p.codigo} planificado para hoy en ${v.modelo.replace(/\s*\(.*\)$/, '')}.`, 'exito');
  } catch (err) {
    notificar((err as Error).message, 'error', 6000);
  } finally {
    ocupado.value = false;
  }
}

// Cliente con envases no retornados: el administrativo autoriza con o sin retorno
const modalAutorizacion = ref<Pedido | null>(null);
const motivoAutorizacion = ref('');
function abrirAutorizacion(p: Pedido) {
  modalAutorizacion.value = p;
  motivoAutorizacion.value = '';
}
const notaCliente = (p: Pedido) => appStore.state.clientes.find(c => c.id === p.clienteId)?.notaNoRetornados ?? '';
async function autorizar(decision: 'CON_RETORNO' | 'SIN_RETORNO') {
  const p = modalAutorizacion.value;
  if (!p) return;
  const ok = await ejecutar(() => appStore.autorizarPedido(p.id, decision, motivoAutorizacion.value.trim()),
    `${p.codigo} autorizado ${decision === 'SIN_RETORNO' ? 'sin retorno' : 'con retorno'}.`);
  if (ok) modalAutorizacion.value = null;
}
const TEXTO_AUTORIZACION: Record<string, string> = {
  PENDIENTE: 'pendiente del administrativo',
  CON_RETORNO: 'autorizado con retorno',
  SIN_RETORNO: 'autorizado sin retorno'
};
const textoAutorizacion = (a: string) => TEXTO_AUTORIZACION[a] ?? a;
</script>

<style scoped>
.nota-cliente {
  white-space: pre-line;
}

.filter-tags {
  display: flex;
  gap: 6px;
  background: var(--zun-blanco);
  padding: 5px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--zun-border);
  overflow-x: auto;
  max-width: 100%;
}

.tag-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  font-family: var(--font-mono);
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--zun-gris);
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  white-space: nowrap;
}

.tag-btn:hover {
  color: var(--acento);
  border-color: var(--acento);
}

.tag-btn.active {
  background: var(--zun-negro);
  color: #ffffff;
  border-color: var(--zun-negro);
}

.tag-count {
  font-size: 0.68rem;
  opacity: 0.7;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 14px;
  color: var(--zun-gris);
}

.search-input-wrapper input {
  width: 100%;
  padding-left: 40px;
}

.table-card {
  padding: 0;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  background: var(--zun-blanco-sutil);
  padding: 14px 18px;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--zun-gris);
  border-bottom: 1px solid var(--zun-border);
  white-space: nowrap;
}

.data-table td {
  padding: 16px 18px;
  border-bottom: 1px solid var(--zun-border);
  font-size: 0.88rem;
  vertical-align: middle;
}

.data-table tbody tr:hover td {
  background-color: var(--zun-blanco-sutil);
}

.data-table tr.row-warning td {
  background-color: var(--zun-ambar-light);
}

.nowrap {
  white-space: nowrap;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 48px !important;
  color: var(--zun-gris);
}

.current-bank-box {
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-sm);
  padding: 16px;
}

.current-bank-box .label {
  display: block;
  font-size: 0.78rem;
  color: var(--zun-gris);
}

.detail-row {
  padding: 11px 0;
  border-bottom: 1px solid var(--zun-border);
  font-size: 0.9rem;
}

/* En móvil la tabla se convierte en tarjetas apiladas */
@media (max-width: 760px) {
  .data-table thead {
    display: none;
  }

  .data-table,
  .data-table tbody,
  .data-table tr,
  .data-table td {
    display: block;
    width: 100%;
  }

  .data-table tr {
    padding: 12px 14px;
    border-bottom: 1px solid var(--zun-border);
  }

  .data-table td {
    border: none;
    padding: 5px 0;
    display: flex;
    gap: 12px;
    justify-content: space-between;
    align-items: flex-start;
    text-align: right;
  }

  .data-table td::before {
    content: attr(data-label);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-transform: uppercase;
    color: var(--zun-gris);
    text-align: left;
    padding-top: 2px;
  }

  .data-table td .cell-stack {
    align-items: flex-end;
  }

  .data-table td.empty-state::before {
    content: none;
  }
}
</style>
