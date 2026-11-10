# snepking.com

MR.UNKNOWN's art gallery and links. Static site served by Cloudflare Pages, with a small owner login.

- `index.html` holds the page and a built-in copy of the gallery data (the fallback).
- `art/` holds the original 91 images: full-size files plus `_t` thumbnails.
- `functions/` holds the Cloudflare Pages Functions for the owner login:
  - `functions/api/[[path]].js`: login, logout, saving the gallery, uploading and deleting images.
  - `functions/img/[id].js`: serves uploaded images.

No build step: Cloudflare Pages serves this folder as-is (build command empty, output directory `/`).

## Owner login setup (Cloudflare dashboard, Pages project `snepking`)

1. Create a KV namespace (Storage & Databases > KV), e.g. `snepking-site`.
2. Project Settings > Bindings > add a KV namespace binding: variable name `SITE`, the namespace above.
3. Project Settings > Variables and Secrets > add a Secret named `ADMIN_PASSWORD`.
4. Redeploy (Deployments > retry the latest one) so the new settings apply.

Then use "Owner log in" in the site footer. Saved changes and uploads live in KV; until the first save
the site shows the copy built into `index.html`. Each save keeps the previous version under `site:prev`.
