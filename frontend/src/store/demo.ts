import { appStore } from './useAppStore';
import { COMUNAS } from '../utils/comunas';

/**
 * Generador de pedidos ficticios para probar cómo se mueven los números.
 * Usa las mismas acciones que la app (crear, pagar, asignar), así que todo
 * queda sincronizado e incluido en la auditoría de cuadratura.
 */

// Personas ficticias: nombre + dos apellidos (más de 7.000 combinaciones) y algunos negocios
const NOMBRES_PILA = [
  'Javiera', 'Matías', 'Camila', 'Benjamín', 'Valentina', 'Tomás', 'Fernanda', 'Diego', 'Constanza', 'Sebastián',
  'Catalina', 'Nicolás', 'Isidora', 'Joaquín', 'Antonia', 'Vicente', 'Florencia', 'Cristóbal', 'Martina', 'Agustín',
  'Josefa', 'Felipe', 'Trinidad', 'Ignacio', 'Amanda', 'Maximiliano', 'Renata', 'Lucas', 'Emilia', 'Gaspar'
];
const APELLIDOS = [
  'Soto', 'Rojas', 'Fuentes', 'Muñoz', 'Díaz', 'Herrera', 'Castro', 'Araya', 'Silva', 'Reyes', 'Pizarro', 'Vega',
  'Morales', 'Contreras', 'Espinoza', 'Tapia', 'Navarro', 'Sepúlveda', 'Cáceres', 'Lagos', 'Olivares', 'Bravo',
  'Carrasco', 'Gutiérrez', 'Venegas', 'Poblete', 'Molina', 'Salazar', 'Riquelme', 'Figueroa'
];
const NEGOCIOS = [
  'Café Las Lilas', 'Clínica Dental Sonríe', 'Ferretería El Clavo', 'Jardín Infantil Pequeños Pasos',
  'Estudio Arquitectura Norte', 'Minimarket Don Lucho', 'Peluquería Estilo Libre', 'Taller Mecánico Ruta 5',
  'Gimnasio Fuerza Viva', 'Librería Página Blanca', 'Veterinaria Patitas', 'Oficina Contable Balance'
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

// Nombre que no exista ya entre los clientes, para que cada compra de prueba sea de una persona distinta
function nombreUnico(usados: Set<string>) {
  for (let intento = 0; intento < 200; intento++) {
    const nombre = Math.random() < 0.15
      ? elegir(NEGOCIOS)
      : `${elegir(NOMBRES_PILA)} ${elegir(APELLIDOS)} ${elegir(APELLIDOS)}`;
    if (!usados.has(nombre)) {
      usados.add(nombre);
      return nombre;
    }
  }
  const nombre = `Cliente de prueba ${usados.size + 1}`;
  usados.add(nombre);
  return nombre;
}

function telefonoUnico(usados: Set<string>) {
  const n = () => Math.floor(1000 + Math.random() * 9000);
  let tel = '';
  do tel = `+56 9 ${n()} ${n()}`; while (usados.has(tel));
  usados.add(tel);
  return tel;
}

const claveDireccion = (direccion: string, comuna: string) =>
  `${direccion}|${comuna}`.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

// Dirección (calle + número + comuna) que no exista en ningún cliente ni pedido: cada compra de prueba va a un lugar distinto
function direccionUnica(usadas: Set<string>) {
  for (let intento = 0; intento < 500; intento++) {
    const direccion = `${elegir(CALLES)} ${Math.floor(100 + Math.random() * 4800)}`;
    const comuna = comunaAleatoria();
    const clave = claveDireccion(direccion, comuna);
    if (!usadas.has(clave)) {
      usadas.add(clave);
      return { direccion, comuna };
    }
  }
  throw new Error('No se encontró una dirección libre para el pedido de prueba.');
}

// Hora de ingreso única (al minuto) repartida en los últimos 6 días, en horario de atención (8:00 a 21:00),
// para que los filtros y el orden por tiempo de espera tengan algo que mostrar
const DIAS_HACIA_ATRAS = 6;
function horaIngresoUnica(usadas: Set<string>) {
  const pad = (x: number) => String(x).padStart(2, '0');
  for (let intento = 0; intento < 500; intento++) {
    const d = new Date();
    d.setDate(d.getDate() - Math.floor(Math.random() * (DIAS_HACIA_ATRAS + 1)));
    d.setHours(8 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60), 0, 0);
    if (d.getTime() > Date.now()) continue; // hoy, solo horas que ya pasaron
    const hora = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (!usadas.has(hora)) {
      usadas.add(hora);
      return hora;
    }
  }
  throw new Error('No se encontró una hora de ingreso libre para el pedido de prueba.');
}

export interface ResumenDemo {
  creados: number;
  pagados: number;
}

/**
 * Crea `cantidad` pedidos: ~25% quedan por cobrar y el resto se paga (Webpay o transferencia).
 * Los pagados quedan "por planificar": la asignación a furgón y día la hace una persona en el calendario,
 * viendo cuáles llevan más tiempo esperando y cuáles conviene agrupar por ubicación.
 */
export function generarPedidosDemo(cantidad: number): ResumenDemo {
  const resumen: ResumenDemo = { creados: 0, pagados: 0 };

  // Se revisan clientes y pedidos, para no repetir nombre, teléfono ni dirección
  const nombresUsados = new Set([...appStore.state.clientes.map(c => c.nombre), ...appStore.state.pedidos.map(p => p.clienteNombre)]);
  const telefonosUsados = new Set([...appStore.state.clientes.map(c => c.telefono), ...appStore.state.pedidos.map(p => p.telefono)]);
  const direccionesUsadas = new Set([
    ...appStore.state.clientes.map(c => claveDireccion(c.direccion, c.comuna)),
    ...appStore.state.pedidos.map(p => claveDireccion(p.direccion, p.comuna))
  ]);
  const horasUsadas = new Set(appStore.state.pedidos.map(p => p.fechaCreacion));

  for (let i = 0; i < cantidad; i++) {
    // Siempre un cliente nuevo y distinto: en la demo no deben parecer compras repetidas de una misma persona
    const medioPago = Math.random() < 0.6 ? 'webpay' : 'transferencia';
    const { direccion, comuna } = direccionUnica(direccionesUsadas);
    const creado = appStore.crearPedido({
      nombre: nombreUnico(nombresUsados),
      telefono: telefonoUnico(telefonosUsados),
      direccion,
      comuna,
      cantidadBidones: elegir([1, 1, 2, 2, 2, 3, 4]),
      tipoProducto: 'Agua Purificada 20L Sellada',
      medioPago
    });
    // Se ajusta sobre el objeto reactivo del estado para que la vista lo refleje
    const pedido = appStore.state.pedidos.find(p => p.id === creado.id)!;
    pedido.fechaCreacion = horaIngresoUnica(horasUsadas);
    resumen.creados++;

    if (Math.random() < 0.25) continue; // queda pendiente de pago

    if (medioPago === 'webpay') {
      appStore.simularPagoWebpay(pedido.id);
    } else {
      appStore.validarTransferenciaManual(pedido.id, `comprobante_${pedido.codigo.toLowerCase()}.pdf`);
    }
    resumen.pagados++;
  }
  appStore.sincronizarInventario(); // guarda las horas de ingreso ajustadas
  return resumen;
}
