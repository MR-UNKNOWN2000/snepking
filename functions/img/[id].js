// Serves images uploaded through the owner login (stored in the SITE KV namespace).
// Images never change once uploaded (a new upload gets a new id), so browsers keep them for a year.
// The copy kept in Cloudflare's edge cache expires after a day, so a deleted image disappears within a day
// everywhere (and immediately at the location that handled the delete).
export async function onRequestGet(context) {
  const { request, env, params } = context;
  const id = String(params.id || '');
  if (!/^[a-f0-9]{32}$/.test(id) || !env.SITE) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;

  const { value, metadata } = await env.SITE.getWithMetadata('img:' + id, { type: 'arrayBuffer' });
  if (!value) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const type = (metadata && metadata.type) || 'application/octet-stream';
  const edgeCopy = new Response(value, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
  context.waitUntil(cache.put(request, edgeCopy));
  return new Response(value, {
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
}
