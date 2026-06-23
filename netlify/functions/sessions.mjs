/* ============================================================================
 * Sonus · netlify/functions/sessions.mjs
 * API de sesiones de composición en la nube (Netlify Blobs).
 *   GET  /api/sessions          → lista de sesiones recientes (galería)
 *   GET  /api/sessions?id=ID    → una sesión
 *   POST /api/sessions          → crea (devuelve { id, editToken })
 *   PUT  /api/sessions?id=ID     → actualiza (cabecera x-edit-token)
 * El editToken se guarda en metadatos del lado servidor y nunca se devuelve
 * en lecturas: cualquiera puede ver/abrir, solo el dueño del token edita.
 * ==========================================================================*/

import { getStore } from '@netlify/blobs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type,x-edit-token',
};
const MAX_BYTES = 300 * 1024;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

const rndId = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
const rndToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const cleanTitle = (p) => String((p && p.name) || 'Sin título').slice(0, 80);

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

  const store = getStore({ name: 'sonus-sessions', consistency: 'strong' });
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  try {
    if (req.method === 'GET') {
      if (id) {
        const project = await store.get(id, { type: 'json' });
        if (!project) return json({ error: 'not_found' }, 404);
        return json({ id, project });
      }
      const { blobs } = await store.list();
      const items = [];
      for (const b of blobs.slice(0, 80)) {
        const md = await store.getMetadata(b.key);
        if (md && md.metadata) items.push({ id: b.key, title: md.metadata.title || 'Sin título', updated: md.metadata.updated || 0 });
      }
      items.sort((a, b) => (b.updated || 0) - (a.updated || 0));
      return json({ sessions: items.slice(0, 40) });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (!body || !body.project) return json({ error: 'bad_request' }, 400);
      if (JSON.stringify(body.project).length > MAX_BYTES) return json({ error: 'too_large' }, 413);
      const newId = rndId();
      const editToken = rndToken();
      await store.setJSON(newId, body.project, { metadata: { title: cleanTitle(body.project), updated: Date.now(), editToken } });
      return json({ id: newId, editToken });
    }

    if (req.method === 'PUT') {
      if (!id) return json({ error: 'id_required' }, 400);
      const md = await store.getMetadata(id);
      if (!md) return json({ error: 'not_found' }, 404);
      const token = req.headers.get('x-edit-token');
      if (!token || token !== md.metadata.editToken) return json({ error: 'forbidden' }, 403);
      const body = await req.json().catch(() => null);
      if (!body || !body.project) return json({ error: 'bad_request' }, 400);
      if (JSON.stringify(body.project).length > MAX_BYTES) return json({ error: 'too_large' }, 413);
      await store.setJSON(id, body.project, { metadata: { title: cleanTitle(body.project), updated: Date.now(), editToken: md.metadata.editToken } });
      return json({ id, ok: true });
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    return json({ error: 'server_error', detail: String(e && e.message || e) }, 500);
  }
};
