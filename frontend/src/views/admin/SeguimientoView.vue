<template>
  <div class="tracking-layout">
    <div class="map-wrap card">
      <div ref="mapEl" class="map" role="application" aria-label="Mapa de seguimiento de furgones"></div>
      <div :class="['sim-chip', { live: hayGpsVivo }]">
        <span class="sim-dot"></span> {{ hayGpsVivo ? 'GPS del chofer en vivo · resto simulado' : 'Simulación · posiciones no reales' }}
        <span v-if="proveedor" class="sim-provider">{{ proveedor === 'google' ? 'Google Maps' : 'OpenStreetMap' }}</span>
      </div>
    </div>

    <aside class="tracking-panel">
      <section class="card controls">
        <div class="controls-row">
          <button @click="enPausa = !enPausa" class="btn btn-secondary btn-sm" :aria-pressed="enPausa">
            <component :is="enPausa ? Play : Pause" :size="14" /> {{ enPausa ? 'Reanudar' : 'Pausar' }}
          </button>
          <div class="speed-group" role="group" aria-label="Velocidad de simulación">
            <button v-for="v in [1, 4, 10]" :key="v" :class="['speed-btn', { active: velocidad === v }]" @click="velocidad = v">
              x{{ v }}
            </button>
          </div>
        </div>
        <p class="text-xs text-muted">
          Cada furgón sigue su ruta planificada para hoy por calles: avanza a la próxima parada y espera ahí hasta que
          su chofer confirma en la app. {{ rutasReales ? 'Rutas calculadas por calles (OSRM).' : 'Ruteo por calles no disponible: recorrido aproximado.' }}
        </p>
      </section>

      <section v-for="f in flota" :key="f.id" :class="['card', 'truck-card', { 'is-selected': seleccionado === f.id }]"
        @click="enfocar(f.id)" tabindex="0" @keydown.enter="enfocar(f.id)">
        <div class="truck-head">
          <span class="truck-swatch" :style="{ background: f.color }"><Truck :size="16" /></span>
          <div class="truck-name">
            <strong>{{ f.nombre }}</strong>
            <span class="font-mono text-xs text-muted">{{ f.patente }} · {{ f.chofer }}</span>
          </div>
          <span :class="['badge', f.fase === 'estacionado' ? 'badge-neutral' : 'badge-success']">{{ f.fase === 'estacionado' ? 'En bodega' : 'En ruta' }}</span>
        </div>
        <div class="truck-status">
          <span :class="['phase', `phase-${f.fase}`]">{{ etiquetaFase[f.fase] }}</span>
          <span class="status-line">{{ f.estadoTexto }}</span>
          <span v-if="f.destino" class="target-line"><MapPin :size="13" /> {{ f.destino }}</span>
          <div v-if="f.fase !== 'estacionado'" class="truck-metrics">
            <span :class="['gps-tag', `gps-${f.gps}`]"><SatelliteDish :size="13" /> {{ etiquetaGps[f.gps] }}</span>
            <span v-if="f.velocidadKmh !== null"><Gauge :size="13" /> {{ f.velocidadKmh }} km/h</span>
            <span v-if="f.etaMin !== null"><Clock :size="13" /> {{ f.etaMin }} min</span>
            <span v-if="f.kmRestantes !== null"><Route :size="13" /> {{ f.kmRestantes.toFixed(1) }} km</span>
          </div>
          <!-- Respaldo sin GPS: el chofer pide que la oficina valide su llegada -->
          <div v-for="s in solicitudesDe(f.id)" :key="s.id" class="arrival-request" @click.stop>
            <span><strong>{{ s.clienteNombre }}</strong>: el chofer pide validar su llegada ({{ s.llegadaManual?.motivo }}).
              Confírmalo por teléfono antes de autorizar.</span>
            <div class="arrival-request-actions">
              <button class="btn btn-primary btn-sm" @click="autorizarLlegada(s)">Autorizar llegada</button>
              <button class="btn btn-secondary btn-sm" @click="rechazarLlegada(s)">Rechazar</button>
            </div>
          </div>
        </div>
      </section>

      <section class="card legend-card">
        <span class="legend-item"><span class="legend-dot is-pending"></span> Parada por entregar</span>
        <span class="legend-item"><span class="legend-dot is-target"></span> En camino a esta parada</span>
        <span class="legend-item"><span class="legend-dot is-done"></span> Entregada</span>
        <span class="legend-item"><span class="legend-dot is-absent"></span> Cliente ausente</span>
        <span class="legend-item"><span class="legend-dot is-base"></span> Bodega central</span>
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Clock, Gauge, MapPin, Pause, Play, Route, SatelliteDish, Truck } from 'lucide-vue-next';
import { appStore } from '../../store/useAppStore';
import { notificar } from '../../store/useToast';
import { BODEGA_CENTRAL } from '../../utils/geo';
import { crearMapa } from '../../utils/mapa';
import type { LineaMapa, MapaAdapter, MarcadorMapa, ProveedorMapa } from '../../utils/mapa';
import { hoyISO } from '../../utils/formato';
import { puntoEnTrazado, trazarRuta } from '../../utils/rutas';
import type { Trazado } from '../../utils/rutas';
import type { Coordenadas, Pedido } from '../../types';
import { distanciaM, formatoDistancia, ubicacionVigente } from '../../utils/llegada';

