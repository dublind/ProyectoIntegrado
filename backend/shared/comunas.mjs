// Recargo de delivery por comuna. Misma tabla que frontend/src/utils/comunas.ts:
// si se cambia un monto o una comuna de tramo, actualizar ambos archivos.
const RECARGO = { base: 0, cercana: 1500, intermedia: 3000, lejana: 5000 };

const TRAMOS = {
  base: ['Providencia', 'Ñuñoa'],
  cercana: ['Santiago Centro', 'Las Condes', 'La Reina', 'Macul', 'San Joaquín', 'Recoleta'],
  intermedia: [
    'Vitacura',
    'San Miguel',
    'Peñalolén',
    'La Florida',
    'Independencia',
    'Estación Central',
    'Quinta Normal',
    'Pedro Aguirre Cerda',
    'Conchalí',
    'Huechuraba',
  ],
  lejana: [
    'Maipú',
    'Puente Alto',
    'Pudahuel',
    'Quilicura',
    'Lo Barnechea',
    'Renca',
    'Cerro Navia',
    'Lo Prado',
    'Cerrillos',
    'La Cisterna',
    'San Ramón',
    'La Granja',
    'Lo Espejo',
    'El Bosque',
    'La Pintana',
    'San Bernardo',
  ],
};

const normalizar = (texto) =>
  String(texto ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const tramoPorComuna = new Map(
  Object.entries(TRAMOS).flatMap(([tramo, comunas]) => comunas.map((c) => [normalizar(c), tramo])),
);
tramoPorComuna.set('santiago', 'cercana');

// Comuna fuera de la tabla: sin recargo (la cobertura se valida en el formulario)
export function recargoDelivery(comuna) {
  return RECARGO[tramoPorComuna.get(normalizar(comuna))] ?? 0;
}
