<template>
  <div class="admin-layout">
    <!-- Header de Navegación -->
    <header class="admin-topbar">
      <div class="topbar-left">
        <router-link to="/" class="back-link">&larr; Volver al portal</router-link>
        <div class="portal-badge">
          <span class="dot-live"></span>
          <span>Administración de pedidos (Tarea #48)</span>
        </div>
      </div>
      <div class="topbar-right">
        <div class="user-chip">
          <span class="user-avatar">FO</span>
          <div class="user-info">
            <span class="user-name">Fabián Jeldes</span>
            <span class="user-role">Secretaría / Ventas</span>
          </div>
        </div>
      </div>
    </header>

    <div class="admin-content">
      <!-- Alerta Flash de Rotación Bancaria si aplica -->
      <div v-if="appStore.state.notificacionRotacion" class="alert-box alert-rotation">
        <div class="alert-icon">🔄</div>
        <div class="alert-body">
          <strong>Conmutación automática de cuenta bancaria (regla de 45 comprobantes):</strong>
          <p>{{ appStore.state.notificacionRotacion }}</p>
        </div>
        <button @click="appStore.state.notificacionRotacion = null" class="btn-close">&times;</button>
      </div>

      <!-- Métricas y Alertas Superiores -->
      <section class="metrics-grid">
        <!-- Stock Balance Card -->
        <div class="metric-card">
          <div class="card-title">Balance de stock central</div>
          <div class="metric-val text-primary">{{ appStore.state.inventario.llenosCentral }} <span class="unit">llenos</span></div>
          <div class="metric-sub">
            <span>{{ appStore.state.inventario.vaciosCentral }} vacíos disponibles</span> •
            <span>{{ appStore.state.inventario.enTransito }} en tránsito</span>
          </div>
        </div>

        <!-- Alerta Botellones Pendientes -->
        <div class="metric-card" :class="{ 'card-alert': appStore.state.inventario.pendientesDevolucion > 0 }">
          <div class="card-title">Botellones pendientes (deuda clientes)</div>
          <div class="metric-val text-warning">{{ appStore.state.inventario.pendientesDevolucion }} <span class="unit">retenidos</span></div>
          <div class="metric-sub">
            Auto-programados para retiro en próximo despacho
          </div>
        </div>

        <!-- Bodega de Rotos (Erick) -->
        <div class="metric-card">
          <div class="card-title">Bodega de rotos (físicos)</div>
          <div class="metric-val text-danger">{{ appStore.state.inventario.rotosBodega }} <span class="unit">unidades</span></div>
          <div class="metric-sub">
            Requiere inspección física de Erick para baja
            <button v-if="appStore.state.inventario.rotosBodega > 0" @click="autorizarBaja" class="btn-link">Autorizar baja</button>
          </div>
        </div>

        <!-- Widget Cuenta Bancaria Activa -->
        <div class="metric-card">
          <div class="card-title">Cuenta de transferencias activa</div>
          <div class="metric-val bank-title">{{ appStore.cuentaActiva.value.banco }}</div>
          <div class="bank-progress-wrapper">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :style="{ width: `${(appStore.cuentaActiva.value.comprobantesProcesados / 45) * 100}%` }"
              ></div>
            </div>
            <span class="progress-label">{{ appStore.cuentaActiva.value.comprobantesProcesados }}/45 vouchers</span>
          </div>
          <div class="metric-sub font-mono">{{ appStore.cuentaActiva.value.numeroCuenta }}</div>
        </div>
      </section>

      <!-- Barra de Acciones y Búsqueda -->
      <section class="actions-bar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input 
            v-model="filtroBusqueda" 
            type="text" 
            placeholder="Buscar por cliente, teléfono, dirección o código de pedido..." 
          />
        </div>

        <div class="filter-pills">
          <button 
            v-for="estado in ['todos', 'pendiente_pago', 'pagado', 'en_despacho', 'entregado']" 
            :key="estado"
            :class="['filter-pill', { active: filtroEstado === estado }]"
            @click="filtroEstado = estado"
          >
            {{ formatEstadoLabel(estado) }}
          </button>
        </div>

        <button @click="abrirModalNuevoPedido" class="btn btn-primary btn-nuevo">
          <span>+</span> Crear pedido (WhatsApp)
        </button>
      </section>

      <!-- Tabla de Pedidos -->
      <section class="table-container card">
        <table class="pedidos-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente y contacto</th>
              <th>Dirección y comuna</th>
              <th>Bidones</th>
              <th>Medio de pago</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pedido in pedidosFiltrados" :key="pedido.id" :class="{ 'row-alert': pedido.tieneAlertaDeuda }">
              <td class="font-mono font-bold">{{ pedido.codigo }}</td>
              <td>
                <div class="cli-info">
                  <span class="cli-nombre">{{ pedido.clienteNombre }}</span>
                  <span class="cli-tel">{{ pedido.telefono }}</span>
                  <span v-if="pedido.tieneAlertaDeuda" class="badge badge-warning debt-tag">
                    ⚠️ Debe {{ pedido.deudaEnvasesPendiente }} envase(s)
                  </span>
                </div>
              </td>
              <td>
                <div class="dir-info">
                  <span>{{ pedido.direccion }}</span>
                  <span class="comuna-tag">{{ pedido.comuna }}</span>
                </div>
              </td>
              <td>
                <span class="badge badge-neutral">{{ pedido.cantidadBidones }} x 20L</span>
              </td>
              <td>
                <div class="payment-col">
                  <span class="pay-type">{{ pedido.medioPago === 'webpay' ? '💳 Webpay Plus' : '🏦 Transferencia' }}</span>
                  <span class="delivery-promise">Promesa: {{ pedido.promesaEntrega }}</span>
                </div>
              </td>
              <td class="font-bold font-mono">
                ${{ pedido.total.toLocaleString('es-CL') }}
              </td>
              <td>
                <span :class="['badge', getBadgeClass(pedido.estado)]">
                  {{ formatEstado(pedido.estado) }}
                </span>
                <span v-if="pedido.incidencia" class="badge badge-danger" style="margin-top: 4px;">
                  Incidencia: {{ pedido.incidencia.tipo }}
                </span>
              </td>
              <td>
                <div class="table-actions">
                  <!-- Botón Simular Pago si está pendiente -->
                  <template v-if="pedido.estado === 'pendiente_pago'">
                    <button 
                      v-if="pedido.medioPago === 'webpay'" 
                      @click="simularWebpay(pedido)" 
                      class="btn btn-secondary btn-sm"
                      title="Simular confirmación de pago Webpay"
                    >
                      💳 Pagar Webpay
                    </button>
                    <button 
                      v-else 
                      @click="abrirModalTransferencia(pedido)" 
                      class="btn btn-secondary btn-sm"
                      title="Validar comprobante de transferencia bancaria"
                    >
                      📄 Validar Transf.
                    </button>
                  </template>

                  <!-- Botón Asignar a Despacho si ya está pagado -->
                  <button 
                    v-if="pedido.estado === 'pagado'" 
                    @click="asignarDespacho(pedido)" 
                    class="btn btn-primary btn-sm"
                  >
                    🚚 Despachar
                  </button>

                  <button @click="verDetalle(pedido)" class="btn btn-secondary btn-sm">
                    👁️ Ver
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="pedidosFiltrados.length === 0">
              <td colspan="8" class="text-center py-8 text-muted">
                No se encontraron pedidos con los filtros seleccionados.
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <!-- MODAL CREAR PEDIDO (Prellenado Automático) -->
    <div v-if="mostrarModalPedido" class="modal-overlay" @click.self="mostrarModalPedido = false">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Registrar pedido (WhatsApp)</h2>
          <button @click="mostrarModalPedido = false" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <form @submit.prevent="guardarNuevoPedido" class="modal-form">
          <!-- Búsqueda / Selección de Cliente Recurrente -->
          <div class="form-group">
            <label>Seleccionar cliente frecuente (prellenado automático):</label>
            <select v-model="clienteSeleccionadoId" @change="onClienteSeleccionado">
              <option value="">-- Nuevo cliente / Escribir manualmente --</option>
              <option v-for="c in appStore.state.clientes" :key="c.id" :value="c.id">
                {{ c.nombre }} ({{ c.telefono }}) {{ c.deudaEnvases > 0 ? `[⚠️ Debe ${c.deudaEnvases} envases]` : '' }}
              </option>
            </select>
          </div>

          <!-- Banner Alerta Deuda de Envases -->
          <div v-if="deudaClienteDetectada > 0" class="debt-warning-banner">
            <div class="warn-icon">⚠️</div>
            <div>
              <strong>Alerta de botellones pendientes:</strong>
              <p>Este cliente adeuda <strong>{{ deudaClienteDetectada }} botellón(es)</strong> no retornados de entregas previas. Recuerda coordinar por WhatsApp el retorno antes de entregar el nuevo pedido.</p>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Nombre completo:</label>
              <input v-model="formPedido.nombre" type="text" required placeholder="Ej: Carolina Valenzuela" />
            </div>
            <div class="form-group">
              <label>Teléfono (WhatsApp):</label>
              <input v-model="formPedido.telefono" type="text" required placeholder="+56 9 1234 5678" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group" style="flex: 2;">
              <label>Dirección de entrega:</label>
              <input v-model="formPedido.direccion" type="text" required placeholder="Calle, Número, Depto" />
            </div>
            <div class="form-group" style="flex: 1;">
              <label>Comuna:</label>
              <input v-model="formPedido.comuna" type="text" required placeholder="Providencia" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Cantidad de bidones (20L):</label>
              <input v-model.number="formPedido.cantidadBidones" type="number" min="1" max="50" required />
            </div>
            <div class="form-group">
              <label>Medio de pago:</label>
              <select v-model="formPedido.medioPago">
                <option value="webpay">💳 Link Webpay Plus</option>
                <option value="transferencia">🏦 Transferencia bancaria</option>
              </select>
            </div>
          </div>

          <!-- Resumen de Costo -->
          <div class="form-summary">
            <span>Total a pagar (3.500 c/u):</span>
            <span class="total-highlight">${{ (formPedido.cantidadBidones * 3500).toLocaleString('es-CL') }}</span>
          </div>

          <div class="modal-footer">
            <button type="button" @click="mostrarModalPedido = false" class="btn btn-secondary">Cancelar</button>
            <button type="submit" class="btn btn-primary">Crear pedido y generar cobro</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL VALIDAR TRANSFERENCIA -->
    <div v-if="modalTransferenciaPedido" class="modal-overlay" @click.self="modalTransferenciaPedido = null">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Validar transferencia bancaria manual</h2>
          <button @click="modalTransferenciaPedido = null" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body p-6">
          <p class="mb-4">
            Pedido: <strong>{{ modalTransferenciaPedido.codigo }}</strong> • Monto: <strong>${{ modalTransferenciaPedido.total.toLocaleString('es-CL') }}</strong>
          </p>
          <div class="current-bank-box mb-4">
            <span class="label">Cuenta de abono activa:</span>
            <strong>{{ appStore.cuentaActiva.value.banco }} ({{ appStore.cuentaActiva.value.numeroCuenta }})</strong>
            <p class="text-xs text-muted">Contador actual: {{ appStore.cuentaActiva.value.comprobantesProcesados }}/45 transferencias</p>
          </div>
          <div class="form-group mb-4">
            <label>Subir o confirmar comprobante:</label>
            <input type="text" v-model="comprobanteNombre" placeholder="comprobante_banco_123.jpg" />
          </div>
          <div class="modal-footer">
            <button @click="modalTransferenciaPedido = null" class="btn btn-secondary">Cancelar</button>
            <button @click="confirmarTransferencia" class="btn btn-success">Aprobar y liberar a despacho</button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DETALLE PEDIDO -->
    <div v-if="pedidoDetalle" class="modal-overlay" @click.self="pedidoDetalle = null">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Detalle del pedido {{ pedidoDetalle.codigo }}</h2>
          <button @click="pedidoDetalle = null" class="btn-close" aria-label="Cerrar">&times;</button>
        </div>
        <div class="modal-body p-6">
          <div class="detail-row"><strong>Cliente:</strong> {{ pedidoDetalle.clienteNombre }}</div>
          <div class="detail-row"><strong>Teléfono:</strong> {{ pedidoDetalle.telefono }}</div>
          <div class="detail-row"><strong>Dirección:</strong> {{ pedidoDetalle.direccion }}, {{ pedidoDetalle.comuna }}</div>
          <div class="detail-row"><strong>Cantidad:</strong> {{ pedidoDetalle.cantidadBidones }} botellones (20L)</div>
          <div class="detail-row"><strong>Total:</strong> ${{ pedidoDetalle.total.toLocaleString('es-CL') }}</div>
          <div class="detail-row"><strong>Estado:</strong> {{ formatEstado(pedidoDetalle.estado) }}</div>
          <div class="detail-row"><strong>Medio de pago:</strong> {{ pedidoDetalle.medioPago }}</div>
          <div class="detail-row" v-if="pedidoDetalle.linkWebpay">
            <strong>Link Webpay:</strong> <a :href="pedidoDetalle.linkWebpay" target="_blank">{{ pedidoDetalle.linkWebpay }}</a>
          </div>
          <div class="detail-row" v-if="pedidoDetalle.incidencia">
            <strong>Incidencia Chofer:</strong> 
            <span class="badge badge-danger">{{ pedidoDetalle.incidencia.tipo }}: {{ pedidoDetalle.incidencia.detalle }}</span>
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
import { ref, computed } from 'vue';
import { appStore } from '../store/useAppStore';
import type { Pedido } from '../types';

const filtroBusqueda = ref('');
const filtroEstado = ref('todos');

const mostrarModalPedido = ref(false);
const clienteSeleccionadoId = ref('');
const deudaClienteDetectada = ref(0);

const modalTransferenciaPedido = ref<Pedido | null>(null);
const comprobanteNombre = ref('comprobante_banco_774.pdf');
const pedidoDetalle = ref<Pedido | null>(null);

const formPedido = ref({
  clienteId: '',
  nombre: '',
  telefono: '',
  direccion: '',
  comuna: '',
  cantidadBidones: 2,
  tipoProducto: 'Agua Purificada 20L Sellada',
  medioPago: 'webpay' as 'webpay' | 'transferencia'
});

const pedidosFiltrados = computed(() => {
  return appStore.state.pedidos.filter(p => {
    const matchFiltro = filtroEstado.value === 'todos' || p.estado === filtroEstado.value;
    const q = filtroBusqueda.value.toLowerCase().trim();
    const matchQuery = !q || 
      p.codigo.toLowerCase().includes(q) ||
      p.clienteNombre.toLowerCase().includes(q) ||
      p.telefono.includes(q) ||
      p.direccion.toLowerCase().includes(q);
    return matchFiltro && matchQuery;
  });
});

function formatEstadoLabel(estado: string) {
  const map: Record<string, string> = {
    todos: 'Todos',
    pendiente_pago: 'Pendiente Pago',
    pagado: 'Pagados',
    en_despacho: 'En Despacho',
    entregado: 'Entregados'
  };
  return map[estado] || estado;
}

function formatEstado(estado: string) {
  const map: Record<string, string> = {
    pendiente_pago: 'Pendiente Pago',
    pagado: 'Pagado',
    en_despacho: 'En Despacho',
    entregado: 'Entregado',
    parcial: 'Entrega Parcial',
    ausente: 'Cliente Ausente',
    cancelado: 'Cancelado'
  };
  return map[estado] || estado;
}

function getBadgeClass(estado: string) {
  const map: Record<string, string> = {
    pendiente_pago: 'badge-warning',
    pagado: 'badge-primary',
    en_despacho: 'badge-neutral',
    entregado: 'badge-success',
    parcial: 'badge-warning',
    ausente: 'badge-danger'
  };
  return map[estado] || 'badge-neutral';
}

function abrirModalNuevoPedido() {
  clienteSeleccionadoId.value = '';
  deudaClienteDetectada.value = 0;
  formPedido.value = {
    clienteId: '',
    nombre: '',
    telefono: '',
    direccion: '',
    comuna: 'Providencia',
    cantidadBidones: 2,
    tipoProducto: 'Agua Purificada 20L Sellada',
    medioPago: 'webpay'
  };
  mostrarModalPedido.value = true;
}

function onClienteSeleccionado() {
  if (!clienteSeleccionadoId.value) {
    deudaClienteDetectada.value = 0;
    return;
  }
  const cli = appStore.state.clientes.find(c => c.id === clienteSeleccionadoId.value);
  if (cli) {
    formPedido.value.clienteId = cli.id;
    formPedido.value.nombre = cli.nombre;
    formPedido.value.telefono = cli.telefono;
    formPedido.value.direccion = cli.direccion;
    formPedido.value.comuna = cli.comuna;
    deudaClienteDetectada.value = cli.deudaEnvases;

    // Prellenado automático con último pedido si existe
    if (cli.ultimoPedido) {
      formPedido.value.cantidadBidones = cli.ultimoPedido.cantidadBidones;
      formPedido.value.tipoProducto = cli.ultimoPedido.tipoProducto;
    }
  }
}

function guardarNuevoPedido() {
  appStore.crearPedido({
    clienteId: formPedido.value.clienteId || undefined,
    nombre: formPedido.value.nombre,
    telefono: formPedido.value.telefono,
    direccion: formPedido.value.direccion,
    comuna: formPedido.value.comuna,
    cantidadBidones: formPedido.value.cantidadBidones,
    tipoProducto: formPedido.value.tipoProducto,
    medioPago: formPedido.value.medioPago
  });
  mostrarModalPedido.value = false;
}

function simularWebpay(pedido: Pedido) {
  appStore.simularPagoWebpay(pedido.id);
}

function abrirModalTransferencia(pedido: Pedido) {
  modalTransferenciaPedido.value = pedido;
  comprobanteNombre.value = `comprobante_${pedido.codigo.toLowerCase()}.pdf`;
}

function confirmarTransferencia() {
  if (modalTransferenciaPedido.value) {
    appStore.validarTransferenciaManual(modalTransferenciaPedido.value.id, comprobanteNombre.value);
    modalTransferenciaPedido.value = null;
  }
}

function asignarDespacho(pedido: Pedido) {
  try {
    appStore.asignarPedidoADespacho(pedido.id);
  } catch (err: any) {
    alert(err.message);
  }
}

function autorizarBaja() {
  if (confirm('¿Confirmar inspección física y baja definitiva de 1 botellón inservible de la Bodega de Rotos?')) {
    appStore.autorizarBajaRotoAdmin(1);
  }
}

function verDetalle(pedido: Pedido) {
  pedidoDetalle.value = pedido;
}
</script>

<style scoped>
.admin-layout {
  min-height: 100vh;
  background-color: var(--bg-main);
}

.admin-topbar {
  background: #ffffff;
  border-bottom: 1px solid var(--border);
  padding: 14px 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-link {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
}
.back-link:hover { color: var(--primary); }

.portal-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f1f5f9;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #334155;
}

.dot-live {
  width: 8px;
  height: 8px;
  background-color: var(--success);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 10px;
}
.user-avatar {
  width: 34px;
  height: 34px;
  background: #0284c7;
  color: #ffffff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.8rem;
}
.user-info {
  display: flex;
  flex-direction: column;
}
.user-name { font-size: 0.85rem; font-weight: 700; }
.user-role { font-size: 0.72rem; color: var(--text-muted); }

.admin-content {
  max-width: 1300px;
  margin: 0 auto;
  padding: 24px;
}

.alert-rotation {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: var(--radius-sm);
  padding: 12px 18px;
  margin-bottom: 20px;
  animation: modalIn 0.3s ease;
}
.alert-rotation .alert-icon { font-size: 1.5rem; }
.alert-rotation p { font-size: 0.88rem; color: #78350f; margin-top: 2px; }

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.metric-card {
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 18px;
  box-shadow: var(--shadow-sm);
}
.metric-card.card-alert {
  border-color: #f59e0b;
  background: #fffdf5;
}

.card-title {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.metric-val {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.2;
}
.metric-val .unit { font-size: 0.9rem; font-weight: 500; color: var(--text-muted); }
.metric-sub { font-size: 0.78rem; color: var(--text-muted); margin-top: 6px; }

.text-primary { color: var(--primary); }
.text-warning { color: #d97706; }
.text-danger { color: #dc2626; }
.bank-title { font-size: 1.2rem; color: #1e293b; }

.bank-progress-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 0;
}
.progress-bar {
  flex-grow: 1;
  height: 6px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #0284c7;
  border-radius: 9999px;
  transition: width 0.3s ease;
}
.progress-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
}

.actions-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-box {
  flex-grow: 1;
  min-width: 280px;
  position: relative;
  display: flex;
  align-items: center;
}
.search-box .search-icon {
  position: absolute;
  left: 14px;
  color: #94a3b8;
}
.search-box input {
  width: 100%;
  padding-left: 40px;
}

.filter-pills {
  display: flex;
  gap: 6px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: var(--radius-sm);
}

.filter-pill {
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  border-radius: 6px;
}
.filter-pill.active {
  background: #ffffff;
  color: var(--primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}

.pedidos-table {
  width: 100%;
  border-collapse: collapse;
}

.pedidos-table th {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: #f8fafc;
}

.pedidos-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.88rem;
  vertical-align: middle;
}

.pedidos-table tr:hover td {
  background-color: #f8fafc;
}

.pedidos-table tr.row-alert td {
  background-color: #fffbeb;
}

.cli-info, .dir-info, .payment-col {
  display: flex;
  flex-direction: column;
}
.cli-nombre { font-weight: 700; color: #0f172a; }
.cli-tel { font-size: 0.78rem; color: #64748b; }
.comuna-tag { font-size: 0.75rem; color: #0284c7; font-weight: 600; }
.pay-type { font-weight: 600; }
.delivery-promise { font-size: 0.74rem; color: #64748b; }

.debt-tag {
  margin-top: 4px;
  display: inline-block;
  font-size: 0.7rem;
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-sm {
  padding: 6px 10px;
  font-size: 0.78rem;
}

.btn-link {
  color: #0284c7;
  font-size: 0.75rem;
  font-weight: 700;
  text-decoration: underline;
  margin-left: 6px;
}

/* Modal Form Styles */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}
.modal-header h2 { font-size: 1.25rem; font-weight: 700; }

.modal-form {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
}

.form-row {
  display: flex;
  gap: 16px;
}

.debt-warning-banner {
  display: flex;
  gap: 12px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: var(--radius-sm);
  padding: 12px;
  font-size: 0.82rem;
  color: #92400e;
}
.debt-warning-banner .warn-icon { font-size: 1.2rem; }

.form-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f1f5f9;
  padding: 14px 18px;
  border-radius: var(--radius-sm);
  font-weight: 700;
}
.total-highlight {
  font-size: 1.3rem;
  color: #0284c7;
  font-family: var(--font-mono);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.btn-close {
  font-size: 1.5rem;
  color: #94a3b8;
}
.btn-close:hover { color: #0f172a; }

.detail-row {
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.9rem;
}
</style>
