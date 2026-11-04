<template>
  <div class="driver-backdrop">
    <div class="driver-app">
      <!-- Barra superior de la app -->
      <header class="app-bar">
        <RouterLink to="/despacho" class="icon-btn" aria-label="Volver al panel"><ArrowLeft :size="20" /></RouterLink>
        <div class="app-bar-title">
          <strong>{{ tituloEtapa }}</strong>
          <label class="van-select">
            <span class="sr-only">Furgón</span>
            <select v-model="vehiculoId" aria-label="Elegir furgón">
              <option v-for="v in appStore.state.vehiculos" :key="v.id" :value="v.id">
                {{ v.choferAsignado }} · {{ v.patente }}
              </option>
            </select>
          </label>
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

      <!-- ===================== SIN RUTA ===================== -->
      <main v-if="etapa === 'sin_ruta'" class="screen screen-center">
        <img :src="paisaje" alt="" class="empty-art" />
        <h1 class="screen-title">{{ turno?.estado === 'finalizado' ? 'Ruta cerrada' : 'Sin ruta asignada' }}</h1>
        <p class="screen-sub">
          {{ turno?.estado === 'finalizado'
            ? 'Descargaste el furgón en bodega. Buen trabajo.'
            : 'Cuando la oficina cargue pedidos al furgón, aparecerán aquí.' }}
        </p>
      </main>

      <!-- ===================== CARGA EN BODEGA ===================== -->
      <main v-else-if="etapa === 'carga'" class="screen">
        <section class="hero hero-dark">
          <span class="hero-kicker">Paso 1 de 3 · En bodega</span>
          <h1 class="hero-title">Carga el furgón</h1>
          <div class="load-total">
            <span class="load-num">{{ llenosACargar }}</span>
            <span class="load-lbl">botellones llenos<br />para {{ paradas.length }} paradas</span>
          </div>
          <p v-if="infoRuta" class="route-info"><Route :size="14" /> {{ infoRuta }}</p>
        </section>

        <section class="block">
          <h2 class="block-title">Detalle de la carga</h2>
          <ol class="load-list">
            <li v-for="(p, idx) in paradas" :key="p.id">
              <span class="seq">{{ idx + 1 }}</span>
              <span class="load-name">{{ p.clienteNombre }}<small>{{ p.tipo === 'retiro' ? `Solo retiro · ${p.comuna}` : p.comuna }}</small></span>
              <span :class="['qty', { 'qty-retiro': p.tipo === 'retiro' }]">{{ p.tipo === 'retiro' ? `↺${p.retiroEnvases}` : p.cantidadBidones }}</span>
            </li>
          </ol>
          <p v-if="retirosTotales > 0" class="note note-warn">
            <PackageOpen :size="16" />
            <span>Además debes retirar <strong>{{ retirosTotales }} envase(s) vacío(s)</strong> en la ruta.</span>
          </p>
        </section>

        <div class="sticky-cta">
          <button @click="iniciar" class="btn btn-primary btn-xl">
            <Play :size="18" /> Carga lista · iniciar ruta
          </button>
        </div>
      </main>

      <!-- ===================== EN RUTA ===================== -->
      <main v-else-if="etapa === 'ruta'" class="screen">
        <!-- Progreso por paradas -->
        <div class="progress">
          <div class="progress-label">
            <span>Paso 2 de 3 · Entregas</span>
            <strong>{{ completadas.length }} de {{ paradas.length }} listas</strong>
          </div>
          <div class="segments">
            <span v-for="p in paradas" :key="p.id" :class="['seg', `seg-${p.estado}`, { 'seg-next': p.id === siguiente?.id }]"></span>
          </div>
        </div>

        <!-- Ruta completa en Google Maps: un toque abre todas las paradas en el orden optimizado -->
        <div v-if="tramosMaps.length" class="maps-route">
          <p v-if="infoRuta" class="route-info dark"><Route :size="14" /> {{ infoRuta }}</p>
          <a v-for="(t, idx) in tramosMaps" :key="t.url" :href="t.url" target="_blank" rel="noopener"
            :class="['btn', idx === 0 ? 'btn-primary' : 'btn-secondary', 'btn-maps']">
            <MapIcon :size="18" />
            <span v-if="tramosMaps.length === 1">Abrir ruta completa en Google Maps</span>
            <span v-else>Tramo {{ idx + 1 }} en Google Maps</span>
            <small>{{ descripcionTramo(t) }}</small>
          </a>
        </div>

        <!-- Próxima parada -->
        <section v-if="siguiente" class="hero">
          <div class="hero-head">
            <span class="hero-kicker">Próxima parada · {{ ordenDe(siguiente.id) }} de {{ paradas.length }}</span>
            <span :class="['paid-pill', { 'pill-retiro': esRetiro(siguiente) }]">{{ esRetiro(siguiente) ? 'Solo retiro' : 'Pagado' }}</span>
          </div>
          <h1 class="hero-title">{{ siguiente.clienteNombre }}</h1>
          <p class="hero-address"><MapPin :size="16" /> {{ siguiente.direccion }}, {{ siguiente.comuna }}</p>

          <div class="quick-actions">
            <a :href="urlNavegar(siguiente)" target="_blank" rel="noopener" class="btn btn-secondary">
              <Navigation :size="16" /> Navegar
            </a>
            <a :href="`tel:${siguiente.telefono.replace(/\s/g, '')}`" class="btn btn-secondary">
              <Phone :size="16" /> Llamar
            </a>
          </div>

          <!-- Dos confirmaciones separadas: lo que entregó y lo que recibió -->
          <div :class="['confirm-grid', { single: esRetiro(siguiente) }]">
            <div v-if="!esRetiro(siguiente)" :class="['confirm-card', { ok: entregaConfirmada }]">
              <span class="cc-label">Entregué llenos</span>
              <span class="cc-num">{{ siguiente.cantidadBidones }}</span>
              <small class="cc-sub">{{ siguiente.tipoProducto.replace('Agua Purificada ', '') }}</small>
              <button class="cc-btn" :aria-pressed="entregaConfirmada" @click="entregaConfirmada = !entregaConfirmada">
                <Check v-if="entregaConfirmada" :size="16" /> {{ entregaConfirmada ? `Entregué ${siguiente.cantidadBidones}` : 'Confirmar entrega' }}
              </button>
            </div>

            <div :class="['confirm-card', { ok: vaciosConfirmados, warn: !esRetiro(siguiente) && vaciosRecibidos < siguiente.cantidadBidones }]">
              <span class="cc-label">Recibí vacíos</span>
              <div class="stepper">
                <button @click="cambiarVacios(-1)" :disabled="vaciosRecibidos <= 0" aria-label="Menos vacíos">−</button>
                <strong class="cc-num">{{ vaciosRecibidos }}</strong>
                <button @click="cambiarVacios(1)" :disabled="vaciosRecibidos >= maxVacios" aria-label="Más vacíos">+</button>
              </div>
              <small class="cc-sub">{{ esperadoVacios }}</small>
              <button class="cc-btn" :aria-pressed="vaciosConfirmados" @click="vaciosConfirmados = !vaciosConfirmados">
                <Check v-if="vaciosConfirmados" :size="16" /> {{ vaciosConfirmados ? `Recibí ${vaciosRecibidos}` : 'Confirmar vacíos' }}
              </button>
            </div>
          </div>

          <p v-if="avisoVacios" class="note note-warn"><PackageOpen :size="16" /> <span>{{ avisoVacios }}</span></p>

          <button @click="cerrarParada(siguiente)" class="btn btn-success btn-xl" :disabled="!paradaLista">
            <Check :size="20" /> {{ textoCierre }}
          </button>
          <button @click="abrirNovedad(siguiente)" class="link-btn">
            <AlertTriangle :size="15" /> {{ esRetiro(siguiente) ? 'No pude retirar · reportar novedad' : 'No pude entregar normal · reportar novedad' }}
          </button>
        </section>

        <!-- Ruta completa: volver a bodega -->
        <section v-else class="hero hero-dark">
          <span class="hero-kicker">Paso 3 de 3 · Retorno</span>
          <h1 class="hero-title">{{ ausentes.length ? 'Quedan ausencias por resolver' : 'Ruta completa' }}</h1>
          <p class="hero-address light">
            {{ ausentes.length
              ? 'La oficina decidirá si vuelves hoy. Si no, vuelve a bodega y cierra la ruta.'
              : 'Vuelve a bodega central y descarga el furgón.' }}
          </p>
          <div class="return-grid">
            <div><strong>{{ resumenRetorno.vacios }}</strong><span>vacíos a descargar</span></div>
            <div><strong>{{ resumenRetorno.llenos }}</strong><span>llenos de vuelta</span></div>
            <div><strong>{{ rotosTurno }}</strong><span>rotos informados</span></div>
          </div>
          <button @click="confirmarCierre = true" class="btn btn-success btn-xl">
            <Warehouse :size="18" /> Llegué a bodega · cerrar ruta
          </button>
        </section>

        <!-- Ausencias informadas -->
        <section v-if="ausentes.length" class="block">
          <h2 class="block-title">Esperando a la oficina</h2>
          <div v-for="p in ausentes" :key="p.id" class="row row-absent">
            <span class="seq seq-absent">{{ ordenDe(p.id) }}</span>
            <span class="row-main">{{ p.clienteNombre }}<small>Ausente · la oficina coordina el regreso</small></span>
            <a :href="`tel:${p.telefono.replace(/\s/g, '')}`" class="icon-round" aria-label="Llamar"><Phone :size="16" /></a>
          </div>
        </section>

        <!-- Siguientes paradas -->
        <section v-if="despues.length" class="block">
          <h2 class="block-title">Después</h2>
          <div v-for="p in despues" :key="p.id" class="row">
            <span class="seq">{{ ordenDe(p.id) }}</span>
            <span class="row-main">{{ p.clienteNombre }}<small>{{ p.tipo === 'retiro' ? 'Solo retiro · ' : '' }}{{ p.direccion }}, {{ p.comuna }}</small></span>
            <span :class="['qty', { 'qty-retiro': p.tipo === 'retiro' }]">{{ p.tipo === 'retiro' ? `↺${p.retiroEnvases}` : p.cantidadBidones }}</span>
          </div>
        </section>

        <!-- Completadas -->
        <section v-if="completadas.length" class="block">
          <h2 class="block-title">Listas</h2>
          <div v-for="p in completadas" :key="p.id" class="row row-done">
            <span class="seq seq-done"><Check :size="14" /></span>
            <span class="row-main">{{ p.clienteNombre }}<small>{{ resultado(p) }}</small></span>
          </div>
        </section>
      </main>

      <!-- Confirmar cierre de ruta -->
      <Transition name="sheet">
        <div v-if="confirmarCierre" class="sheet-overlay" @click.self="confirmarCierre = false">
          <div class="sheet" role="dialog" aria-modal="true">
            <div class="sheet-grip"></div>
            <h3>Cerrar ruta en bodega</h3>
            <p class="sheet-sub">Verifica físicamente lo que descargas. Las paradas no entregadas vuelven a la cola de la
              oficina con su pago original.</p>
            <div class="return-grid light">
              <div><strong>{{ resumenRetorno.vacios }}</strong><span>vacíos</span></div>
              <div><strong>{{ resumenRetorno.llenos }}</strong><span>llenos</span></div>
              <div><strong>{{ rotosTurno }}</strong><span>rotos</span></div>
            </div>
            <div class="sheet-actions">
              <button @click="confirmarCierre = false" class="btn btn-secondary">Volver</button>
              <button @click="cerrarRuta" class="btn btn-primary">Confirmar descarga</button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Hoja inferior: reportar novedad -->
      <Transition name="sheet">
        <div v-if="novedadPedido" class="sheet-overlay" @click.self="cerrarNovedad">
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="titulo-novedad">
            <div class="sheet-grip"></div>
            <h3 id="titulo-novedad">¿Qué pasó en esta parada?</h3>
            <p class="sheet-sub">{{ novedadPedido.clienteNombre }} · {{ esRetiro(novedadPedido) ? `retiro de ${novedadPedido.retiroEnvases} envase(s)` : `${novedadPedido.cantidadBidones} botellón(es)` }}.
              Sin fotografía obligatoria.</p>

            <div class="options">
              <label :class="['option', { selected: tipoNovedad === 'ausente' }]">
                <input type="radio" value="ausente" v-model="tipoNovedad" />
                <DoorClosed :size="22" />
                <span><strong>No hay nadie</strong><small>No se entrega. La oficina coordina volver hoy o mañana.</small></span>
              </label>
              <label v-if="!esRetiro(novedadPedido)" :class="['option', { selected: tipoNovedad === 'roto' }]">
                <input type="radio" value="roto" v-model="tipoNovedad" />
                <ShieldAlert :size="22" />
                <span><strong>Se rompió un botellón</strong><small>Entrega parcial. El saldo va al turno siguiente sin nuevo
                    cobro.</small></span>
              </label>
            </div>

            <div v-if="tipoNovedad === 'pendiente' || tipoNovedad === 'roto'" class="stepper-row">
              <span>{{ tipoNovedad === 'roto' ? 'Botellones rotos' : 'Vacíos que faltaron' }}</span>
              <div class="stepper">
                <button @click="cantidadNovedad = Math.max(1, cantidadNovedad - 1)" aria-label="Menos">−</button>
                <strong>{{ cantidadNovedad }}</strong>
                <button @click="cantidadNovedad = Math.min(novedadPedido.cantidadBidones, cantidadNovedad + 1)" aria-label="Más">+</button>
              </div>
            </div>

            <div v-if="tipoNovedad === 'roto'" :class="['form-group', { 'has-error': errorAceptacion }]">
              <label class="check">
                <input type="checkbox" v-model="aceptacionCliente" @change="errorAceptacion = ''" />
                Le expliqué al cliente y aceptó recibir {{ novedadPedido.cantidadBidones - cantidadNovedad }} de {{
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
import { useRoute } from 'vue-router';
import {
  AlertTriangle, ArrowLeft, Check, DoorClosed, Map as MapIcon, MapPin, Navigation, PackageOpen, Phone, Play, ShieldAlert,
  Route, Warehouse, Wifi, WifiOff
} from 'lucide-vue-next';
import paisaje from '../../assets/aguamantra-paisaje.jpg';
import { appStore } from '../../store/useAppStore';
import { notificar } from '../../store/useToast';
import { BODEGA_CENTRAL } from '../../utils/geo';
import { enlacesRutaGoogleMaps } from '../../utils/rutas';
import type { TramoGoogleMaps } from '../../utils/rutas';
import { hoyISO } from '../../utils/formato';
import type { Pedido } from '../../types';

// Cada chofer usa la app con su furgón: se elige una vez y el teléfono lo recuerda (o llega por ?furgon=veh-2)
const CLAVE_FURGON = 'chofer_furgon';
const route = useRoute();
function furgonInicial() {
  const desdeUrl = typeof route.query.furgon === 'string' ? route.query.furgon : null;
  let guardado: string | null = null;
  try { guardado = localStorage.getItem(CLAVE_FURGON); } catch { /* sin almacenamiento */ }
  const candidato = desdeUrl ?? guardado;
  return appStore.state.vehiculos.some(v => v.id === candidato) ? candidato! : appStore.state.vehiculos[0].id;
}
const vehiculoId = ref(furgonInicial());
watch(vehiculoId, id => {
  try { localStorage.setItem(CLAVE_FURGON, id); } catch { /* sin almacenamiento */ }
});

const turno = computed(() => appStore.turnoDe(vehiculoId.value, hoyISO()));
const paradas = computed(() => (turno.value ? appStore.pedidosDeTurno(turno.value) : []));

// La app guía al chofer en 3 pasos: cargar en bodega, entregar, volver y cerrar
const etapa = computed<'sin_ruta' | 'carga' | 'ruta'>(() => {
  if (!turno.value || paradas.value.length === 0 || turno.value.estado === 'finalizado') return 'sin_ruta';
  return turno.value.estado === 'preparacion' ? 'carga' : 'ruta';
});
const tituloEtapa = computed(() => ({ sin_ruta: 'Mi ruta', carga: 'Carga en bodega', ruta: 'En ruta' })[etapa.value]);

const pendientes = computed(() => paradas.value.filter(p => p.estado === 'en_despacho'));
const siguiente = computed(() => pendientes.value[0]);
const despues = computed(() => pendientes.value.slice(1));
const ausentes = computed(() => paradas.value.filter(p => p.estado === 'ausente'));
const completadas = computed(() => paradas.value.filter(p => p.estado === 'entregado' || p.estado === 'parcial'));

const llenosACargar = computed(() => paradas.value.reduce((acc, p) => acc + p.cantidadBidones, 0));
const retirosTotales = computed(() => {
  const clientes = new Set(paradas.value.map(p => p.clienteId));
  return [...clientes].reduce((acc, id) => acc + appStore.retirosPendientesCliente(id), 0);
});
const rotosTurno = computed(() => paradas.value
  .filter(p => p.estado === 'parcial')
  .reduce((acc, p) => acc + (p.cantidadBidones - (p.cantidadEntregada ?? p.cantidadBidones)), 0));
const resumenRetorno = computed(() => {
  const llenos = [...pendientes.value, ...ausentes.value].reduce((acc, p) => acc + p.cantidadBidones, 0);
  return { llenos, vacios: Math.max(0, (turno.value?.botellonesCargados ?? 0) - llenos) };
});

// Orden de visita calculado para el menor tiempo de manejo (sale y vuelve a la bodega)
const infoRuta = computed(() => {
  const t = turno.value;
  if (!t || !paradas.value.length) return '';
  if (t.estado === 'preparacion' && !t.ordenParadas) return 'Calculando el recorrido más rápido…';
  if (t.rutaKm === undefined || t.rutaMin === undefined) return '';
  const base = `${t.rutaKm.toFixed(1)} km · ~${Math.round(t.rutaMin)} min de manejo`;
  return t.rutaFuente === 'calles' ? `Ruta optimizada por tiempo: ${base}` : `Orden aproximado (sin conexión): ${base}`;
});

// Paradas pendientes en el orden optimizado + regreso a bodega (se recalcula con cada entrega)
const tramosMaps = computed(() => (pendientes.value.length ? enlacesRutaGoogleMaps(pendientes.value, BODEGA_CENTRAL) : []));

function descripcionTramo(t: TramoGoogleMaps) {
  const paradasTramo = t.hasta - t.desde + 1;
  const texto = paradasTramo > 0 ? `${paradasTramo} parada${paradasTramo === 1 ? '' : 's'}` : '';
  return [texto, t.terminaEnBodega ? 'vuelta a bodega' : ''].filter(Boolean).join(' + ');
}

function ordenDe(id: string) {
  return paradas.value.findIndex(p => p.id === id) + 1;
}

function retirosDe(clienteId: string) {
  return appStore.retirosPendientesCliente(clienteId);
}

function urlNavegar(p: Pedido) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.direccion}, ${p.comuna}`)}`;
}

