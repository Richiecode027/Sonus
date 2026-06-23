/* ============================================================================
 * Sonus · netlify/functions/sessions.mjs
 * API de sesiones de composición en la nube (Netlify Blobs).
 * Diseñada sin "preflight" CORS: solo GET (lecturas) y POST con cuerpo de
 * texto plano (acción + datos), para funcionar igual mismo-origen o no.
 *   GET  /api/sessions          → lista de sesiones recientes (galería)
 *   GET  /api/sessions?id=ID    → una sesión
 *   POST /api/sessions  body:{ action:'create', project }            → { id, editToken }
 *               body:{ action:'update', id, editToken, project }     → { ok }
 *               body:{ action:'delete', id, editToken }              → { ok }
 * El editToken se guarda en metadatos del servidor y nunca se devuelve en
 * lecturas: cualquiera puede ver/abrir, solo quien tiene el token edita/borra.
 * ==========================================================================*/

import { getStore } from '@netlify/blobs';

const CORS = { 'access-control-allow-origin': '*' };
const MAX_BYTES = 300 * 1024;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

const rndId = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
const rndToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
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
        const project = await store.get(id, { type: 'json' });
        return project ? json({ id, project }) : json({ error: 'not_found' }, 404);
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

      if (body.action === 'create') {
        if (!body.project) return json({ error: 'bad_request' }, 400);
        if (tooBig(body.project)) return json({ error: 'too_large' }, 413);
        const id = rndId();
        const editToken = rndToken();
        await store.setJSON(id, body.project, { metadata: { title: cleanTitle(body.project), updated: Date.now(), editToken } });
        return json({ id, editToken });
      }

      if (body.action === 'update' || body.action === 'delete') {
        if (!body.id) return json({ error: 'id_required' }, 400);
        const md = await store.getMetadata(body.id);
        if (!md) return json({ error: 'not_found' }, 404);
        if (!body.editToken || body.editToken !== md.metadata.editToken) return json({ error: 'forbidden' }, 403);
        if (body.action === 'delete') { await store.delete(body.id); return json({ ok: true }); }
        if (!body.project) return json({ error: 'bad_request' }, 400);
        if (tooBig(body.project)) return json({ error: 'too_large' }, 413);
        await store.setJSON(body.id, body.project, { metadata: { title: cleanTitle(body.project), updated: Date.now(), editToken: md.metadata.editToken } });
        return json({ id: body.id, ok: true });
      }

      return json({ error: 'unknown_action' }, 400);
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    return json({ error: 'server_error', detail: String((e && e.message) || e) }, 500);
  }
};
