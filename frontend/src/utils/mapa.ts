import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import type { Coordenadas } from '../types';

/**
 * Adaptador de mapa: la vista de seguimiento dibuja marcadores y rutas sin saber
 * si el mapa es Google Maps (con API key) u OpenStreetMap (respaldo sin key).
 */

export type ProveedorMapa = 'google' | 'osm';

export interface MarcadorMapa {
  mover(c: Coordenadas): void;
  posicion(): Coordenadas;
  quitar(): void;
}

export interface LineaMapa {
  quitar(): void;
}

export interface MapaAdapter {
  proveedor: ProveedorMapa;
  // `clase` y `html` definen el aspecto; el marcador queda centrado en la coordenada
  marcadorHtml(c: Coordenadas, opts: { clase: string; html: string; titulo: string; tamano: number; zIndex?: number }): MarcadorMapa;
  linea(puntos: Coordenadas[], opts: { color: string; opacidad: number; grosor: number; punteada?: boolean }): LineaMapa;
  encuadrar(puntos: Coordenadas[]): void;
  centrar(c: Coordenadas, zoom: number): void;
  ajustarTamano(): void;
  destruir(): void;
}

export const GOOGLE_MAPS_API_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
// DEMO_MAP_ID es el Map ID de pruebas de Google; permite marcadores avanzados sin configurar uno propio
const GOOGLE_MAPS_MAP_ID: string = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

// ==========================================================================
// OpenStreetMap (Leaflet)
// ==========================================================================
function crearMapaOsm(el: HTMLElement, centro: Coordenadas): MapaAdapter {
  const mapa = L.map(el, { zoomControl: true }).setView([centro.lat, centro.lng], 13);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(mapa);
  el.classList.add('mapa-osm');

  return {
    proveedor: 'osm',
    marcadorHtml(c, opts) {
      const m = L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: opts.clase, html: opts.html, iconSize: [opts.tamano, opts.tamano], iconAnchor: [opts.tamano / 2, opts.tamano / 2] }),
        zIndexOffset: opts.zIndex ?? 0
      }).bindTooltip(opts.titulo).addTo(mapa);
      return {
        mover: p => m.setLatLng([p.lat, p.lng]),
        posicion: () => ({ lat: m.getLatLng().lat, lng: m.getLatLng().lng }),
        quitar: () => m.remove()
      };
    },
    linea(puntos, opts) {
      const pl = L.polyline(puntos.map(p => [p.lat, p.lng] as L.LatLngTuple), {
        color: opts.color, weight: opts.grosor, opacity: opts.opacidad, dashArray: opts.punteada ? '6 8' : undefined
      }).addTo(mapa);
      return { quitar: () => pl.remove() };
    },
    encuadrar(puntos) {
      if (puntos.length) mapa.fitBounds(L.latLngBounds(puntos.map(p => [p.lat, p.lng] as L.LatLngTuple)).pad(0.1));
    },
    centrar(c, zoom) {
      mapa.flyTo([c.lat, c.lng], zoom, { duration: 0.8 });
    },
    ajustarTamano() {
      mapa.invalidateSize();
    },
    destruir() {
      mapa.remove();
      el.classList.remove('mapa-osm');
    }
  };
}

// ==========================================================================
// Google Maps (Maps JavaScript API)
// ==========================================================================
let opcionesGoogleFijadas = false;