const esRetiro = (p: Pedido) => p.tipo === 'retiro';

// Confirmaciones de la parada actual. Se reinician al pasar a la siguiente parada.
const entregaConfirmada = ref(false);
const vaciosConfirmados = ref(false);
const vaciosRecibidos = ref(0);
const deudaSiguiente = computed(() => (siguiente.value ? retirosDe(siguiente.value.clienteId) : 0));
// En una entrega se esperan tantos vacíos como llenos; además puede devolver lo que debía de antes
const maxVacios = computed(() => {
  const p = siguiente.value;
  if (!p) return 0;
  return esRetiro(p) ? deudaSiguiente.value : p.cantidadBidones + deudaSiguiente.value;
});
watch(() => siguiente.value?.id, () => {
  const p = siguiente.value;
  entregaConfirmada.value = false;
  vaciosConfirmados.value = false;
  vaciosRecibidos.value = p ? (esRetiro(p) ? deudaSiguiente.value : p.cantidadBidones) : 0;
}, { immediate: true });

function cambiarVacios(delta: number) {
  vaciosRecibidos.value = Math.min(Math.max(0, vaciosRecibidos.value + delta), maxVacios.value);
  vaciosConfirmados.value = false; // al cambiar la cantidad hay que volver a confirmar
}

const esperadoVacios = computed(() => {
  const p = siguiente.value;
  if (!p) return '';
  if (esRetiro(p)) return `debe ${deudaSiguiente.value} de entregas anteriores`;
  return deudaSiguiente.value
    ? `esperado ${p.cantidadBidones} · además debe ${deudaSiguiente.value} de antes`
    : `esperado ${p.cantidadBidones} (intercambio)`;
});

