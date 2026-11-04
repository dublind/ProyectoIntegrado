/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Key de Maps JavaScript API (pública en el navegador: restringirla por dominio en Google Cloud)
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  // Map ID opcional para estilos de mapa en la nube; por defecto DEMO_MAP_ID
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
