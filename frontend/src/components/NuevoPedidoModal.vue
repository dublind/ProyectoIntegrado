<template>
  <div class="modal-overlay" @click.self="emit('cerrar')">
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="titulo-nuevo-pedido">
      <div class="modal-header">
        <h2 id="titulo-nuevo-pedido">Registrar pedido (WhatsApp)</h2>
        <button @click="emit('cerrar')" class="btn-close" aria-label="Cerrar">&times;</button>
      </div>

      <!-- novalidate: se desactivan las burbujas nativas del navegador; los errores se muestran junto al campo -->
      <form @submit.prevent="guardar" class="modal-form" novalidate>
        <div class="form-group">
          <label for="np-cliente">Cliente frecuente (prellenado automático)</label>
          <select id="np-cliente" v-model="clienteSeleccionadoId" @change="onClienteSeleccionado">
            <option value="">Nuevo cliente / escribir manualmente</option>
            <option v-for="c in appStore.state.clientes" :key="c.id" :value="c.id">
              {{ c.nombre }} ({{ c.telefono }}){{ c.deudaEnvases > 0 ? ` · debe ${c.deudaEnvases} envase(s)` : '' }}
            </option>
          </select>
        </div>

        <!-- Alerta de envases pendientes -->
        <div v-if="deudaCliente > 0" class="debt-warning-banner">
          <AlertTriangle :size="18" class="warn-icon" />
          <div>
            <strong>Botellones pendientes de devolución</strong>
            <p>Este cliente adeuda <strong>{{ deudaCliente }} botellón(es)</strong> de entregas previas. El chofer verá el
              retiro en su ruta.</p>
          </div>
        </div>

        <!-- Mensaje persistente por baja a 60 días (solo administrativo) -->
        <div v-if="bajasCliente > 0" class="debt-warning-banner is-critical">
          <Ban :size="18" class="warn-icon" />
          <div>
            <strong>Envase dado de baja por no retorno</strong>
            <p>{{ bajasCliente }} envase(s) de este cliente se dieron de baja tras 60 días. Exige su devolución antes de
              confirmar el nuevo pedido.</p>
          </div>
        </div>

        <div class="form-row">
          <div :class="['form-group', { 'has-error': errores.nombre }]">
            <label for="np-nombre">Nombre completo</label>
            <input id="np-nombre" v-model="form.nombre" type="text" placeholder="Ej: Carolina Valenzuela"
              autocomplete="name" :aria-invalid="!!errores.nombre"
              :aria-describedby="errores.nombre ? 'np-nombre-error' : undefined" @blur="validarCampo('nombre')"
              @input="limpiarSiCorrige('nombre')" />
            <span v-if="errores.nombre" id="np-nombre-error" class="field-error" role="alert">
              <CircleAlert :size="14" /> {{ errores.nombre }}
            </span>
          </div>
          <div :class="['form-group', { 'has-error': errores.telefono }]">
            <label for="np-telefono">Teléfono (WhatsApp)</label>
            <input id="np-telefono" v-model="form.telefono" type="tel" inputmode="tel" placeholder="+56 9 1234 5678"
              autocomplete="tel" :aria-invalid="!!errores.telefono"
              :aria-describedby="errores.telefono ? 'np-telefono-error' : 'np-telefono-hint'"
              @blur="onBlurTelefono" @input="limpiarSiCorrige('telefono')" />
            <span v-if="errores.telefono" id="np-telefono-error" class="field-error" role="alert">
              <CircleAlert :size="14" /> {{ errores.telefono }}
            </span>
            <span v-else id="np-telefono-hint" class="field-hint">Móvil chileno: +56 9 y 8 dígitos.</span>
          </div>
        </div>

        <div class="form-row">
          <div :class="['form-group', { 'has-error': errores.direccion }]" style="flex: 2;">
            <label for="np-direccion">Dirección de entrega</label>
            <input id="np-direccion" v-model="form.direccion" type="text" placeholder="Calle, número, depto"
              autocomplete="street-address" :aria-invalid="!!errores.direccion"
              :aria-describedby="errores.direccion ? 'np-direccion-error' : undefined"
              @blur="validarCampo('direccion')" @input="limpiarSiCorrige('direccion')" />
            <span v-if="errores.direccion" id="np-direccion-error" class="field-error" role="alert">
              <CircleAlert :size="14" /> {{ errores.direccion }}
            </span>
          </div>
          <div :class="['form-group', { 'has-error': errores.comuna }]" style="flex: 1;">
            <label for="np-comuna">Comuna</label>
            <select id="np-comuna" v-model="form.comuna" :aria-invalid="!!errores.comuna"
              :aria-describedby="errores.comuna ? 'np-comuna-error' : 'np-comuna-hint'"
              @change="validarCampo('comuna')">
              <option value="" disabled>Selecciona una comuna</option>
              <optgroup v-for="g in gruposComunas" :key="g.tramo"
                :label="g.recargo ? `${g.nombre} · delivery +${formatCLP(g.recargo)}` : `${g.nombre} · sin recargo`">
                <option v-for="c in g.comunas" :key="c" :value="c">{{ c }}</option>
              </optgroup>
            </select>
            <span v-if="errores.comuna" id="np-comuna-error" class="field-error" role="alert">
              <CircleAlert :size="14" /> {{ errores.comuna }}
            </span>
            <span v-else id="np-comuna-hint" class="field-hint">
              {{ recargo ? `Delivery +${formatCLP(recargo)}` : 'Sin recargo de delivery' }}
            </span>
          </div>
        </div>

        <div class="form-row">
          <div :class="['form-group', { 'has-error': errores.cantidadBidones }]">
            <label for="np-cantidad">Cantidad de bidones (20L)</label>
            <input id="np-cantidad" v-model.number="form.cantidadBidones" type="number" min="1" max="50"
              :aria-invalid="!!errores.cantidadBidones"
              :aria-describedby="errores.cantidadBidones ? 'np-cantidad-error' : undefined"
              @blur="validarCampo('cantidadBidones')" @input="limpiarSiCorrige('cantidadBidones')" />
            <span v-if="errores.cantidadBidones" id="np-cantidad-error" class="field-error" role="alert">
              <CircleAlert :size="14" /> {{ errores.cantidadBidones }}
            </span>
          </div>
          <div class="form-group">
            <label for="np-pago">Medio de pago</label>
            <select id="np-pago" v-model="form.medioPago">
              <option value="webpay">Link Webpay Plus</option>
              <option value="transferencia">Transferencia bancaria</option>
            </select>
          </div>
        </div>

        <div class="form-summary">
          <div class="summary-line">
            <span>{{ Number(form.cantidadBidones) || 0 }} bidón(es) × $3.500</span>
            <span class="font-mono">{{ formatCLP(subtotal) }}</span>
          </div>
          <div class="summary-line">
            <span>Delivery {{ form.comuna ? `· ${form.comuna}` : '' }}</span>
            <span class="font-mono">{{ recargo ? formatCLP(recargo) : 'Sin recargo' }}</span>
          </div>
          <div class="summary-line summary-total">
            <span>Total a pagar</span>
            <span class="total-highlight">{{ formatCLP(subtotal + recargo) }}</span>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" @click="emit('cerrar')" class="btn btn-secondary">Cancelar</button>
          <button type="submit" class="btn btn-primary">Crear pedido y generar cobro</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { AlertTriangle, Ban, CircleAlert } from 'lucide-vue-next';