type Fase = 'estacionado' | 'calculando' | 'manejando' | 'semaforo' | 'en_parada';

// Datos visibles en el panel (reactivos)
interface FurgonVista {
  id: string;
  nombre: string;
  patente: string;
  chofer: string;
  color: string;
  demo: boolean;
  fase: Fase;
  estadoTexto: string;
  destino: string | null; // parada a la que va en camino (orden, cliente y dirección)
  gps: 'vivo' | 'simulado_chofer' | 'simulacion'; // de dónde sale la posición del marcador
  velocidadKmh: number | null;
  etaMin: number | null;
  kmRestantes: number | null;
}

// Estado interno de la simulación (no reactivo)
interface Objetivo {
  id: string;
  nombre: string;
  coords: Coordenadas;
  esBodega: boolean;
}

interface Movimiento {
  trazado: Trazado;
  m: number; // metros recorridos en el trazado
  semaforoIdx: number;
  espera: number; // segundos simulados detenido en semáforo
}

interface Simulacion {
  pos: Coordenadas;
  v: number; // m/s
  objetivoId: string | null;
  mov: Movimiento | null;
}

const etiquetaFase: Record<Fase, string> = {
  estacionado: 'En bodega',
  calculando: 'Calculando ruta',
  manejando: 'En movimiento',
  semaforo: 'Detenido en semáforo',
  en_parada: 'En la parada'
};

const etiquetaGps: Record<FurgonVista['gps'], string> = {
  vivo: 'GPS en vivo',
  simulado_chofer: 'GPS simulado (demo)',
  simulacion: 'Posición simulada'
};

const mapEl = ref<HTMLElement | null>(null);
const enPausa = ref(false);
const velocidad = ref(4);
const seleccionado = ref<string | null>(null);
const proveedor = ref<ProveedorMapa | null>(null);
const rutasReales = ref(true);

let mapa: MapaAdapter | null = null;
let marcadoresParadas: MarcadorMapa[] = [];
const marcadoresFurgon = new Map<string, MarcadorMapa>();
const lineasTramo = new Map<string, LineaMapa>();
const lineasPlan = new Map<string, LineaMapa[]>();
let frameId = 0;
let ultimoTs = 0;
let desmontado = false;
let tokenPlan = 0;

// Física simple de ciudad: crucero ~30-43 km/h, acelera 1,6 m/s² y frena 2,2 m/s²
const ACELERACION = 1.6;
const FRENADO = 2.2;
// 1 segundo real = 5 segundos simulados a velocidad x1
const ESCALA_TIEMPO = 5;
const BODEGA: Objetivo = { id: 'bodega', nombre: 'Bodega central', coords: BODEGA_CENTRAL, esBodega: true };

