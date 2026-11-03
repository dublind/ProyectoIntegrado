<template>
  <div class="tracking-layout">
    <div class="map-wrap card">
      <div ref="mapEl" class="map" role="application" aria-label="Mapa de seguimiento de furgones"></div>
      <div class="sim-chip">
        <span class="sim-dot"></span> Simulación · posiciones no reales
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
            <button v-for="v in [1, 3, 6]" :key="v" :class="['speed-btn', { active: velocidad === v }]" @click="velocidad = v">
              x{{ v }}
            </button>
          </div>
        </div>
        <p class="text-xs text-muted">
          Recorrido simulado sobre las paradas reales del turno en orden geográfico. Más adelante se reemplaza por la
          ubicación GPS del celular del chofer.
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
          <span :class="['badge', f.demo ? 'badge-neutral' : 'badge-success']">{{ f.demo ? 'Demo' : 'Turno activo' }}</span>
        </div>
        <div class="truck-status">
          <span class="status-line">{{ f.estadoTexto }}</span>
          <div class="truck-metrics">
            <span><Gauge :size="13" /> {{ f.velocidadKmh }} km/h</span>
            <span v-if="f.etaMin !== null"><Clock :size="13" /> {{ f.etaMin }} min</span>
            <span><Route :size="13" /> {{ f.kmRecorridos.toFixed(1) }} / {{ f.kmTotales.toFixed(1) }} km</span>
          </div>
        </div>
      </section>

      <section class="card legend-card">
        <span class="legend-item"><span class="legend-dot is-pending"></span> Parada por entregar</span>
        <span class="legend-item"><span class="legend-dot is-done"></span> Entregada</span>
        <span class="legend-item"><span class="legend-dot is-absent"></span> Cliente ausente</span>
        <span class="legend-item"><span class="legend-dot is-base"></span> Bodega central</span>
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Clock, Gauge, Pause, Play, Route, Truck } from 'lucide-vue-next';
import { appStore } from '../../store/useAppStore';
import { notificar } from '../../store/useToast';
import { BODEGA_CENTRAL, distanciaKm } from '../../utils/geo';
import { crearMapa } from '../../utils/mapa';
import type { LineaMapa, MapaAdapter, MarcadorMapa, ProveedorMapa } from '../../utils/mapa';
import type { Coordenadas, Pedido } from '../../types';

interface Tramo {
  desde: Coordenadas;
  hasta: Coordenadas;
  km: number;
  destino: string; // nombre de la parada a la que lleva este tramo
}

interface FurgonSim {
  id: string;
  nombre: string;
  patente: string;
  chofer: string;
  color: string;
  demo: boolean;
  tramos: Tramo[];
  kmTotales: number;
  kmRecorridos: number;
  velocidadKmh: number;
  etaMin: number | null;
  estadoTexto: string;
}

const mapEl = ref<HTMLElement | null>(null);
const enPausa = ref(false);
const velocidad = ref(1);
const seleccionado = ref<string | null>(null);
const proveedor = ref<ProveedorMapa | null>(null);

// Objetos del mapa fuera del estado reactivo (Leaflet/Google no deben envolverse en proxies)
let mapa: MapaAdapter | null = null;
let marcadoresParadas: MarcadorMapa[] = [];
const marcadoresFurgon = new Map<string, MarcadorMapa>();
const rutasFurgon = new Map<string, LineaMapa>();
let frameId = 0;
let ultimoTs = 0;
let desmontado = false;

// Ruta de demostración del furgón 2 (oriente de Santiago)
const RUTA_DEMO: { nombre: string; coords: Coordenadas }[] = [
  { nombre: 'Av. Apoquindo 4500, Las Condes', coords: { lat: -33.4135, lng: -70.5830 } },
  { nombre: 'Vitacura 3200, Vitacura', coords: { lat: -33.4020, lng: -70.5990 } },
  { nombre: 'Av. Ossa 1600, La Reina', coords: { lat: -33.4410, lng: -70.5560 } },
  { nombre: 'Av. Grecia 2100, Ñuñoa', coords: { lat: -33.4640, lng: -70.5980 } }
];

/**
 * Convierte una línea recta en un recorrido en "L" (primero latitud, luego longitud),
 * que se parece más a manejar por la cuadrícula de calles que una diagonal.
 */
