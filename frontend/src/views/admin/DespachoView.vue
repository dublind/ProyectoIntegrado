<template>
  <div class="view-stack">
    <!-- Furgones hoy: carga en vivo (llenos por entregar y vacíos recogidos) -->
    <div id="hoy" class="fleet-grid">
      <div v-for="f in furgonesHoy" :key="f.vehiculo.id" :class="['card', 'fleet-card', `is-${f.turno?.estado ?? 'libre'}`]">
        <div class="fleet-head">
          <span class="fleet-icon"><Truck :size="20" /></span>
          <div class="fleet-name">
            <h3>{{ nombreCorto(f.vehiculo.modelo) }}</h3>
            <span class="font-mono text-xs text-muted">{{ f.vehiculo.patente }} · {{ f.vehiculo.choferAsignado }}</span>
          </div>
          <span :class="['badge', estadoBadge(f.turno?.estado)]">{{ estadoTexto(f.turno?.estado) }}</span>
        </div>

        <template v-if="f.turno?.estado === 'en_ruta'">
          <div class="fleet-body">
            <!-- El bidón se vacía a medida que el chofer entrega los llenos -->
            <AguaNivel class="fleet-agua" forma="bidon" animado :nivel="f.carga.llenos / (f.turno.capacidadMax || 1)"
              :etiqueta="`${f.carga.llenos} bidones llenos a bordo de ${f.turno.capacidadMax}`" />
            <div class="fleet-datos">
              <div class="fleet-row">
                <span>A bordo</span>
                <strong class="font-mono">{{ f.carga.total }} / {{ f.turno.capacidadMax }}</strong>
              </div>
              <CargaFurgonBar :llenos="f.carga.llenos" :vacios="f.carga.vacios" :no-devueltos="f.carga.noDevueltos"
                :rotos="f.carga.rotos" :capacidad="f.turno.capacidadMax" />
            </div>
          </div>
          <div class="fleet-foot">
            <span class="text-sm">{{ f.porVisitar }} de {{ f.paradas }} paradas por visitar</span>
            <div class="toolbar-actions">
              <RouterLink to="/seguimiento" class="btn btn-secondary btn-sm"><MapPinned :size="14" /> Mapa</RouterLink>
              <button @click="liquidar(f.turno.id)" class="btn btn-success btn-sm">Cerrar ruta</button>
            </div>
          </div>
        </template>
        <template v-else-if="f.turno?.estado === 'preparacion'">
          <div class="fleet-body">
            <!-- En bodega el agua está quieta: se llena con lo planificado -->
            <AguaNivel class="fleet-agua" forma="bidon" :nivel="f.planificado / (f.turno.capacidadMax || 1)"
              :etiqueta="`${f.planificado} bidones planificados de ${f.turno.capacidadMax}`" />
            <div class="fleet-datos">
              <div class="fleet-row">
                <span>Planificado para hoy</span>
                <strong class="font-mono">{{ f.planificado }} / {{ f.turno.capacidadMax }}</strong>
              </div>
              <div class="plan-bar"><span :style="{ width: `${pct(f.planificado, f.turno.capacidadMax)}%` }"></span></div>
              <span class="text-xs text-muted">{{ f.paradas }} paradas · el chofer debe confirmar la carga en su app</span>
            </div>
          </div>
        </template>
        <p v-else class="text-sm text-muted">
          {{ f.turno?.estado === 'finalizado' ? 'Ruta de hoy cerrada en bodega.' : `Sin pedidos hoy. Capacidad diaria: ${f.vehiculo.capacidadMax} bidones.` }}
        </p>
      </div>
    </div>

    <!-- Calendario de planificación -->
    <section id="planificar" class="card planner">
      <div class="card-head">
        <div>
          <h2 class="card-title">Planificación de la semana</h2>
          <p class="card-sub">Arrastra un pedido pagado a un furgón y día. En el teléfono: tócalo y luego toca la celda.</p>
        </div>
        <div class="week-nav">
          <button class="btn btn-secondary btn-sm" :disabled="semana === 0" @click="semana--" aria-label="Semana anterior">
            <ChevronLeft :size="16" />
          </button>
          <button class="btn btn-secondary btn-sm" @click="semana = 0">Hoy</button>
          <button class="btn btn-secondary btn-sm" @click="semana++" aria-label="Semana siguiente">
            <ChevronRight :size="16" />
          </button>
        </div>
      </div>

      <div class="planner-body">
        <!-- Por planificar -->
        <aside :class="['queue', { 'drop-target': arrastrando && origenArrastre === 'turno', 'drop-hover': sobreCola }]"
          @dragover.prevent="sobreCola = true" @dragleave="sobreCola = false" @drop.prevent="soltarEnCola">
          <div class="queue-head">
            <strong>Por planificar</strong>
            <span class="badge badge-primary">{{ porPlanificar.length }}</span>
          </div>
          <div v-if="porPlanificar.length" class="queue-tools">
            <select v-model="ordenCola" aria-label="Ordenar pedidos por planificar">
              <option value="antiguos">Más tiempo esperando</option>
              <option value="recientes">Más recientes</option>
              <option value="bidones">Más bidones</option>
            </select>
            <button :class="['toggle', { on: agruparPorComuna }]" :aria-pressed="agruparPorComuna"
              @click="agruparPorComuna = !agruparPorComuna">
              <MapPin :size="13" /> Por comuna
            </button>
          </div>
          <p v-if="porPlanificar.length === 0" class="queue-empty">Todos los pedidos pagados están planificados.</p>
          <template v-for="g in gruposCola" :key="g.clave">
            <div v-if="agruparPorComuna" class="group-head">
              <strong>{{ g.clave }}</strong>
              <span>{{ g.pedidos.length }} ped. · {{ g.bidones }} bid.</span>
            </div>
            <article v-for="p in g.pedidos" :key="p.id" draggable="true"
              :class="['order-card', `espera-${nivelEspera(p.fechaCreacion)}`, { selected: seleccionado === p.id }]"
              @dragstart="iniciarArrastre($event, p.id, 'cola')" @dragend="terminarArrastre"
              @click="seleccionar(p.id)" @keydown.enter="seleccionar(p.id)" tabindex="0"
              :aria-pressed="seleccionado === p.id">
              <div class="order-top">
                <span class="font-mono font-bold">{{ p.codigo }}</span>
                <span :class="['qty', { 'qty-retiro': p.tipo === 'retiro' }]"
                  :title="p.tipo === 'retiro' ? 'Envases a retirar' : 'Bidones a entregar'">
                  {{ p.tipo === 'retiro' ? `↺${p.retiroEnvases}` : p.cantidadBidones }}
                </span>
              </div>
              <span class="order-client">{{ p.clienteNombre }}</span>
              <span class="order-meta">{{ [agruparPorComuna ? '' : p.comuna, p.tipo === 'retiro' ? 'solo retiro de envases' : p.pedidoOrigenCodigo ? 'saldo pagado' : ''].filter(Boolean).join(' · ') }}</span>
              <span class="order-wait" :title="`Ingresó el ${p.fechaCreacion}`">
                <Clock :size="11" /> {{ textoEspera(p.fechaCreacion) }} · ingresó {{ horaIngreso(p.fechaCreacion) }}
              </span>
            </article>
          </template>
          <p v-if="arrastrando && origenArrastre === 'turno'" class="queue-hint">Suelta aquí para quitarlo del día</p>
        </aside>

        <!-- Grilla furgón × día -->
        <div class="grid-wrap">
          <div class="grid" :style="{ gridTemplateColumns: `150px repeat(${dias.length}, minmax(150px, 1fr))` }">
            <div class="corner"></div>
            <div v-for="d in dias" :key="d.fecha" :class="['day-head', { today: d.esHoy }]">
              <strong>{{ d.titulo }}</strong>
              <span>{{ d.subtitulo }}</span>
              <span v-if="d.esHoy && planificadoHoy > inv.llenosCentral" class="stock-warn">
                Faltan llenos: {{ planificadoHoy }} / {{ inv.llenosCentral }}
              </span>
            </div>

            <template v-for="v in vehiculos" :key="v.id">
              <div class="row-head">
                <strong>{{ nombreCorto(v.modelo) }}</strong>
                <span class="font-mono text-xs text-muted">{{ v.patente }} · {{ v.choferAsignado }}</span>
                <label class="cap-edit">
                  Máx. diario
                  <input type="number" min="1" max="99" :value="v.capacidadMax"
                    @change="cambiarCapacidad(v.id, ($event.target as HTMLInputElement))" />
                </label>
              </div>

              <div v-for="d in dias" :key="`${v.id}-${d.fecha}`"
                :class="['cell', `cell-${celda(v.id, d.fecha).estado}`, {
                  'drop-hover': sobre === `${v.id}|${d.fecha}`,
                  'can-drop': (arrastrando || seleccionado) && celda(v.id, d.fecha).editable,
                  today: d.esHoy
                }]"
                @dragover.prevent="celda(v.id, d.fecha).editable && (sobre = `${v.id}|${d.fecha}`)"
                @dragleave="sobre === `${v.id}|${d.fecha}` && (sobre = '')"
                @drop.prevent="soltarEnCelda(v.id, d.fecha)"
                @click="seleccionado && colocarSeleccionado(v.id, d.fecha)">
                <div class="cell-top">
                  <span class="cell-load font-mono">{{ celda(v.id, d.fecha).planificado }}/{{ celda(v.id, d.fecha).capacidad }}</span>
                  <span v-if="celda(v.id, d.fecha).estado !== 'libre' && celda(v.id, d.fecha).estado !== 'preparacion'"
                    :class="['cell-state', `st-${celda(v.id, d.fecha).estado}`]">
                    {{ celda(v.id, d.fecha).estado === 'en_ruta' ? 'En ruta' : 'Cerrado' }}
                  </span>
                </div>
                <div class="plan-bar small" :class="{ full: celda(v.id, d.fecha).planificado >= celda(v.id, d.fecha).capacidad }">
                  <span :style="{ width: `${pct(celda(v.id, d.fecha).planificado, celda(v.id, d.fecha).capacidad)}%` }"></span>
                </div>
                <div class="chips">
                  <span v-for="p in celda(v.id, d.fecha).pedidos" :key="p.id"
                    :class="['chip', `chip-${p.estado}`]" :draggable="celda(v.id, d.fecha).editable"
                    @dragstart.stop="iniciarArrastre($event, p.id, 'turno')" @dragend="terminarArrastre"
                    :title="`${p.codigo} · ${p.clienteNombre} · ${p.comuna}`">
                    <span class="chip-text">{{ p.tipo === 'retiro' ? '↺ ' : '' }}{{ p.clienteNombre }}</span>
                    <span class="chip-qty">{{ p.tipo === 'retiro' ? p.retiroEnvases : p.cantidadBidones }}</span>
                    <button v-if="celda(v.id, d.fecha).editable" class="chip-x" @click.stop="quitar(p.id)"
                      :aria-label="`Quitar ${p.codigo} del día`">&times;</button>
                  </span>
                </div>
                <span v-if="seleccionado && celda(v.id, d.fecha).editable && !celda(v.id, d.fecha).pedidos.length" class="cell-hint">
                  Tocar para asignar
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </section>

    <div id="novedades" class="despacho-grid">
      <!-- Ausencias informadas por el chofer -->
      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Ausencias a reprogramar</h2>
            <p class="card-sub">"Volver hoy" lo deja en la ruta; "Otro día" lo devuelve a por planificar.</p>
          </div>
          <span :class="['badge', ausencias.length ? 'badge-danger' : 'badge-neutral']">{{ ausencias.length }}</span>
        </div>
        <div v-if="ausencias.length === 0" class="empty-box">Sin ausencias en las rutas.</div>
        <div v-else class="list-rows">
          <div v-for="p in ausencias" :key="p.id" class="list-row">
            <div class="row-main">
              <span class="font-bold">{{ p.clienteNombre }}</span>
              <span class="text-xs text-muted">{{ p.codigo }} · {{ p.cantidadBidones }} lleno(s) a bordo · {{ p.telefono }}</span>
            </div>
            <div class="row-actions">
              <button @click="reprogramar(p, 'hoy')" class="btn btn-secondary btn-sm">Volver hoy</button>
              <button @click="reprogramar(p, 'manana')" class="btn btn-secondary btn-sm">Otro día</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Saldos de parciales -->
      <section class="card">
        <div class="card-head">
          <div>
            <h2 class="card-title">Saldos de entregas parciales</h2>
            <p class="card-sub">Ya pagados: quedan por planificar sin nuevo cobro.</p>
          </div>
          <span :class="['badge', saldos.length ? 'badge-warning' : 'badge-neutral']">{{ saldos.length }}</span>
        </div>
        <div v-if="saldos.length === 0" class="empty-box">Sin saldos pendientes.</div>
        <div v-else class="list-rows">
          <div v-for="p in saldos" :key="p.id" class="list-row">
            <div class="row-main">
              <span class="font-bold">{{ p.clienteNombre }}</span>
              <span class="text-xs text-muted">{{ p.codigo }} · entregados {{ p.cantidadEntregada }} de {{
                p.cantidadBidones }} · saldo {{ p.cantidadBidones - (p.cantidadEntregada ?? 0) }} · aceptado por el
                cliente</span>
            </div>
            <button @click="programarSaldo(p)" class="btn btn-secondary btn-sm">Llevar a planificar</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, Clock, MapPin, MapPinned, Truck } from 'lucide-vue-next';
