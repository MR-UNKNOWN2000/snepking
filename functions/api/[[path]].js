// Pages Function for /api/*: owner login, logout, saving the gallery, uploading and deleting images.
import { handleApi } from '../../src/api.js';

export function onRequest({ request, env }) {
  const parts = new URL(request.url).pathname.slice(5).split('/').filter(Boolean);
  return handleApi(request, env, parts);
}
