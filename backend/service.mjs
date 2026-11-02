import { ApiError } from './shared/errors.mjs';
import { getState } from './services/state.mjs';
import { handleClients } from './services/clients.mjs';
import { handleAddresses } from './services/addresses.mjs';
import { handleOrders } from './services/orders.mjs';
import { handlePayments } from './services/payments.mjs';
import { handleVehicles } from './services/vehicles.mjs';
import { handleTurns } from './services/turns.mjs';
import { handleStops } from './services/stops.mjs';
import { handleReturns } from './services/returns.mjs';
import { handleInventory } from './services/inventory.mjs';

// Mantener los exports que utiliza el servidor y cualquier consumidor local.
export { ApiError, fail, permit } from './shared/errors.mjs';
export { move } from './services/inventory.mjs';
export { getState } from './services/state.mjs';

const handlers = {
  clients: handleClients,
  addresses: handleAddresses,
  orders: handleOrders,
  payments: handlePayments,
  vehicles: handleVehicles,
  turns: handleTurns,
  stops: handleStops,
  returns: handleReturns,
  inventory: handleInventory,
};

export async function execute(db, user, method, url, body) {
  const parts = url.split('/').filter(Boolean);
  const resource = parts[1];
  const id = Number(parts[2]);
  const action = parts[3];
  if (resource === 'state' && method === 'GET') {
    return getState(db, user);
  }
  if (resource === 'stops' && action !== 'deliver') {
    throw new ApiError(404, 'Ruta no encontrada');
  }
  const handler = Object.hasOwn(handlers, resource) ? handlers[resource] : undefined;
  if (!handler) {
    throw new ApiError(404, 'Ruta no encontrada');
  }
  return handler(db, user, method, id, action, body);
}