import { appStore } from '../store/useAppStore';
import { notificar } from '../store/useToast';
import { formatCLP } from '../utils/formato';
import { buscarComuna, comunasPorTramo, recargoDelivery } from '../utils/comunas';
import { normalizarTelefono, validarCampoPedido, validarPedido } from '../utils/validacion';
import type { DatosPedidoForm, ErroresPedido } from '../utils/validacion';

const emit = defineEmits<{ cerrar: [] }>();

const gruposComunas = comunasPorTramo();

const clienteSeleccionadoId = ref('');
const form = reactive({
  clienteId: '',
  nombre: '',
  telefono: '',
  direccion: '',
  comuna: 'Providencia',
  cantidadBidones: 2,
  tipoProducto: 'Agua Purificada 20L Sellada',
  medioPago: 'webpay' as 'webpay' | 'transferencia'
});
const errores = reactive<ErroresPedido>({});

const subtotal = computed(() => (Number(form.cantidadBidones) || 0) * 3500);
const recargo = computed(() => recargoDelivery(form.comuna));

const deudaCliente = computed(() => (form.clienteId ? appStore.retirosPendientesCliente(form.clienteId) : 0));
const bajasCliente = computed(() => (form.clienteId ? appStore.bajasNoRetornoCliente(form.clienteId) : 0));

