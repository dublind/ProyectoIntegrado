// Contrato SQL/REST local: conserva los identificadores INT del modelo de Agustín.
export interface User { username: string; nombre: string; rol: 'administrador' | 'administrativo' | 'chofer' }
export type Row = Record<string, any>;
export interface State {
  user: User; clientes: Row[]; direcciones: Row[]; pedidos: Row[]; pagos: Row[];
  inventario: Row[]; retornos: Row[]; vehiculos: Row[]; turno: Row | null;
  paradas: Row[]; reportes: Row[]; cuentas: Row[]; auditoria: Row[];
  inconsistencias: Row[]; avisos: Row[]; notificaciones: Row[]; solicitudes: Row[]; modo: string;
}
export async function api<T=Row>(path: string, method='GET', body?: unknown): Promise<T> {
  const response = await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error??'No se pudo completar la solicitud');
  return data;
}
export const event = () => crypto.randomUUID();
