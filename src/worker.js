// snepking.com Worker: static files from ./public, plus the owner API and uploaded images.
import { handleApi } from './api.js';
import { handleImg } from './img.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url.pathname.slice(5).split('/').filter(Boolean));
    }
    if (url.pathname.startsWith('/img/')) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
      return handleImg(request, env, ctx, url.pathname.slice(5));
    }
    return env.ASSETS.fetch(request);
  },
};