function datosForm(): DatosPedidoForm {
  return {
    nombre: form.nombre,
    telefono: form.telefono,
    direccion: form.direccion,
    comuna: form.comuna,
    cantidadBidones: form.cantidadBidones
  };
}

function validarCampo(campo: keyof DatosPedidoForm) {
  errores[campo] = validarCampoPedido(campo, datosForm());
}

// Mientras el usuario corrige un campo con error, el mensaje desaparece en cuanto el valor es válido
function limpiarSiCorrige(campo: keyof DatosPedidoForm) {
  if (errores[campo] && !validarCampoPedido(campo, datosForm())) {
    errores[campo] = undefined;
  }
}

function onBlurTelefono() {
  validarCampo('telefono');
  const normalizado = normalizarTelefono(form.telefono);
  if (normalizado) form.telefono = normalizado;
}

function onClienteSeleccionado() {
  const cli = appStore.state.clientes.find(c => c.id === clienteSeleccionadoId.value);
  if (!cli) {
    form.clienteId = '';
    return;
  }
  form.clienteId = cli.id;
  form.nombre = cli.nombre;
  form.telefono = cli.telefono;
  form.direccion = cli.direccion;
  // Normaliza al nombre del catálogo (ej: "santiago" → "Santiago Centro") para que el selector lo muestre
  form.comuna = buscarComuna(cli.comuna)?.nombre ?? '';
  if (cli.ultimoPedido) {
    form.cantidadBidones = cli.ultimoPedido.cantidadBidones;
    form.tipoProducto = cli.ultimoPedido.tipoProducto;
  }
  (Object.keys(errores) as (keyof DatosPedidoForm)[]).forEach(k => (errores[k] = undefined));
}

async function guardar() {
  const resultado = validarPedido(datosForm());
  (['nombre', 'telefono', 'direccion', 'comuna', 'cantidadBidones'] as const).forEach(k => {
    errores[k] = resultado[k];
  });

  const primerError = (['nombre', 'telefono', 'direccion', 'comuna', 'cantidadBidones'] as const).find(k => resultado[k]);
  if (primerError) {
    // Lleva el foco al primer campo con error, sin ventanas emergentes
    await nextTick();
    const ids: Record<string, string> = {
      nombre: 'np-nombre', telefono: 'np-telefono', direccion: 'np-direccion', comuna: 'np-comuna', cantidadBidones: 'np-cantidad'
    };
    document.getElementById(ids[primerError])?.focus();
    return;
  }

  const pedido = appStore.crearPedido({
    clienteId: form.clienteId || undefined,
    nombre: form.nombre,
    telefono: form.telefono,
    direccion: form.direccion,
    comuna: form.comuna,
    cantidadBidones: form.cantidadBidones,
    tipoProducto: form.tipoProducto,
    medioPago: form.medioPago
  });
  notificar(`Pedido ${pedido.codigo} creado. Promesa al cliente: "Su pedido será entregado mañana".`, 'exito');
  emit('cerrar');
}
</script>

<style scoped>
.modal-form {
  padding: 26px 30px 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.modal-form .modal-footer {
  margin: 4px -30px 0;
}

.debt-warning-banner {
  display: flex;
  gap: 12px;
  background: var(--zun-ambar-light);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  font-size: 0.84rem;
  color: #92400e;
}

.debt-warning-banner.is-critical {
  background: var(--zun-rojo-light);
  border-color: rgba(255, 38, 42, 0.35);
  color: #991b1b;
}

.warn-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.form-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  padding: 16px 22px;
  border-radius: var(--radius-sm);
}

.summary-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.88rem;
  color: var(--zun-gris-dark);
}

.summary-total {
  padding-top: 8px;
  margin-top: 2px;
  border-top: 1px solid var(--zun-border);
  font-weight: 700;
  color: var(--zun-negro);
}

.total-highlight {
  font-size: 1.4rem;
  color: var(--zun-negro);
  font-family: var(--font-mono);
  font-weight: 800;
}

@media (max-width: 640px) {
  .modal-form {
    padding: 20px 18px 0;
  }

  .modal-form .modal-footer {
    margin: 4px -18px 0;
    padding: 16px 18px;
  }
}
</style>
