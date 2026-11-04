/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Key de Maps JavaScript API (pública en el navegador: restringirla por dominio en Google Cloud)
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  // Map ID opcional para estilos de mapa en la nube; por defecto DEMO_MAP_ID
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
  // Radio (m) alrededor del domicilio para desbloquear la confirmación de entrega; por defecto 150
  readonly VITE_RADIO_LLEGADA_M?: string;
  // Precisión GPS (m) peor que esta no basta para validar la llegada; por defecto 100
  readonly VITE_GPS_PRECISION_MAX_M?: string;
  // 'true' habilita la simulación de ubicación en un build (demo). En `npm run dev` siempre está disponible
  readonly VITE_GPS_SIMULADO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
