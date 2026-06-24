/* ============================================================================
 * Sonus · cloud.js · Cliente de la API de sesiones (espacio de banda).
 * Sin "preflight" CORS: GET para leer; POST con cuerpo de texto para
 * crear/actualizar/borrar. Cualquiera con el id puede editar.
 * ==========================================================================*/

const API = '/api/sessions';

async function asJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || ('HTTP ' + res.status));
  return data;
}

// POST con cuerpo JSON pero SIN cabecera content-type → petición "simple".
function post(payload) {
  return fetch(API, { method: 'POST', body: JSON.stringify(payload) });
}

export async function listSessions() {
  return (await asJson(await fetch(API, { cache: 'no-store' }))).sessions || [];
}

/** Devuelve { project, updated }. */
export async function getSession(id) {
  const d = await asJson(await fetch(API + '?id=' + encodeURIComponent(id), { cache: 'no-store' }));
  return { project: d.project, updated: d.updated || 0 };
}

/** Crea una sesión nueva. Devuelve { id, updated }. */
export async function createSession(project) {
  return asJson(await post({ action: 'create', project }));
}

/** Actualiza una sesión existente (abierto a cualquiera con el id). */
export async function updateSession(id, project) {
  return asJson(await post({ action: 'update', id, project }));
}

export async function deleteSession(id) {
  return asJson(await post({ action: 'delete', id }));
}