import CargaFurgonBar from '../../components/CargaFurgonBar.vue';
import AguaNivel from '../../components/AguaNivel.vue';
import { appStore } from '../../store/useAppStore';
import { notificar } from '../../store/useToast';
import { hoyISO } from '../../utils/formato';
import type { Pedido, TurnoDespacho } from '../../types';

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const inv = computed(() => appStore.state.inventario);
const vehiculos = computed(() => appStore.state.vehiculos.filter(v => v.activo));
const nombreCorto = (modelo: string) => modelo.replace(/\s*\(.*\)$/, '');
const pct = (n: number, total: number) => (total ? Math.min(100, (n / total) * 100) : 0);

// ---------------------------------------------------------------------------
// Semana visible: 7 días desde hoy (o desde hoy + 7 × semana)
// ---------------------------------------------------------------------------
const semana = ref(0);
const dias = computed(() => {
  const hoy = hoyISO();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + semana.value * 7 + i);
    const fecha = hoyISO(d);
    const offset = semana.value * 7 + i;
    return {
      fecha,
      esHoy: fecha === hoy,
      titulo: offset === 0 ? 'Hoy' : offset === 1 ? 'Mañana' : DIAS_SEMANA[d.getDay()],
      subtitulo: `${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`
    };
  });
});