// Qué va a pasar con los vacíos al cerrar la parada
const avisoVacios = computed(() => {
  const p = siguiente.value;
  if (!p) return '';
  if (esRetiro(p)) {
    const quedan = deudaSiguiente.value - vaciosRecibidos.value;
    return quedan > 0 ? `Quedarán ${quedan} envase(s) pendiente(s) para un próximo retiro.` : '';
  }
  const faltan = p.cantidadBidones - vaciosRecibidos.value;
  if (faltan > 0) return `Faltan ${faltan} vacío(s): quedarán pendientes de devolución del cliente.`;
  const extra = vaciosRecibidos.value - p.cantidadBidones;
  if (extra > 0) return `Recibes ${extra} envase(s) que el cliente debía de antes.`;
  return '';
});

const paradaLista = computed(() => vaciosConfirmados.value && (!siguiente.value || esRetiro(siguiente.value) || entregaConfirmada.value));

const textoCierre = computed(() => {
  const p = siguiente.value;
  if (!p) return '';
  if (!paradaLista.value) return esRetiro(p) ? 'Confirma los vacíos para cerrar' : 'Confirma entrega y vacíos para cerrar';
  return esRetiro(p)
    ? `Cerrar parada · recibí ${vaciosRecibidos.value}`
    : `Cerrar parada · entregué ${p.cantidadBidones} · recibí ${vaciosRecibidos.value}`;
});