async function crearMapaGoogle(el: HTMLElement, centro: Coordenadas): Promise<MapaAdapter> {
  if (!opcionesGoogleFijadas) {
    setOptions({ key: GOOGLE_MAPS_API_KEY, v: 'weekly', language: 'es', region: 'CL' });
    opcionesGoogleFijadas = true;
  }
  const { Map, Polyline } = await importLibrary('maps');
  const { AdvancedMarkerElement } = await importLibrary('marker');

  const mapa = new Map(el, {
    center: centro,
    zoom: 13,
    mapId: GOOGLE_MAPS_MAP_ID,
    disableDefaultUI: true,
    zoomControl: true,
    fullscreenControl: true,
    clickableIcons: false,
    gestureHandling: 'greedy'
  });

  return {
    proveedor: 'google',
    marcadorHtml(c, opts) {
      const contenido = document.createElement('div');
      contenido.className = opts.clase;
      contenido.innerHTML = opts.html;
      contenido.style.width = `${opts.tamano}px`;
      contenido.style.height = `${opts.tamano}px`;
      // AdvancedMarker se ancla abajo al centro: se baja medio alto para centrarlo en la coordenada
      contenido.style.transform = `translateY(${opts.tamano / 2}px)`;
      const m = new AdvancedMarkerElement({ map: mapa, position: c, content: contenido, title: opts.titulo, zIndex: opts.zIndex ?? 0 });
      return {
        mover: p => { m.position = p; },
        posicion: () => {
          const p = m.position;
          if (!p) return centro;
          return p instanceof google.maps.LatLng ? { lat: p.lat(), lng: p.lng() } : { lat: Number(p.lat), lng: Number(p.lng) };
        },
        quitar: () => { m.map = null; }
      };
    },
    linea(puntos, opts) {
      const pl = new Polyline({
        map: mapa,
        path: puntos,
        strokeColor: opts.color,
        strokeWeight: opts.grosor,
        // Línea punteada: trazo invisible con símbolos repetidos
        strokeOpacity: opts.punteada ? 0 : opts.opacidad,
        icons: opts.punteada
          ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: opts.opacidad + 0.2, scale: opts.grosor - 1 }, offset: '0', repeat: '14px' }]
          : undefined
      });
      return { quitar: () => pl.setMap(null) };
    },
    encuadrar(puntos) {
      if (!puntos.length) return;
      const b = new google.maps.LatLngBounds();
      puntos.forEach(p => b.extend(p));
      mapa.fitBounds(b, 40);
    },
    centrar(c, zoom) {
      mapa.panTo(c);
      mapa.setZoom(zoom);
    },
    ajustarTamano() {
      // Google Maps se adapta solo al tamaño del contenedor
    },
    destruir() {
      el.innerHTML = '';
    }
  };
}

/**
 * Crea el mapa con Google Maps si hay API key; si no hay key, si falla la carga
 * o si Google rechaza la key (gm_authFailure), usa OpenStreetMap.
 */
export async function crearMapa(
  el: HTMLElement,
  centro: Coordenadas,
  alFallarGoogle: (mapaRespaldo: MapaAdapter, motivo: string) => void
): Promise<MapaAdapter> {
  if (!GOOGLE_MAPS_API_KEY) return crearMapaOsm(el, centro);

  const motivoAuth = 'Google Maps rechazó la API key (revisa restricciones de dominio y APIs habilitadas).';
  let rechazada = false;
  let google: MapaAdapter | null = null;

  // Google no rechaza la promesa con una key inválida o sin permisos: avisa por este callback global,
  // que puede llegar antes o después de crear el mapa, así que se registra antes de cargar
  (window as unknown as { gm_authFailure: () => void }).gm_authFailure = () => {
    if (rechazada) return;
    rechazada = true;
    if (google) {
      google.destruir();
      alFallarGoogle(crearMapaOsm(el, centro), motivoAuth);
    }
  };

  try {
    google = await crearMapaGoogle(el, centro);
    if (rechazada) {
      google.destruir();
      const osm = crearMapaOsm(el, centro);
      alFallarGoogle(osm, motivoAuth);
      return osm;
    }
    return google;
  } catch (err) {
    console.warn('No se pudo cargar Google Maps, se usa OpenStreetMap', err);
    el.innerHTML = '';
    const osm = crearMapaOsm(el, centro);
    alFallarGoogle(osm, 'No se pudo cargar Google Maps; se usa OpenStreetMap.');
    return osm;
  }
}