type EstadoCelda = 'libre' | TurnoDespacho['estado'];

// Estado de cada celda furgón × día: carga planificada, capacidad y si se puede editar
function celda(vehiculoId: string, fecha: string) {
  const turno = appStore.turnoDe(vehiculoId, fecha);
  const vehiculo = appStore.vehiculo(vehiculoId)!;
  const estado: EstadoCelda = turno?.estado ?? 'libre';
  return {
    turno,
    estado,
    pedidos: turno ? appStore.pedidosDeTurno(turno) : [],
    planificado: turno ? appStore.cargaPlanificada(turno) : 0,
    capacidad: turno?.capacidadMax ?? vehiculo.capacidadMax,
    editable: estado === 'libre' || estado === 'preparacion'
  };
}

const porPlanificar = computed(() => appStore.state.pedidos.filter(p => p.estado === 'pagado'));

// ---------------------------------------------------------------------------
// Cola "por planificar": orden por hora de ingreso y agrupación por comuna
// ---------------------------------------------------------------------------
const CLAVE_PREFERENCIAS = 'planificacion_cola';
function leerPreferencias(): { orden?: string; agrupar?: boolean } {
  try { return JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS) ?? '{}'); } catch { return {}; }
}
const preferencias = leerPreferencias();
const ordenCola = ref<'antiguos' | 'recientes' | 'bidones'>(
  (['antiguos', 'recientes', 'bidones'] as const).find(o => o === preferencias.orden) ?? 'antiguos');