// Color de cada furgón en el mapa (paleta AguaMantra: petróleo y bronce)
const COLORES = ['#0B5E6E', '#9C6B43', '#2E8B9A', '#1E4A45'];

type ParadaMapa = Pedido & { coords: Coordenadas };

const turnoHoy = (vehiculoId: string) => appStore.turnoDe(vehiculoId, hoyISO());
const paradasDe = (vehiculoId: string): ParadaMapa[] => {
  const t = turnoHoy(vehiculoId);
  return t ? appStore.pedidosDeTurno(t).filter((x): x is ParadaMapa => !!x.coords) : [];
};
const pendientesDe = (vehiculoId: string) => paradasDe(vehiculoId).filter(x => x.estado === 'en_despacho');

const flota = reactive<FurgonVista[]>(appStore.state.vehiculos.filter(v => v.activo).map((v, i) => ({
  id: v.id, nombre: `Furgón ${i + 1}`, patente: v.patente, chofer: v.choferAsignado, color: COLORES[i % COLORES.length],
  demo: false, fase: 'estacionado', estadoTexto: '', destino: null, gps: 'simulacion', velocidadKmh: 0, etaMin: null, kmRestantes: null
})));

// Furgones con posición GPS reciente informada por la app del chofer
const hayGpsVivo = computed(() => flota.some(f => f.gps !== 'simulacion' && f.fase !== 'estacionado'));

// Paradas en las que el chofer pidió validar la llegada sin GPS
const solicitudesDe = (vehiculoId: string) => pendientesDe(vehiculoId).filter(p => p.llegadaManual?.estado === 'solicitada');

function autorizarLlegada(p: Pedido) {
  appStore.autorizarLlegadaManual(p.id);
  notificar(`Llegada a ${p.clienteNombre} validada: el chofer ya puede confirmar la entrega.`, 'exito', 3500);
}

function rechazarLlegada(p: Pedido) {
  appStore.rechazarLlegadaManual(p.id);
  notificar(`Se rechazó validar la llegada a ${p.clienteNombre}.`, 'info', 3000);
}

// Último punto desde el que se trazó la ruta GPS → parada (para no recalcularla en cada lectura)
const trazadoGps = new Map<string, { desde: Coordenadas; objetivoId: string }>();

function rumboEntre(a: Coordenadas, b: Coordenadas) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

function textoDestino(vehiculoId: string, p: ParadaMapa) {
  const orden = paradasDe(vehiculoId).findIndex(x => x.id === p.id) + 1;
  return `${orden}. ${p.clienteNombre} · ${p.direccion}, ${p.comuna}`;
}

/**
 * Si el teléfono del chofer informa su posición, el marcador muestra esa posición (no la simulada)
 * y el panel indica a qué parada va en camino y cuánto le falta. Devuelve false si no hay GPS reciente.
 */
