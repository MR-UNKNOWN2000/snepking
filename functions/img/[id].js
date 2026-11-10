// Pages Function for /img/<id>: serves images uploaded through the owner login.
import { handleImg } from '../../src/img.js';

export function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  return handleImg(request, env, context, params.id);
}