const agruparPorComuna = ref(preferencias.agrupar ?? false);
function guardarPreferencias() {
  try {
    localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify({ orden: ordenCola.value, agrupar: agruparPorComuna.value }));
  } catch { /* sin almacenamiento: solo dura la sesión */ }
}

// Reloj de la vista para que "hace X" se actualice solo
const ahora = ref(Date.now());
const reloj = setInterval(() => { ahora.value = Date.now(); }, 60_000);
onBeforeUnmount(() => clearInterval(reloj));

const instante = (fecha: string) => new Date(fecha.replace(' ', 'T')).getTime();
const minutosEsperando = (fecha: string) => Math.max(0, Math.round((ahora.value - instante(fecha)) / 60_000));

function textoEspera(fecha: string) {
  const min = minutosEsperando(fecha);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'} ${h % 24} h`;
}

function horaIngreso(fecha: string) {
  const hoy = hoyISO();
  const dia = fecha.slice(0, 10);
  const hora = fecha.slice(11, 16);
  return dia === hoy ? hora : `${dia.slice(8, 10)}-${dia.slice(5, 7)} ${hora}`;
}

// Más de 24 h esperando: urgente; más de 8 h: atención
function nivelEspera(fecha: string) {
  const h = minutosEsperando(fecha) / 60;
  return h >= 24 ? 'alta' : h >= 8 ? 'media' : 'baja';
}

