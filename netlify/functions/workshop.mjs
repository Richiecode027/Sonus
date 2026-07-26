/* ============================================================================
 * Sonus · netlify/functions/workshop.mjs
 * Workshop compartido: UNA sola lista de progresiones, visible y editable por
 * cualquiera que entre a la página (pensado para una sola banda, no para
 * sesiones ni enlaces separados). Sin login, sin tokens.
 * Sin "preflight" CORS: GET lee, POST con acción en el cuerpo (sin cabeceras
 * personalizadas) para añadir/renombrar/reordenar/borrar.
 *   GET  /api/workshop  → { items, updated }
 *   POST { action:'add', item }              → { items, updated }
 *   POST { action:'update', id, patch }      → { items, updated }
 *   POST { action:'delete', id }             → { items, updated }
 *   POST { action:'reorder', order:[ids] }   → { items, updated }
 * ==========================================================================*/

import { getStore } from '@netlify/blobs';

const CORS = { 'access-control-allow-origin': '*' };
const MAX_BYTES = 500 * 1024;
const KEY = 'items';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

const rndId = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function readItems(store) {
  const items = await store.get(KEY, { type: 'json' });
  return Array.isArray(items) ? items : [];
}

async function writeItems(store, items) {
  if (JSON.stringify(items).length > MAX_BYTES) throw Object.assign(new Error('too_large'), { code: 413 });
  const updated = Date.now();
  await store.setJSON(KEY, items, { metadata: { updated } });
  return updated;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

  const store = getStore({ name: 'sonus-workshop-v1', consistency: 'strong' });

  try {
    if (req.method === 'GET') {
      const meta = await store.getMetadata(KEY);
      const items = await readItems(store);
      return json({ items, updated: (meta && meta.metadata && meta.metadata.updated) || 0 });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (!body || !body.action) return json({ error: 'bad_request' }, 400);

      const items = await readItems(store);

      if (body.action === 'add') {
        if (!body.item) return json({ error: 'bad_request' }, 400);
        const item = { ...body.item, id: rndId(), createdAt: Date.now() };
        items.push(item);
        const updated = await writeItems(store, items);
        return json({ items, updated, id: item.id });
      }

      if (body.action === 'update') {
        if (!body.id) return json({ error: 'id_required' }, 400);
        const i = items.findIndex((x) => x.id === body.id);
        if (i < 0) return json({ error: 'not_found' }, 404);
        items[i] = { ...items[i], ...(body.patch || {}) };
        const updated = await writeItems(store, items);
        return json({ items, updated });
      }

      if (body.action === 'delete') {
        if (!body.id) return json({ error: 'id_required' }, 400);
        const next = items.filter((x) => x.id !== body.id);
        const updated = await writeItems(store, next);
        return json({ items: next, updated });
      }

      if (body.action === 'reorder') {
        if (!Array.isArray(body.order)) return json({ error: 'bad_request' }, 400);
        const byId = new Map(items.map((x) => [x.id, x]));
        const next = body.order.map((id) => byId.get(id)).filter(Boolean);
        items.forEach((it) => { if (!body.order.includes(it.id)) next.push(it); }); // no perder items no listados
        const updated = await writeItems(store, next);
        return json({ items: next, updated });
      }

      return json({ error: 'unknown_action' }, 400);
    }

    return json({ error: 'method_not_allowed' }, 405);
  } catch (e) {
    return json({ error: 'server_error', detail: String((e && e.message) || e) }, e && e.code === 413 ? 413 : 500);
  }
};