function resultado(p: Pedido) {
  if (esRetiro(p)) return p.retiroRealizado ? `Retiro · ${p.retiroRealizado} envase(s) recogido(s)` : 'Retiro · sin envases para recoger';
  if (p.estado === 'parcial') return `Parcial: ${p.cantidadEntregada} de ${p.cantidadBidones}, aceptado por el cliente`;
  if (p.envasesNoDevueltos) return `Entregado · ${p.envasesNoDevueltos} vacío(s) pendiente(s)`;
  return `Entregado · ${p.cantidadBidones} bidón(es)`;
}

function iniciar() {
  if (!turno.value) return;
  try {
    appStore.iniciarRuta(turno.value.id);
    notificar('Ruta iniciada. La oficina ya ve tu avance.', 'exito', 2800);
  } catch (err) {
    notificar((err as Error).message, 'error', 5000);
  }
}

function cerrarParada(p: Pedido) {
  if (!paradaLista.value) return;
  const recibidos = vaciosRecibidos.value;
  if (esRetiro(p)) {
    appStore.confirmarEntregaChofer(p.id, recibidos);
    notificar(`Retiro en ${p.clienteNombre}: ${recibidos} envase(s) recogido(s).`, 'exito', 2800);
    return;
  }
  appStore.confirmarVisitaChofer(p.id, recibidos);
  notificar(`${p.clienteNombre}: entregaste ${p.cantidadBidones} y recibiste ${recibidos} vacío(s).`, 'exito', 2800);
}