watch([ordenCola, agruparPorComuna], guardarPreferencias);

const colaOrdenada = computed(() => {
  const lista = [...porPlanificar.value];
  if (ordenCola.value === 'bidones') return lista.sort((a, b) => b.cantidadBidones - a.cantidadBidones || instante(a.fechaCreacion) - instante(b.fechaCreacion));
  const signo = ordenCola.value === 'antiguos' ? 1 : -1;
  return lista.sort((a, b) => signo * (instante(a.fechaCreacion) - instante(b.fechaCreacion)));
});

// Con agrupación, las comunas se ordenan por su pedido que más espera (o según el orden elegido)
const gruposCola = computed(() => {
  if (!agruparPorComuna.value) return [{ clave: 'todos', pedidos: colaOrdenada.value, bidones: 0 }];
  const grupos = new Map<string, Pedido[]>();
  colaOrdenada.value.forEach(p => grupos.set(p.comuna, [...(grupos.get(p.comuna) ?? []), p]));
  return [...grupos.entries()].map(([clave, pedidos]) => ({
    clave,
    pedidos,
    bidones: pedidos.reduce((acc, p) => acc + p.cantidadBidones, 0)
  }));
});
const planificadoHoy = computed(() => appStore.turnosDeHoy.value
  .filter(t => t.estado === 'preparacion')
  .reduce((acc, t) => acc + appStore.cargaPlanificada(t), 0));

