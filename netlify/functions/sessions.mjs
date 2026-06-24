/* ============================================================================
 * Sonus · netlify/functions/sessions.mjs
 * API de sesiones de composición en la nube (Netlify Blobs).
 * Espacio colaborativo tipo "documento compartido": cualquiera con el enlace
 * (el id) puede VER y EDITAR la misma sesión. Pensada para una banda.
 * Sin "preflight" CORS: solo GET (leer) y POST con cuerpo de texto (acción).
 *   GET  /api/sessions          → lista de sesiones recientes
 *   GET  /api/sessions?id=ID    → una sesión { id, project, updated }
 *   POST body:{ action:'create', project }              → { id }
 *   POST body:{ action:'update', id, project }          → { ok, updated }
 *   POST body:{ action:'delete', id }                   → { ok }
 * ==========================================================================*/

import { getStore } from '@netlify/blobs';

const CORS = { 'access-control-allow-origin': '*' };
const MAX_BYTES = 400 * 1024;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

const rndId = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
const cleanTitle = (p) => String((p && p.name) || 'Sin título').slice(0, 80);
const tooBig = (p) => JSON.stringify(p).length > MAX_BYTES;

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

  const store = getStore({ name: 'sonus-songs-v1', consistency: 'strong' });
  const url = new URL(req.url);

  try {
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const res = await store.getWithMetadata(id, { type: 'json' });
        if (!res) return json({ error: 'not_found' }, 404);
        return json({ id, project: res.data, updated: (res.metadata && res.metadata.updated) || 0 });
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
      if (!body || !body.action) return json({ error: 'bad_request' }, 400);

      if (body.action === 'delete') {
        if (!body.id) return json({ error: 'id_required' }, 400);
        await store.delete(body.id);
        return json({ ok: true });
      }

      if (body.action === 'create' || body.action === 'update') {
        if (!body.project) return json({ error: 'bad_request' }, 400);
        if (tooBig(body.project)) return json({ error: 'too_large' }, 413);
        const id = body.action === 'create' ? rndId() : body.id;
        if (!id) return json({ error: 'id_required' }, 400);
        const updated = Date.now();
        await store.setJSON(id, body.project, { metadata: { title: cleanTitle(body.project), updated } });
        return json({ id, ok: true, updated });
      }

      return json({ error: 'unknown_action' }, 400);
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    return json({ error: 'server_error', detail: String((e && e.message) || e) }, 500);
  }
};