function pasoGps(f: FurgonVista, sim: Simulacion, obj: Objetivo): boolean {
  const u = appStore.ubicacionDe(f.id);
  if (!ubicacionVigente(u)) return false;
  const pos = { lat: u.lat, lng: u.lng };
  const rumbo = distanciaM(sim.pos, pos) > 3 ? rumboEntre(sim.pos, pos) : undefined;
  sim.pos = pos;
  sim.v = 0;
  // Al volver a la simulación (GPS perdido) se recalcula la ruta desde la última posición real
  sim.objetivoId = null;
  sim.mov = null;
  moverMarcador(f.id, pos, rumbo);

  // Ruta por calles desde la posición real hasta la parada, recalculada cada ~80 m
  const previo = trazadoGps.get(f.id);
  if (!previo || previo.objetivoId !== obj.id || distanciaM(previo.desde, pos) > 80) {
    trazadoGps.set(f.id, { desde: pos, objetivoId: obj.id });
    trazarRuta(pos, obj.coords).then(t => {
      if (desmontado || trazadoGps.get(f.id)?.desde !== pos) return;
      dibujarTramo(f.id, f.color, t);
    });
  }

  const gps = u.fuente === 'gps' ? 'vivo' : 'simulado_chofer';
  if (obj.esBodega) {
    Object.assign(f, { fase: 'manejando', gps, destino: null, estadoTexto: 'Volviendo a bodega central', velocidadKmh: null, etaMin: null, kmRestantes: distanciaM(pos, obj.coords) / 1000 });
    return true;
  }
  const llegada = appStore.estadoLlegada(obj.id);
  const p = pendientesDe(f.id).find(x => x.id === obj.id);
  const destino = p ? textoDestino(f.id, p) : obj.nombre;
  if (llegada.estado === 'en_destino') {
    Object.assign(f, { fase: 'en_parada', gps, destino, estadoTexto: `Llegó a ${obj.nombre} · puede confirmar la entrega`, velocidadKmh: null, etaMin: 0, kmRestantes: 0 });
  } else {
    const falta = llegada.distanciaM !== null ? ` · faltan ${formatoDistancia(llegada.distanciaM)}` : '';
    const precision = llegada.estado === 'precision_baja' ? ' · señal GPS débil' : '';
    Object.assign(f, {
      fase: 'manejando', gps, destino, estadoTexto: `En camino a ${obj.nombre}${falta}${precision}`,
      velocidadKmh: null, etaMin: llegada.distanciaM !== null ? Math.max(1, Math.round(llegada.distanciaM / 8.5 / 60)) : null,
      kmRestantes: llegada.distanciaM !== null ? llegada.distanciaM / 1000 : null
    });
  }
  return true;
}

const sims = new Map<string, Simulacion>(flota.map(f => [
  f.id, { pos: BODEGA_CENTRAL, v: 0, objetivoId: null, mov: null }
]));

// Cada furgón va a su próxima parada pendiente de hoy; sin pendientes vuelve a bodega
function objetivoReal(vehiculoId: string): Objetivo | { estacionado: string } {
  const turno = turnoHoy(vehiculoId);
  const paradas = paradasDe(vehiculoId);
  if (!turno || !paradas.length) return { estacionado: 'Sin pedidos planificados hoy' };
  if (turno.estado === 'preparacion') {
    return { estacionado: `${paradas.length} paradas planificadas · esperando que el chofer cargue e inicie la ruta` };
  }
  if (turno.estado === 'finalizado') return { estacionado: 'Ruta de hoy cerrada en bodega' };
  const p = pendientesDe(vehiculoId)[0];
  return p ? { id: p.id, nombre: p.clienteNombre, coords: p.coords, esBodega: false } : BODEGA;
}

function htmlFurgon(color: string) {
  return `<span class="truck-pulse" style="background:${color}"></span>
    <span class="truck-heading" style="border-bottom-color:${color}"></span>
    <span class="truck-pin" style="background:${color}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/>
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
        <circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>
      </svg>
    </span>`;
}

function dibujarParadas() {
  const m = mapa;
  if (!m) return;
  marcadoresParadas.forEach(x => x.quitar());
  marcadoresParadas = [
    m.marcadorHtml(BODEGA_CENTRAL, { clase: 'base-marker', html: '<span>B</span>', titulo: 'Bodega central', tamano: 30, zIndex: 5 })
  ];
  // Paradas numeradas por furgón, con el borde del color de su furgón
  flota.forEach(f => {
    const turno = turnoHoy(f.id);
    const objetivoId = turno?.estado === 'en_ruta' ? pendientesDe(f.id)[0]?.id : undefined;
    paradasDe(f.id).forEach((p, idx) => {
      const clase = p.estado === 'entregado' || p.estado === 'parcial' ? 'is-done' : p.estado === 'ausente' ? 'is-absent' : 'is-pending';
      const esObjetivo = p.id === objetivoId;
      marcadoresParadas.push(m.marcadorHtml(p.coords, {
        clase: `stop-marker ${clase}${esObjetivo ? ' is-target' : ''}`,
        html: `<span style="border-color:${f.color}${esObjetivo ? `;background:${f.color}` : ''}">${idx + 1}</span>`,
        titulo: `${f.nombre} · ${idx + 1}. ${p.clienteNombre} · ${p.direccion}${esObjetivo ? ' · en camino' : ''}`,
        tamano: esObjetivo ? 32 : 26, zIndex: esObjetivo ? 20 : 10
      }));
    });
  });
}