const furgonesHoy = computed(() => vehiculos.value.map(vehiculo => {
  const turno = appStore.turnoDe(vehiculo.id, hoyISO());
  const pedidos = turno ? appStore.pedidosDeTurno(turno) : [];
  return {
    vehiculo,
    turno,
    carga: turno ? appStore.cargaDeTurno(turno) : { total: 0, llenos: 0, vacios: 0, noDevueltos: 0, rotos: 0 },
    planificado: turno ? appStore.cargaPlanificada(turno) : 0,
    paradas: pedidos.length,
    porVisitar: pedidos.filter(p => p.estado === 'en_despacho').length
  };
}));

function estadoTexto(estado?: TurnoDespacho['estado']) {
  return estado ? { preparacion: 'En bodega', en_ruta: 'En ruta', finalizado: 'Ruta cerrada' }[estado] : 'Libre hoy';
}

function estadoBadge(estado?: TurnoDespacho['estado']) {
  return estado === 'en_ruta' ? 'badge-live' : estado === 'preparacion' ? 'badge-plan' : 'badge-neutral';
}

// ---------------------------------------------------------------------------
// Arrastrar y soltar (escritorio) + tocar para seleccionar y tocar la celda (móvil)
// ---------------------------------------------------------------------------
const arrastrando = ref<string | null>(null);
const origenArrastre = ref<'cola' | 'turno' | null>(null);
const sobre = ref('');
const sobreCola = ref(false);
const seleccionado = ref<string | null>(null);

function iniciarArrastre(e: DragEvent, pedidoId: string, origen: 'cola' | 'turno') {
  arrastrando.value = pedidoId;
  origenArrastre.value = origen;
  seleccionado.value = null;
  e.dataTransfer?.setData('text/plain', pedidoId);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function terminarArrastre() {
  arrastrando.value = null;
  origenArrastre.value = null;
  sobre.value = '';
  sobreCola.value = false;
}

function asignar(pedidoId: string, vehiculoId: string, fecha: string) {
  try {
    appStore.asignarPedido(pedidoId, vehiculoId, fecha);
  } catch (err) {
    notificar((err as Error).message, 'error', 6000);
  }
}

function soltarEnCelda(vehiculoId: string, fecha: string) {
  const id = arrastrando.value;
  terminarArrastre();
  if (id) asignar(id, vehiculoId, fecha);
}

function soltarEnCola() {
  const id = arrastrando.value;
  const desdeTurno = origenArrastre.value === 'turno';
  terminarArrastre();
  if (id && desdeTurno) quitar(id);
}

function seleccionar(pedidoId: string) {
  seleccionado.value = seleccionado.value === pedidoId ? null : pedidoId;
}

function colocarSeleccionado(vehiculoId: string, fecha: string) {
  if (!seleccionado.value || !celda(vehiculoId, fecha).editable) return;
  asignar(seleccionado.value, vehiculoId, fecha);
  seleccionado.value = null;
}

function quitar(pedidoId: string) {
  try {
    appStore.desasignarPedido(pedidoId);
  } catch (err) {
    notificar((err as Error).message, 'error');
  }
}

function cambiarCapacidad(vehiculoId: string, input: HTMLInputElement) {
  try {
    appStore.cambiarCapacidadVehiculo(vehiculoId, Number(input.value));
    notificar('Capacidad diaria actualizada.', 'exito', 2500);
  } catch (err) {
    notificar((err as Error).message, 'error', 6000);
    input.value = String(appStore.vehiculo(vehiculoId)?.capacidadMax ?? '');
  }
}

// ---------------------------------------------------------------------------
// Novedades y cierre de ruta
// ---------------------------------------------------------------------------
const ausencias = computed(() => appStore.state.pedidos.filter(p => p.estado === 'ausente'));
const saldos = computed(() => appStore.state.pedidos.filter(p =>
  p.estado === 'parcial' && !p.saldoProgramado && (p.cantidadEntregada ?? p.cantidadBidones) < p.cantidadBidones
));

function reprogramar(p: Pedido, cuando: 'hoy' | 'manana') {
  appStore.reprogramarAusente(p.id, cuando);
  notificar(cuando === 'hoy'
    ? `${p.clienteNombre} vuelve a la ruta de hoy.`
    : `${p.codigo} vuelve a por planificar; sus llenos regresan a bodega.`, 'info');
}

function programarSaldo(p: Pedido) {
  appStore.programarSaldoParcial(p.id);
  notificar(`Saldo de ${p.codigo} quedó por planificar con su pago original.`, 'exito');
}

function liquidar(turnoId: string) {
  const r = appStore.liquidarRetornoFurgonCentral(turnoId);
  notificar(`Ruta cerrada: ${r.vaciosRecolectados} vacíos y ${r.llenosNoEntregados} llenos ingresan a bodega central.`, 'exito', 6000);
}
</script>

<style scoped>
.fleet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.fleet-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fleet-card.is-en_ruta {
  border: 2px solid var(--zun-verde);
}

.fleet-card.is-preparacion {
  border: 2px solid var(--am-petroleo);
}

.fleet-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fleet-icon {
  width: 40px;
  height: 40px;
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
  font-size: 1rem;
  font-weight: 800;
  color: var(--zun-negro);
}

.fleet-body {
  display: flex;
  align-items: center;
  gap: 16px;
}

.fleet-agua {
  width: 52px;
  flex-shrink: 0;
}

.fleet-datos {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fleet-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.86rem;
}

.fleet-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.plan-bar {
  height: 8px;
  border-radius: 9999px;
  background: var(--zun-border);
  overflow: hidden;
}

.plan-bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--am-petroleo), var(--am-turquesa));
  transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.plan-bar.small {
  height: 5px;
}

