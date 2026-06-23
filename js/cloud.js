/* ============================================================================
 * Sonus · cloud.js · Cliente de la API de sesiones en la nube.
 * ==========================================================================*/

const API = '/api/sessions';

async function asJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

/** Lista de sesiones recientes (galería compartida). */
export async function listSessions() {
  return (await asJson(await fetch(API))).sessions || [];
}

/** Obtiene una sesión por id. */
export async function getSession(id) {
  return (await asJson(await fetch(API + '?id=' + encodeURIComponent(id)))).project;
}

/** Crea una sesión nueva. Devuelve { id, editToken }. */
export async function createSession(project) {
  return asJson(await fetch(API, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project }),
  }));
}

/** Actualiza una sesión existente (requiere editToken). */
export async function updateSession(id, editToken, project) {
  return asJson(await fetch(API + '?id=' + encodeURIComponent(id), {
    method: 'PUT', headers: { 'content-type': 'application/json', 'x-edit-token': editToken }, body: JSON.stringify({ project }),
  }));
}
