import { buscarComuna } from './comunas';

// Validaciones del formulario de pedido (Bug 93: los errores se muestran junto a cada campo)

export interface DatosPedidoForm {
  nombre: string;
  telefono: string;
  direccion: string;
  comuna: string;
  cantidadBidones: number;
}

export type ErroresPedido = Partial<Record<keyof DatosPedidoForm, string>>;

/**
 * Normaliza un móvil chileno a "+56 9 XXXX XXXX".
 * Acepta: +56912345678, 56 9 1234 5678, 912345678, 9 1234-5678.
 */
export function normalizarTelefono(valor: string): string | null {
  const digitos = valor.replace(/\D/g, '');
  let local = digitos;
  if (local.startsWith('56')) local = local.slice(2);
  if (!/^9\d{8}$/.test(local)) return null;
  return `+56 9 ${local.slice(1, 5)} ${local.slice(5)}`;
}

export function validarTelefono(valor: string): string | undefined {
  if (!valor.trim()) return 'Ingresa el teléfono de WhatsApp del cliente.';
  if (!normalizarTelefono(valor)) {
    return 'Teléfono inválido. Usa un móvil chileno de 9 dígitos, por ejemplo +56 9 1234 5678.';
  }
  return undefined;
}

export function validarDireccion(valor: string): string | undefined {
  const v = valor.trim();
  if (!v) return 'Ingresa la dirección de entrega.';
  if (v.length < 5) return 'Dirección demasiado corta. Indica calle y número.';
  if (!/[a-záéíóúñ]{2,}/i.test(v)) return 'Dirección inválida. Debe incluir el nombre de la calle.';
  if (!/\d/.test(v)) return 'Dirección inválida. Falta el número de la calle (ej: Av. Providencia 1245).';
  return undefined;
}

export function validarCampoPedido(campo: keyof DatosPedidoForm, datos: DatosPedidoForm): string | undefined {
  switch (campo) {
    case 'nombre':
      return datos.nombre.trim().length < 3 ? 'Ingresa el nombre del cliente (mínimo 3 caracteres).' : undefined;
    case 'telefono':
      return validarTelefono(datos.telefono);
    case 'direccion':
      return validarDireccion(datos.direccion);
    case 'comuna':
      if (!datos.comuna.trim()) return 'Selecciona la comuna de entrega.';
      return buscarComuna(datos.comuna) ? undefined : 'Comuna fuera de la zona de cobertura.';
    case 'cantidadBidones': {
      const n = Number(datos.cantidadBidones);
      if (!Number.isInteger(n) || n < 1) return 'La cantidad debe ser al menos 1 bidón.';
      if (n > 50) return 'Máximo 50 bidones por pedido.';
      return undefined;
    }
  }
}

export function validarPedido(datos: DatosPedidoForm): ErroresPedido {
  const errores: ErroresPedido = {};
  (['nombre', 'telefono', 'direccion', 'comuna', 'cantidadBidones'] as const).forEach(campo => {
    const msg = validarCampoPedido(campo, datos);
    if (msg) errores[campo] = msg;
  });
  return errores;
}
