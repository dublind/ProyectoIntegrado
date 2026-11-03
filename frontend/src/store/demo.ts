import { appStore } from './useAppStore';
import { COMUNAS } from '../utils/comunas';

/**
 * Generador de pedidos ficticios para probar cómo se mueven los números.
 * Usa las mismas acciones que la app (crear, pagar, asignar), así que todo
 * queda sincronizado e incluido en la auditoría de cuadratura.
 */

const NOMBRES = [
  'Javiera Soto', 'Matías Rojas', 'Camila Fuentes', 'Benjamín Muñoz', 'Valentina Díaz', 'Tomás Herrera',
  'Fernanda Castro', 'Diego Araya', 'Constanza Silva', 'Sebastián Reyes', 'Catalina Pizarro', 'Nicolás Vega',
  'Isidora Morales', 'Joaquín Contreras', 'Antonia Espinoza', 'Vicente Tapia', 'Florencia Navarro',
  'Cristóbal Sepúlveda', 'Martina Cáceres', 'Agustín Lagos', 'Café Las Lilas', 'Clínica Dental Sonríe',
  'Ferretería El Clavo', 'Jardín Infantil Pequeños Pasos', 'Estudio Arquitectura Norte', 'Minimarket Don Lucho'
];

const CALLES = [
  'Av. Pedro de Valdivia', 'Av. Italia', 'José Pedro Alessandri', 'Av. Grecia', 'Manuel Montt', 'Antonio Varas',
  'Av. Irarrázaval', 'Av. Los Leones', 'Eliodoro Yáñez', 'Av. Ricardo Lyon', 'Av. Macul', 'Av. Tobalaba',
  'San Diego', 'Av. Matta', 'Av. Vicuña Mackenna', 'Av. Departamental', 'Av. Apoquindo', 'Av. Pajaritos'
];

// Más pedidos en la zona base y cercanas, como en la operación real
const PESO_TRAMO = { base: 6, cercana: 4, intermedia: 2, lejana: 1 } as const;

function elegir<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

function comunaAleatoria() {
  const bolsa = COMUNAS.flatMap(c => Array(PESO_TRAMO[c.tramo]).fill(c.nombre) as string[]);
  return elegir(bolsa);
}

function telefonoAleatorio() {
  const n = () => Math.floor(1000 + Math.random() * 9000);
  return `+56 9 ${n()} ${n()}`;
}

export interface ResumenDemo {
  creados: number;
  pagados: number;
  asignados: number;
  sinCupo: number;
}

/**
 * Crea `cantidad` pedidos: ~25% quedan por cobrar, el resto se paga (Webpay o transferencia)
 * y se carga al furgón mientras haya capacidad.
 */
export function generarPedidosDemo(cantidad: number): ResumenDemo {
  const resumen: ResumenDemo = { creados: 0, pagados: 0, asignados: 0, sinCupo: 0 };

  for (let i = 0; i < cantidad; i++) {
    // A veces repite un cliente existente, para ejercitar el prellenado y las alertas de envases
    const existente = Math.random() < 0.25 ? elegir(appStore.state.clientes) : undefined;
    const medioPago = Math.random() < 0.6 ? 'webpay' : 'transferencia';
    const pedido = appStore.crearPedido({
      clienteId: existente?.id,
      nombre: existente?.nombre ?? elegir(NOMBRES),
      telefono: existente?.telefono ?? telefonoAleatorio(),
      direccion: existente?.direccion ?? `${elegir(CALLES)} ${Math.floor(100 + Math.random() * 4800)}`,
      comuna: existente?.comuna ?? comunaAleatoria(),
      cantidadBidones: elegir([1, 1, 2, 2, 2, 3, 4]),
      tipoProducto: 'Agua Purificada 20L Sellada',
      medioPago
    });
    resumen.creados++;

    if (Math.random() < 0.25) continue; // queda pendiente de pago

    if (medioPago === 'webpay') {
      appStore.simularPagoWebpay(pedido.id);
    } else {
      appStore.validarTransferenciaManual(pedido.id, `comprobante_${pedido.codigo.toLowerCase()}.pdf`);
    }
    resumen.pagados++;

    try {
      appStore.asignarPedidoADespacho(pedido.id);
      resumen.asignados++;
    } catch {
      resumen.sinCupo++; // el furgón llegó a su N_max: queda en cola "por cargar"
    }
  }
  return resumen;
}