const confirmarCierre = ref(false);

function cerrarRuta() {
  if (!turno.value) return;
  const r = appStore.liquidarRetornoFurgonCentral(turno.value.id, 'chofer');
  confirmarCierre.value = false;
  notificar(`Ruta cerrada: ${r.vaciosRecolectados} vacíos y ${r.llenosNoEntregados} llenos descargados.`, 'exito', 4000);
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
      ? 'Ausencia informada a la oficina.'
      : 'Novedad registrada e informada a la oficina.', 'info', 2800);
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
  background: var(--am-noche);
  color: #ffffff;
}

/* Franja con el cielo del logo AguaMantra */
.app-bar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: var(--am-cielo);
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
  min-width: 0;
}

.app-bar-title strong {
  font-size: 1.05rem;
}

.app-bar-title span {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.van-select select {
  max-width: 100%;
  padding: 2px 22px 2px 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  cursor: pointer;
}

.van-select select:focus {
  box-shadow: none;
  background: transparent;
  color: #ffffff;
}

.van-select option {
  color: var(--zun-negro);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
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

/* ==========================================================================
   PANTALLAS
   ========================================================================== */
.screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 32px;
}

.screen-center {
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 48px 28px;
}

.empty-art {
  width: 100%;
  max-width: 320px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: 16px;
  box-shadow: 0 16px 32px -16px rgba(4, 31, 38, 0.6);
  margin-bottom: 8px;
}

.screen-title {
  font-size: 1.4rem;
  font-weight: 800;
}

.screen-sub {
  color: var(--zun-gris);
  font-size: 0.92rem;
  line-height: 1.5;
}

/* Progreso */
.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--zun-gris);
  margin-bottom: 8px;
}

