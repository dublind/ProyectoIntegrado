// Formateadores compartidos entre las vistas del panel y la app del chofer

export function formatEstadoLabel(estado: string) {
  const map: Record<string, string> = {
    todos: 'Todos',
    pendiente_pago: 'Pendiente pago',
    pagado: 'Pagados',
    en_despacho: 'En despacho',
    entregado: 'Entregados'
  };
  return map[estado] || estado;
}

export function formatEstado(estado: string) {
  const map: Record<string, string> = {
    pendiente_pago: 'Pendiente pago',
    pagado: 'Pagado',
    en_despacho: 'En despacho',
    entregado: 'Entregado',
    parcial: 'Entrega parcial',
    ausente: 'Cliente ausente',
    cancelado: 'Cancelado'
  };
  return map[estado] || estado;
}

export function getBadgeClass(estado: string) {
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

export function formatEstadoStop(estado: string) {
  const map: Record<string, string> = {
    en_despacho: 'Por entregar',
    entregado: 'Entregado ✓',
    parcial: 'Parcial',
    ausente: 'Ausente'
  };
  return map[estado] || estado;
}

export function getBadgeStopClass(estado: string) {
  const map: Record<string, string> = {
    en_despacho: 'badge-primary',
    entregado: 'badge-success',
    parcial: 'badge-warning',
    ausente: 'badge-danger'
  };
  return map[estado] || 'badge-neutral';
}

export function formatCLP(monto: number) {
  return `$${monto.toLocaleString('es-CL')}`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Fecha local en formato YYYY-MM-DD
export function hoyISO(fecha = new Date()) {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

// Fecha y hora local en formato YYYY-MM-DD HH:mm
export function ahoraISO(fecha = new Date()) {
  return `${hoyISO(fecha)} ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}

export function diasDesde(fechaISO: string, hoy = new Date()) {
  const [y, m, d] = fechaISO.slice(0, 10).split('-').map(Number);
  const origen = new Date(y, m - 1, d);
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.max(0, Math.round((base.getTime() - origen.getTime()) / 86_400_000));
}

export function formatFechaCorta(fechaISO: string) {
  const [y, m, d] = fechaISO.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}