function asegurarMarcadores() {
  const m = mapa;
  if (!m) return;
  flota.forEach(f => {
    if (!marcadoresFurgon.has(f.id)) {
      marcadoresFurgon.set(f.id, m.marcadorHtml(sims.get(f.id)!.pos, {
        clase: 'truck-marker', html: htmlFurgon(f.color), titulo: `${f.nombre} · ${f.patente}`, tamano: 34, zIndex: 1000
      }));
    }
  });
}

// Ruta planificada (tramos que faltan) en trazo tenue, por calles
async function dibujarPlan() {
  const m = mapa;
  if (!m) return;
  const token = ++tokenPlan;

  const planes: { id: string; color: string; puntos: Coordenadas[] }[] = [];
  flota.forEach(f => {
    const obj = objetivoReal(f.id);
    if ('id' in obj) {
      planes.push({ id: f.id, color: f.color, puntos: [obj.coords, ...pendientesDe(f.id).slice(1).map(p => p.coords), BODEGA_CENTRAL] });
    }
  });

  const resultados = await Promise.all(planes.map(async plan => {
    const tramos: Trazado[] = [];
    for (let i = 0; i < plan.puntos.length - 1; i++) {
      if (plan.puntos[i] === plan.puntos[i + 1]) continue;
      tramos.push(await trazarRuta(plan.puntos[i], plan.puntos[i + 1]));
    }
    return { ...plan, tramos };
  }));
  if (token !== tokenPlan || mapa !== m) return;

  lineasPlan.forEach(ls => ls.forEach(l => l.quitar()));
  lineasPlan.clear();
  resultados.forEach(r => {
    lineasPlan.set(r.id, r.tramos.map(t => m.linea(t.puntos, { color: r.color, grosor: 4, opacidad: 0.22, punteada: true })));
    if (r.tramos.some(t => !t.real)) rutasReales.value = false;
  });
}

function dibujarTramo(id: string, color: string, t: Trazado | null) {
  lineasTramo.get(id)?.quitar();
  lineasTramo.delete(id);
  if (t && mapa) lineasTramo.set(id, mapa.linea(t.puntos, { color, grosor: 5, opacidad: 0.8 }));
}

function moverMarcador(id: string, pos: Coordenadas, rumbo?: number) {
  const mk = marcadoresFurgon.get(id);
  if (!mk) return;
  mk.mover(pos);
  if (rumbo !== undefined) {
    const flecha = mk.elemento()?.querySelector<HTMLElement>('.truck-heading');
    if (flecha) flecha.style.transform = `rotate(${rumbo}deg)`;
  }
}