.plan-bar.full span {
  background: var(--zun-ambar);
}

/* ==========================================================================
   PLANIFICADOR
   ========================================================================== */
.week-nav {
  display: flex;
  gap: 6px;
}

.week-nav .btn:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.planner-body {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.queue {
  position: sticky;
  top: 90px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: var(--zun-blanco-sutil);
  border: 1px dashed var(--zun-border);
  max-height: 70vh;
  overflow-y: auto;
}

.queue.drop-target {
  border-color: var(--am-turquesa);
}

.queue.drop-hover {
  background: var(--acento-suave);
}

.queue-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.88rem;
}

.queue-empty,
.queue-hint {
  font-size: 0.78rem;
  color: var(--zun-gris);
  text-align: center;
  padding: 10px 4px;
}

.order-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--zun-blanco);
  border: 1px solid var(--zun-border);
  cursor: grab;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.order-card:hover {
  border-color: var(--acento);
  box-shadow: 2px 2px 0 var(--acento);
  transform: translate(-1px, -1px);
}

.order-card:active {
  cursor: grabbing;
}

.order-wait {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--zun-gris);
}

/* Relevancia por tiempo de espera: borde izquierdo de color */
.order-card.espera-media {
  border-left: 4px solid #eab308;
}

.order-card.espera-media .order-wait {
  color: #854d0e;
}

.order-card.espera-alta {
  border-left: 4px solid var(--zun-rojo);
}

.order-card.espera-alta .order-wait {
  color: #991b1b;
  font-weight: 700;
}

.queue-tools {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.queue-tools select {
  flex: 1 1 100%;
  min-width: 0;
  padding: 6px 8px;
  font-size: 0.74rem;
}

.toggle {
  flex: 1 1 100%;
  justify-content: center;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--zun-border);
  background: var(--zun-blanco);
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--zun-gris-dark);
}

.toggle.on {
  background: var(--am-noche);
  border-color: var(--am-noche);
  color: #ffffff;
}

