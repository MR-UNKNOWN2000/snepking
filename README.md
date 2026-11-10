# snepking.com

MR.UNKNOWN's art gallery and links, running as a Cloudflare Worker with static assets.
Workers Builds runs `npx wrangler deploy` on every push to `main`.

- `public/` is the website: `index.html` (page plus a built-in copy of the gallery data, used as the fallback),
  `art/` (the original 91 images: full-size files plus `_t` thumbnails), `favicon.svg`, `_headers`.
- `src/worker.js` routes `/api/*` and `/img/*` to the owner code and serves everything else from `public/`.
- `src/api.js`: owner login, logout, saving the gallery, uploading and deleting images.
- `src/img.js`: serves uploaded images.
- `wrangler.jsonc`: Worker config. The `SITE` KV namespace has no id on purpose: Wrangler creates it on the first
  deploy and reuses it afterwards.

## Owner login setup

One step in the Cloudflare dashboard: Workers & Pages > snepking > Settings > Variables and Secrets > Add,
type **Secret**, name `ADMIN_PASSWORD`, value = the owner's password. Then use "Owner log in" in the site footer.

Saved changes and uploads live in the `SITE` KV namespace; until the first save the site shows the copy built into
`public/index.html`. Each save keeps the previous version under `site:prev`.

## Local testing

`npx wrangler dev --var ADMIN_PASSWORD:some-test-password` serves the site with a local, simulated KV store.