.progress-label strong {
  color: var(--zun-negro);
  font-family: var(--font-mono);
}

.segments {
  display: flex;
  gap: 4px;
}

.seg {
  flex: 1;
  height: 6px;
  border-radius: 9999px;
  background: var(--zun-border);
}

.seg-entregado,
.seg-parcial {
  background: var(--zun-verde);
}

.seg-ausente {
  background: var(--zun-rojo);
}

.seg-next {
  background: var(--am-petroleo);
  animation: seg-pulso 1.6s ease-in-out infinite;
}

@keyframes seg-pulso {
  50% { background: var(--am-turquesa); }
}

/* Tarjeta principal */
.hero {
  background: var(--zun-blanco);
  border: 2px solid var(--am-noche);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
}

/* Tarjetas oscuras con el paisaje del logo detrás, muy atenuado */
.hero-dark {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  background: var(--am-noche);
  border-color: var(--am-noche);
  color: #ffffff;
}

.hero-dark::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(180deg, rgba(4, 31, 38, 0.92) 0%, rgba(4, 31, 38, 0.78) 100%),
    url('../../assets/aguamantra-paisaje.jpg') center 35% / cover no-repeat;
}

.hero-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hero-kicker {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--zun-gris);
}

.hero-dark .hero-kicker {
  color: rgba(255, 255, 255, 0.65);
}