function tramosEnL(puntos: { nombre: string; coords: Coordenadas }[]): Tramo[] {
  const tramos: Tramo[] = [];
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i].coords;
    const b = puntos[i + 1].coords;
    const esquina = { lat: b.lat, lng: a.lng };
    const destino = puntos[i + 1].nombre;
    tramos.push({ desde: a, hasta: esquina, km: distanciaKm(a, esquina), destino });
    tramos.push({ desde: esquina, hasta: b, km: distanciaKm(esquina, b), destino });
  }
  return tramos.filter(t => t.km > 0.001);
}

function construirTramos(paradas: { nombre: string; coords: Coordenadas }[]) {
  const base = { nombre: 'Bodega central', coords: BODEGA_CENTRAL };
  return tramosEnL([base, ...paradas, base]);
}

const paradasTurno = computed(() => appStore.pedidosDespachoActivo.value.filter((p): p is Pedido & { coords: Coordenadas } => !!p.coords));

function crearFlota(): FurgonSim[] {
  const v1 = appStore.state.vehiculos[0];
  const v2 = appStore.state.vehiculos[1];
  const tramos1 = construirTramos(paradasTurno.value.map(p => ({ nombre: p.clienteNombre, coords: p.coords })));
  const tramos2 = construirTramos(RUTA_DEMO);
  const sum = (t: Tramo[]) => t.reduce((acc, x) => acc + x.km, 0);
  return [
    {
      id: v1.id, nombre: 'Furgón 1', patente: v1.patente, chofer: v1.choferAsignado, color: '#111111', demo: false,
      tramos: tramos1, kmTotales: sum(tramos1), kmRecorridos: 0, velocidadKmh: 0, etaMin: null, estadoTexto: 'En bodega'
    },
    {
      id: v2.id, nombre: 'Furgón 2', patente: v2.patente, chofer: v2.choferAsignado, color: '#ff262a', demo: true,
      tramos: tramos2, kmTotales: sum(tramos2), kmRecorridos: sum(tramos2) * 0.35, velocidadKmh: 0, etaMin: null, estadoTexto: ''
    }
  ];
}

const flota = reactive<FurgonSim[]>([]);

function htmlFurgon(color: string) {
  return `<span class="truck-pulse" style="background:${color}"></span>
    <span class="truck-pin" style="background:${color}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/>
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
        <circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>
      </svg>
    </span>`;
}

// Km desde el inicio del tramo i hasta llegar a su parada (tramos contiguos con el mismo destino)
function kmHastaDestino(tramos: Tramo[], i: number) {
  let km = 0;
  for (let j = i; j < tramos.length && tramos[j].destino === tramos[i].destino; j++) km += tramos[j].km;
  return km;
}

function posicionEn(f: FurgonSim) {
  let restante = f.kmRecorridos;
  for (let i = 0; i < f.tramos.length; i++) {
    const t = f.tramos[i];
    if (restante <= t.km) {
      const r = t.km ? restante / t.km : 0;
      return {
        lat: t.desde.lat + (t.hasta.lat - t.desde.lat) * r,
        lng: t.desde.lng + (t.hasta.lng - t.desde.lng) * r,
        idx: i,
        kmAlDestino: kmHastaDestino(f.tramos, i) - restante
      };
    }
    restante -= t.km;
  }
  return { ...BODEGA_CENTRAL, idx: f.tramos.length - 1, kmAlDestino: 0 };
}

function dibujarParadas() {
  const m = mapa;
  if (!m) return;
  marcadoresParadas.forEach(x => x.quitar());
  marcadoresParadas = [
    m.marcadorHtml(BODEGA_CENTRAL, { clase: 'base-marker', html: '<span>B</span>', titulo: 'Bodega central', tamano: 30, zIndex: 5 })
  ];

  paradasTurno.value.forEach((p, idx) => {
    const clase = p.estado === 'entregado' || p.estado === 'parcial' ? 'is-done' : p.estado === 'ausente' ? 'is-absent' : 'is-pending';
    marcadoresParadas.push(m.marcadorHtml(p.coords, {
      clase: `stop-marker ${clase}`, html: `<span>${idx + 1}</span>`, titulo: `${idx + 1}. ${p.clienteNombre} · ${p.direccion}`, tamano: 26, zIndex: 10
    }));
  });

  RUTA_DEMO.forEach(d => {
    marcadoresParadas.push(m.marcadorHtml(d.coords, { clase: 'demo-marker', html: '<span></span>', titulo: `Demo: ${d.nombre}`, tamano: 12, zIndex: 4 }));
  });
}