function paso(f: FurgonVista, sim: Simulacion, dt: number) {
  // 1. ¿A dónde debe ir?
  const obj = objetivoReal(f.id);

  if ('estacionado' in obj) {
    if (sim.objetivoId !== null) {
      sim.objetivoId = null;
      sim.mov = null;
      dibujarTramo(f.id, f.color, null);
    }
    sim.pos = BODEGA_CENTRAL;
    sim.v = 0;
    moverMarcador(f.id, sim.pos);
    trazadoGps.delete(f.id);
    Object.assign(f, { fase: 'estacionado', estadoTexto: obj.estacionado, destino: null, gps: 'simulacion', velocidadKmh: 0, etaMin: null, kmRestantes: null });
    return;
  }

  // Posición real del teléfono del chofer, si la hay
  if (pasoGps(f, sim, obj)) return;
  if (trazadoGps.delete(f.id)) dibujarTramo(f.id, f.color, null);
  const paradaObj = obj.esBodega ? undefined : pendientesDe(f.id).find(x => x.id === obj.id);
  Object.assign(f, { gps: 'simulacion', destino: paradaObj ? textoDestino(f.id, paradaObj) : null });

  // 2. Si cambió el destino (ej: el chofer confirmó una entrega), se calcula la ruta desde donde está
  if (sim.objetivoId !== obj.id) {
    sim.objetivoId = obj.id;
    sim.mov = null;
    const destino = obj;
    trazarRuta(sim.pos, destino.coords).then(t => {
      if (sim.objetivoId !== destino.id || desmontado) return;
      sim.mov = { trazado: t, m: 0, semaforoIdx: 0, espera: 0 };
      if (!t.real) rutasReales.value = false;
      dibujarTramo(f.id, f.color, t);
    });
  }

  if (!sim.mov) {
    Object.assign(f, { fase: 'calculando', estadoTexto: `Calculando ruta hacia ${obj.nombre}`, velocidadKmh: 0 });
    return;
  }

  const mov = sim.mov;
  const t = mov.trazado;

  // 3. Llegada
  if (mov.m >= t.totalM - 0.5) {
    sim.v = 0;
    Object.assign(f, { velocidadKmh: 0, etaMin: 0, kmRestantes: 0 });
    if (obj.esBodega) {
      Object.assign(f, { fase: 'estacionado', estadoTexto: 'Llegó a bodega · el chofer debe cerrar la ruta' });
    } else {
      Object.assign(f, { fase: 'en_parada', estadoTexto: `En ${obj.nombre} · esperando que el chofer confirme la entrega` });
    }
    return;
  }

  // 4. Semáforo en rojo
  if (mov.espera > 0) {
    mov.espera -= dt;
    sim.v = 0;
    if (mov.espera <= 0) mov.semaforoIdx++;
    Object.assign(f, { fase: 'semaforo', estadoTexto: `Detenido en semáforo · hacia ${obj.nombre}`, velocidadKmh: 0 });
    return;
  }

  // 5. Manejo: acelera hasta crucero y frena antes del próximo semáforo o del destino
  const sem = t.semaforos[mov.semaforoIdx];
  const detenerEn = sem ? sem.m : t.totalM;
  const distancia = Math.max(0, detenerEn - mov.m);
  const crucero = 10 + Math.sin(performance.now() / 3100 + f.id.length + f.patente.charCodeAt(0)) * 1.8;
  const limiteFreno = Math.sqrt(2 * FRENADO * distancia);
  sim.v = Math.max(Math.min(sim.v + ACELERACION * dt, crucero, limiteFreno), distancia > 2 ? 0.4 : 0.05);
  mov.m = Math.min(mov.m + sim.v * dt, detenerEn);
  if (sem && mov.m >= sem.m - 0.5) {
    mov.espera = sem.esperaSeg;
    sim.v = 0;
  }

  const { pos, rumbo } = puntoEnTrazado(t, mov.m);
  sim.pos = pos;
  moverMarcador(f.id, pos, rumbo);

  const restante = t.totalM - mov.m;
  const esperaSemaforos = t.semaforos.slice(mov.semaforoIdx).reduce((acc, s) => acc + s.esperaSeg, 0);
  Object.assign(f, {
    fase: 'manejando',
    estadoTexto: obj.esBodega ? 'Volviendo a bodega central' : `En camino a ${obj.nombre}`,
    velocidadKmh: Math.round(sim.v * 3.6),
    kmRestantes: restante / 1000,
    etaMin: Math.max(1, Math.round((restante / 8.5 + esperaSemaforos) / 60))
  });
}

function bucle(ts: number) {
  // Tope de 0,5 s para no saltar al volver de una pestaña en segundo plano
  const dtReal = ultimoTs ? Math.min(0.5, (ts - ultimoTs) / 1000) : 0;
  ultimoTs = ts;
  if (!enPausa.value && mapa) {
    const dt = dtReal * ESCALA_TIEMPO * velocidad.value;
    // Pasos de máximo 1 s simulado para que el frenado sea estable a velocidad x10
    const pasos = Math.max(1, Math.ceil(dt));
    for (let i = 0; i < pasos; i++) flota.forEach(f => paso(f, sims.get(f.id)!, dt / pasos));
  }
  frameId = requestAnimationFrame(bucle);
}

