# snepking.com

MR.UNKNOWN's art gallery and links, running on Cloudflare Pages with Pages Functions.
Pages rebuilds the site on every push to `main` (no build command; output directory `public`).

- `public/` is the website: `index.html` (page plus a built-in copy of the gallery data, used as the fallback),
  `art/` (the original 91 images: full-size files plus `_t` thumbnails), `favicon.svg`, `_headers`.
- `functions/api/[[path]].js` and `functions/img/[id].js` hand `/api/*` and `/img/*` to the code in `src/`.
- `src/api.js`: owner login, logout, saving the gallery, uploading and deleting images.
- `src/img.js`: serves uploaded images.

## Pages project settings

`wrangler.toml` sets the output folder (`public`) and the `SITE` binding to the `snepking-site` KV namespace, so those
can't be edited in the dashboard. The one dashboard setting is the owner password:
Settings > Variables and Secrets (Production): type **Secret**, name `ADMIN_PASSWORD`, value = the owner's password.
Secret changes only reach the site after a new deployment (Deployments > latest > Retry deployment).

Saved changes and uploads live in the `SITE` KV namespace; until the first save the site shows the copy built into
`public/index.html`. Each save keeps the previous version under `site:prev`.

## Local testing

`npx wrangler pages dev public --kv SITE --binding ADMIN_PASSWORD=some-test-password` serves the site with a local,
simulated KV store.