.group-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  margin-top: 6px;
  padding: 0 2px 2px;
  border-bottom: 1px solid var(--zun-border);
  font-size: 0.76rem;
}

.group-head span {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--zun-gris);
}

.order-card.selected {
  border: 2px solid var(--am-petroleo);
  background: var(--acento-suave);
}

.order-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.qty {
  font-family: var(--font-mono);
  font-weight: 800;
  font-size: 0.8rem;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--am-noche);
  color: #ffffff;
}

.qty-retiro {
  background: #facc15;
  color: #422006;
}

.order-client {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--zun-negro);
}

.order-meta {
  font-size: 0.72rem;
  color: var(--zun-gris);
}

.grid-wrap {
  overflow-x: auto;
  padding-bottom: 6px;
}

.grid {
  display: grid;
  gap: 6px;
  min-width: max-content;
}

.corner {
  min-height: 1px;
}

.day-head {
  display: flex;
  flex-direction: column;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 0.8rem;
}

.day-head span {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--zun-gris);
}

.day-head.today {
  background: var(--am-noche);
  color: #ffffff;
  box-shadow: inset 0 -3px 0 var(--am-dorado);
}

.day-head.today span {
  color: rgba(255, 255, 255, 0.75);
}

.day-head .stock-warn {
  color: var(--am-dorado) !important;
  font-weight: 700;
}

.row-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  font-size: 0.84rem;
  border-right: 2px solid var(--zun-border);
}

.cap-edit {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  color: var(--zun-gris);
}

.cap-edit input {
  width: 56px;
  padding: 4px 6px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.cell {
  min-height: 110px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: 10px;
  background: var(--zun-blanco);
  border: 1px solid var(--zun-border);
  transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.cell.today {
  border-color: rgba(4, 31, 38, 0.35);
}

.cell.can-drop {
  border-style: dashed;
  border-color: var(--am-turquesa);
  cursor: copy;
}

.cell.drop-hover {
  background: var(--acento-suave);
  border: 2px solid var(--am-petroleo);
  box-shadow: 0 6px 16px -8px rgba(11, 94, 110, 0.5);
}

.cell-en_ruta {
  background: var(--zun-verde-light);
  border-color: rgba(16, 185, 129, 0.35);
}

.cell-finalizado {
  background: var(--zun-blanco-sutil);
  opacity: 0.75;
}

.cell-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cell-load {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--zun-gris-dark);
}

.cell-state {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
}

.st-en_ruta {
  background: var(--zun-verde);
  color: #ffffff;
}

.st-finalizado {
  background: var(--zun-gris-light);
  color: var(--zun-gris-dark);
}

.chips {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 0.74rem;
  background: var(--acento-suave);
  border: 1px solid rgba(11, 94, 110, 0.25);
  cursor: grab;
}

.chip-en_despacho {
  background: var(--zun-blanco);
  border-color: rgba(16, 185, 129, 0.4);
  cursor: default;
}

.chip-entregado,
.chip-parcial {
  background: var(--zun-verde);
  border-color: var(--zun-verde);
  color: #ffffff;
  cursor: default;
}

.chip-ausente {
  border-color: var(--zun-rojo);
  color: #991b1b;
  cursor: default;
}

.chip-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-qty {
  font-family: var(--font-mono);
  font-weight: 800;
}

.chip-x {
  font-size: 0.95rem;
  line-height: 1;
  color: var(--zun-gris);
  padding: 0 2px;
}

.chip-x:hover {
  color: var(--zun-rojo);
}

.cell-hint {
  margin-top: auto;
  font-size: 0.7rem;
  color: var(--am-petroleo);
  text-align: center;
}

.despacho-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1100px) {
  .despacho-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .planner-body {
    grid-template-columns: 1fr;
  }

  .queue {
    position: static;
    max-height: none;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .queue-head {
    width: 100%;
  }

  .order-card {
    flex: 1 1 140px;
  }
}
</style>
