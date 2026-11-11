// Pages Function for /icon: the browser tab icon. Points at the icon chosen in the owner's editor, or the default.
export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  let to = '/favicon.svg';
  try {
    const site = env.SITE && (await env.SITE.get('site', { type: 'json', cacheTtl: 60 }));
    const id = site && site.profile && site.profile.favicon && site.profile.favicon.id;
    if (typeof id === 'string' && /^[a-f0-9]{32}$/.test(id)) to = '/img/' + id;
  } catch {}
  return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'public, max-age=300' } });
}