function enfocar(id: string) {
  seleccionado.value = id;
  const pos = marcadoresFurgon.get(id)?.posicion();
  if (pos && mapa) mapa.centrar(pos, 15);
}

function encuadrarTodo() {
  if (!mapa) return;
  mapa.ajustarTamano();
  const puntos = [BODEGA_CENTRAL, ...flota.flatMap(f => paradasDe(f.id).map(p => p.coords))];
  if (puntos.length > 1) mapa.encuadrar(puntos);
  else mapa.centrar(BODEGA_CENTRAL, 13);
}

function dibujarTodo() {
  dibujarParadas();
  asegurarMarcadores();
  flota.forEach(f => dibujarTramo(f.id, f.color, sims.get(f.id)!.mov?.trazado ?? null));
  dibujarPlan();
}

// Si Google Maps falla (key inválida o sin conexión), se redibuja todo sobre OpenStreetMap
function usarRespaldo(respaldo: MapaAdapter, motivo: string) {
  if (desmontado) {
    respaldo.destruir();
    return;
  }
  mapa = respaldo;
  proveedor.value = respaldo.proveedor;
  marcadoresParadas = [];
  marcadoresFurgon.clear();
  lineasTramo.clear();
  lineasPlan.clear();
  dibujarTodo();
  setTimeout(encuadrarTodo, 60);
  notificar(motivo, 'error', 7000);
}

onMounted(async () => {
  if (!mapEl.value) return;
  const creado = await crearMapa(mapEl.value, BODEGA_CENTRAL, usarRespaldo);
  if (desmontado) {
    creado.destruir();
    return;
  }
  // Si la carga de Google falló, usarRespaldo ya instaló el mapa OSM
  if (!mapa) {
    mapa = creado;
    proveedor.value = creado.proveedor;
    dibujarTodo();
    setTimeout(encuadrarTodo, 60);
  }
  frameId = requestAnimationFrame(bucle);
});

// Cambios del turno (entregas, asignaciones, inicio o cierre de ruta) actualizan paradas y ruta planificada
watch(() => flota.map(f => `${turnoHoy(f.id)?.estado}|${paradasDe(f.id).map(p => `${p.id}:${p.estado}`).join(',')}`).join('#'), () => {
  dibujarParadas();
  dibujarPlan();
});

onBeforeUnmount(() => {
  desmontado = true;
  cancelAnimationFrame(frameId);
  mapa?.destruir();
  mapa = null;
});
</script>

<style scoped>
.tracking-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
  align-items: start;
}

.map-wrap {
  position: relative;
  padding: 0;
  overflow: hidden;
  height: calc(100vh - 250px);
  min-height: 460px;
}

.map {
  width: 100%;
  height: 100%;
}

/* Mapa OSM en tonos apagados para que destaquen rutas y furgones (estilo editorial) */
.map.mapa-osm :deep(.leaflet-tile-pane) {
  filter: grayscale(0.85) contrast(0.95) brightness(1.04);
}

.sim-chip {
  position: absolute;
  top: 14px;
  left: 56px;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--zun-negro);
  color: #ffffff;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
}

.sim-provider {
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
  opacity: 0.75;
}

.sim-chip.live .sim-dot {
  background: var(--zun-verde);
}

.sim-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--zun-ambar);
  animation: blink 1.4s infinite;
}

@keyframes blink {
  50% { opacity: 0.3; }
}

