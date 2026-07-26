/* ============================================================================
 * Sonus · cloud.js · Cliente del Workshop compartido (una sola banda).
 * Sin "preflight" CORS: GET para leer; POST con cuerpo de texto para
 * añadir/renombrar/reordenar/borrar. Todo el mundo con acceso a la página ve
 * y edita la misma lista — sin enlaces, sin sesiones separadas.
 * ==========================================================================*/

const API = '/api/workshop';

async function asJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || ('HTTP ' + res.status));
  return data;
}

function post(payload) {
  return fetch(API, { method: 'POST', body: JSON.stringify(payload) });
}

/** Devuelve { items, updated }. */
export async function fetchWorkshop() {
  return asJson(await fetch(API, { cache: 'no-store' }));
}

export async function addWorkshopItem(item) {
  return asJson(await post({ action: 'add', item }));
}

export async function updateWorkshopItem(id, patch) {
  return asJson(await post({ action: 'update', id, patch }));
}

export async function deleteWorkshopItem(id) {
  return asJson(await post({ action: 'delete', id }));
}

export async function reorderWorkshop(order) {
  return asJson(await post({ action: 'reorder', order }));
}