.paid-pill {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--zun-verde-light);
  color: #065f46;
}

.hero-title {
  font-size: 1.55rem;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.hero-address {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-size: 0.95rem;
  color: var(--zun-gris-dark);
  margin-top: -6px;
}

.hero-address.light {
  color: rgba(255, 255, 255, 0.75);
}

.task-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.task {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
}

.task-warn {
  background: #fef9c3;
  border-color: #facc15;
}

.task-num {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
}

.task-lbl {
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.3;
}

.task-lbl small {
  font-weight: 500;
  color: var(--zun-gris);
}

.note {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 0.84rem;
  line-height: 1.4;
}

.note span {
  flex: 1;
}

.note-warn {
  background: #fef9c3;
  border: 1px solid #facc15;
  color: #422006;
}

.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.route-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: rgba(255, 255, 255, 0.8);
}

.route-info.dark {
  color: var(--am-petroleo);
  font-weight: 600;
}

.maps-route {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-maps {
  width: 100%;
  padding: 14px 16px;
  justify-content: flex-start;
  gap: 10px;
  border-radius: 12px;
  font-size: 0.95rem;
}

.btn-maps {
  flex-wrap: wrap;
  row-gap: 2px;
}

/* Descripción del tramo en su propia línea, bajo el título */
.btn-maps small {
  flex-basis: 100%;
  padding-left: 28px;
  text-align: left;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.75;
}

.pill-retiro {
  background: #fef9c3;
  color: #854d0e;
}

.qty-retiro {
  background: #fef9c3;
  border-color: #facc15;
  color: #854d0e;
}

.confirm-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.confirm-grid.single {
  grid-template-columns: 1fr;
}

.confirm-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 10px;
  border-radius: 12px;
  border: 2px solid var(--zun-border);
  background: var(--zun-blanco-sutil);
  text-align: center;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.confirm-card.warn {
  border-color: #facc15;
  background: #fef9c3;
}

.confirm-card.ok {
  border-color: var(--zun-verde);
  background: var(--zun-verde-light);
}

.cc-label {
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--zun-gris-dark);
}