function dibujarRutas() {
  const m = mapa;
  if (!m) return;
  flota.forEach(f => {
    rutasFurgon.get(f.id)?.quitar();
    const puntos = f.tramos.length ? [f.tramos[0].desde, ...f.tramos.map(t => t.hasta)] : [];
    rutasFurgon.set(f.id, m.linea(puntos, { color: f.color, grosor: 4, opacidad: 0.35, punteada: f.demo }));
    if (!marcadoresFurgon.has(f.id)) {
      marcadoresFurgon.set(f.id, m.marcadorHtml(BODEGA_CENTRAL, {
        clase: 'truck-marker', html: htmlFurgon(f.color), titulo: `${f.nombre} · ${f.patente}`, tamano: 34, zIndex: 1000
      }));
    }
  });
}

function actualizarFurgon(f: FurgonSim, dtSeg: number) {
  const marcador = marcadoresFurgon.get(f.id);
  if (!f.tramos.length || f.kmTotales === 0) {
    f.estadoTexto = 'Detenido en bodega central (sin paradas asignadas)';
    f.velocidadKmh = 0;
    f.etaMin = null;
    marcador?.mover(BODEGA_CENTRAL);
    return;
  }

  // Velocidad simulada con leve variación (tráfico)
  const base = 32 + Math.sin(performance.now() / 2300 + (f.demo ? 1.7 : 0)) * 9;
  f.velocidadKmh = Math.round(base);
  // Escala de demostración: 1 s real ≈ 30 s de manejo a velocidad x1
  const kmAvance = (base / 120) * dtSeg * velocidad.value;
  f.kmRecorridos = (f.kmRecorridos + kmAvance) % f.kmTotales;

  const pos = posicionEn(f);
  marcador?.mover({ lat: pos.lat, lng: pos.lng });
  const destino = f.tramos[pos.idx]?.destino ?? 'Bodega central';
  f.estadoTexto = destino === 'Bodega central' ? 'Volviendo a bodega central' : `En ruta hacia ${destino}`;
  f.etaMin = Math.max(1, Math.round((pos.kmAlDestino / base) * 60));
}

function bucle(ts: number) {
  // Tope de 0,5 s para no saltar al volver de una pestaña en segundo plano
  const dt = ultimoTs ? Math.min(0.5, (ts - ultimoTs) / 1000) : 0;
  ultimoTs = ts;
  if (!enPausa.value) flota.forEach(f => actualizarFurgon(f, dt));
  frameId = requestAnimationFrame(bucle);
}

function enfocar(id: string) {
  seleccionado.value = id;
  const pos = marcadoresFurgon.get(id)?.posicion();
  if (pos && mapa) mapa.centrar(pos, 15);
}

function reconstruir() {
  const nueva = crearFlota();
  nueva.forEach((n, i) => {
    if (flota[i]) {
      // Conserva el avance proporcional al recalcular la ruta
      const prev = flota[i];
      const ratio = prev.kmTotales ? prev.kmRecorridos / prev.kmTotales : 0;
      Object.assign(prev, { ...n, kmRecorridos: n.kmTotales * ratio });
    } else {
      flota.push(n);
    }
  });
  dibujarParadas();
  dibujarRutas();
}

function encuadrarTodo() {
  if (!mapa) return;
  mapa.ajustarTamano();
  mapa.encuadrar(flota.flatMap(f => f.tramos.map(t => t.hasta)));
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
  rutasFurgon.clear();
  reconstruir();
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
    reconstruir();
    setTimeout(encuadrarTodo, 60);
  }
  frameId = requestAnimationFrame(bucle);
});

// Si el chofer entrega o se asignan pedidos, se recalcula la ruta y el color de las paradas
watch(() => paradasTurno.value.map(p => `${p.id}:${p.estado}`).join('|'), reconstruir);

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
  height: calc(100vh - 180px);
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
  box-shadow: 3px 3px 0 var(--zun-rojo);
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

.status-line {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--zun-negro);
}

.truck-metrics {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 0.74rem;
  color: var(--zun-gris);
}

.truck-metrics span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
.legend-dot.is-base { background: var(--zun-negro); border-radius: 3px; }

/* Marcadores de Leaflet (HTML inyectado fuera del scope del componente) */
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

:deep(.stop-marker.is-absent span) {
  border-color: #ff262a;
  color: #ff262a;
}

:deep(.demo-marker span) {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #ffffff;
  border: 2px solid #ff262a;
}

:deep(.base-marker span) {
  border-radius: 6px;
  background: #111111;
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
