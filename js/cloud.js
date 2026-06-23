/* ============================================================================
 * Sonus · cloud.js · Cliente de la API de sesiones en la nube.
 * Sin "preflight" CORS: GET para leer; POST con cuerpo de texto (sin cabeceras
 * personalizadas) para crear/actualizar/borrar.
 * ==========================================================================*/

const API = '/api/sessions';

async function asJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

// POST con cuerpo JSON pero SIN cabecera content-type → petición "simple".
function post(payload) {
  return fetch(API, { method: 'POST', body: JSON.stringify(payload) });
}

/** Lista de sesiones recientes (galería compartida). */
export async function listSessions() {
  return (await asJson(await fetch(API, { cache: 'no-store' }))).sessions || [];
}

/** Obtiene una sesión por id. */
export async function getSession(id) {
  return (await asJson(await fetch(API + '?id=' + encodeURIComponent(id), { cache: 'no-store' }))).project;
}

/** Crea una sesión nueva. Devuelve { id, editToken }. */
export async function createSession(project) {
  return asJson(await post({ action: 'create', project }));
}

/** Actualiza una sesión existente (requiere editToken). */
export async function updateSession(id, editToken, project) {
  return asJson(await post({ action: 'update', id, editToken, project }));
}

/** Borra una sesión (requiere editToken). */
export async function deleteSession(id, editToken) {
  return asJson(await post({ action: 'delete', id, editToken }));
}