.tracking-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tracking-panel .card {
  padding: 18px 20px;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.speed-group {
  display: flex;
  border: 1px solid var(--zun-border);
  border-radius: var(--radius-pill);
  padding: 3px;
}

.speed-btn {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  color: var(--zun-gris);
}

.speed-btn.active {
  background: var(--zun-negro);
  color: #ffffff;
}

.truck-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.truck-card:hover,
.truck-card.is-selected {
  border-color: var(--zun-negro);
}

.truck-card:hover {
  box-shadow: 3px 3px 0 var(--acento);
  transform: translate(-2px, -2px);
}

.truck-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.truck-swatch {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.truck-name {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.truck-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.phase {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  background: var(--zun-blanco-sutil);
  border: 1px solid var(--zun-border);
  color: var(--zun-gris-dark);
}

.phase-manejando { background: var(--zun-verde); border-color: var(--zun-verde); color: #ffffff; }
.phase-semaforo { background: var(--zun-rojo); border-color: var(--zun-rojo); color: #ffffff; }
.phase-en_parada { background: #facc15; border-color: #eab308; color: #422006; }

.status-line {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--zun-negro);
  line-height: 1.4;
}

.truck-metrics {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--zun-gris);
}

.truck-metrics span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.gps-tag.gps-vivo {
  color: var(--zun-verde);
  font-weight: 700;
}

.gps-tag.gps-simulado_chofer {
  color: var(--am-petroleo);
  font-weight: 700;
}

.target-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--am-petroleo);
  line-height: 1.35;
}

.target-line svg {
  flex: none;
  margin-top: 2px;
}

.arrival-request {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fef9c3;
  border: 1px solid #facc15;
  color: #422006;
  font-size: 0.8rem;
  line-height: 1.4;
  cursor: default;
}

.arrival-request-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.legend-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--zun-gris-dark);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--zun-negro);
  background: #ffffff;
}

.legend-dot.is-done { background: var(--zun-verde); border-color: var(--zun-verde); }
.legend-dot.is-absent { border-color: var(--zun-rojo); }
.legend-dot.is-target { background: var(--am-petroleo); border-color: var(--am-petroleo); box-shadow: 0 0 0 3px var(--acento-suave); }
.legend-dot.is-base { background: var(--am-noche); border-color: var(--am-noche); border-radius: 3px; }

/* Marcadores del mapa (HTML inyectado fuera del scope del componente) */
:deep(.truck-marker) {
  position: relative;
}

:deep(.truck-pin) {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}

/* Flecha de rumbo que gira alrededor del furgón */
:deep(.truck-heading) {
  position: absolute;
  inset: -9px;
  transform-origin: 50% 50%;
  transition: transform 0.25s linear;
  pointer-events: none;
}

:deep(.truck-heading)::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  margin-left: -6px;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 8px solid;
  border-bottom-color: inherit;
}

:deep(.truck-pulse) {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  opacity: 0.25;
  animation: pulse 1.8s ease-out infinite;
}

@keyframes pulse {
  0% { transform: scale(0.6); opacity: 0.45; }
  100% { transform: scale(1.4); opacity: 0; }
}

:deep(.stop-marker span),
:deep(.base-marker span) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'DM Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #111111;
  color: #111111;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

:deep(.stop-marker.is-done span) {
  background: #10b981;
  border-color: #10b981;
  color: #ffffff;
}

:deep(.stop-marker.is-target span) {
  color: #ffffff;
  font-size: 13px;
  animation: target-ring 1.6s ease-out infinite;
}

@keyframes target-ring {
  0% { box-shadow: 0 0 0 0 rgba(11, 94, 110, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25); }
  100% { box-shadow: 0 0 0 12px rgba(11, 94, 110, 0), 0 2px 6px rgba(0, 0, 0, 0.25); }
}

@media (prefers-reduced-motion: reduce) {
  :deep(.stop-marker.is-target span) { animation: none; }
}

:deep(.stop-marker.is-absent span) {
  border-color: #ff262a;
  color: #ff262a;
}

:deep(.base-marker span) {
  border-radius: 6px;
  background: #041F26;
  color: #ffffff;
}

@media (max-width: 1000px) {
  .tracking-layout {
    grid-template-columns: 1fr;
  }

  .map-wrap {
    height: 58vh;
    min-height: 340px;
  }
}
</style>