.cc-num {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  color: var(--zun-negro);
}

.cc-sub {
  font-size: 0.7rem;
  color: var(--zun-gris);
  line-height: 1.3;
  min-height: 1.8em;
}

.cc-btn {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 9px 6px;
  border-radius: 8px;
  border: 1px solid var(--zun-border);
  background: var(--zun-blanco);
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--am-noche);
}

.confirm-card.ok .cc-btn {
  background: var(--zun-verde);
  border-color: var(--zun-verde);
  color: #ffffff;
}

.confirm-card .stepper {
  gap: 10px;
}

.confirm-card .stepper button:disabled {
  opacity: 0.35;
}

.btn-xl:disabled {
  opacity: 0.55;
  background: var(--zun-gris-light) !important;
  border-color: var(--zun-gris-light) !important;
  color: var(--zun-gris-dark) !important;
  pointer-events: none;
}

.btn-xl {
  width: 100%;
  padding: 17px;
  font-size: 1.05rem;
  font-weight: 800;
  border-radius: 12px;
}

.link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--zun-gris-dark);
  padding: 4px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.link-btn:hover {
  color: var(--acento);
}

/* Carga */
.load-total {
  display: flex;
  align-items: center;
  gap: 14px;
}

.load-num {
  font-family: var(--font-mono);
  font-size: 3.4rem;
  font-weight: 800;
  line-height: 1;
}

.load-lbl {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.35;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-title {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--zun-gris);
  margin-top: 4px;
}

.load-list {
  list-style: none;
  background: var(--zun-blanco);
  border: 1px solid var(--zun-border);
  border-radius: 12px;
}

.load-list li,
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

.load-list li + li {
  border-top: 1px solid var(--zun-border);
}

.row {
  background: var(--zun-blanco);
  border: 1px solid var(--zun-border);
  border-radius: 12px;
}

.row-done {
  opacity: 0.75;
}

.row-absent {
  border-color: rgba(255, 38, 42, 0.35);
}

.seq {
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

.seq-done {
  background: var(--zun-verde);
  border-color: var(--zun-verde);
  color: #ffffff;
}

.seq-absent {
  border-color: var(--zun-rojo);
  color: var(--zun-rojo);
}

.load-name,
.row-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-weight: 700;
  font-size: 0.92rem;
  min-width: 0;
}

.load-name small,
.row-main small {
  font-weight: 500;
  font-size: 0.76rem;
  color: var(--zun-gris);
}

.qty {
  font-family: var(--font-mono);
  font-weight: 800;
  font-size: 1.05rem;
  padding: 2px 10px;
  border-radius: 8px;
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
}

.icon-round {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--zun-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--zun-negro);
}

.sticky-cta {
  position: sticky;
  bottom: 0;
  margin: auto -16px -32px;
  padding: 14px 16px calc(14px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--zun-blanco-cielo) 70%, rgba(249, 250, 255, 0));
}

/* Retorno */
.return-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.return-grid div {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  text-align: center;
}

.return-grid.light div {
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
}

.return-grid strong {
  font-family: var(--font-mono);
  font-size: 1.6rem;
}

.return-grid span {
  font-size: 0.72rem;
  opacity: 0.8;
}

/* ==========================================================================
   HOJAS INFERIORES
   ========================================================================== */
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
  line-height: 1.45;
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
  border-radius: 12px;
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
  padding: 13px;
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
  width: 40px;
  height: 40px;
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
