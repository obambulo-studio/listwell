# Listwell

Listwell audits local listings and websites for search engine optimisation (SEO). It is built for Australian small businesses and agencies. You create an audit, run the checks, then read a report with fix steps.

Obambulo Studio owns Listwell. The software is proprietary. It is not open source. See `LICENSE`.

## What Listwell does

You start on the home page with a chat. You type a business name. The app finds listings, a website, and social profiles. A free preview shows basic results. Paid plans use the display strings in `lib/polar.ts` (`REPORT_ONCE_PRICE`, `REPORT_MONTHLY_PRICE`, `REPORT_YEARLY_PRICE`): one-off full report (`report_once`), continued monthly reports per business (`report_monthly`), or yearly checkout with the same scan entitlement as monthly (`report_yearly`).

Sign-in uses a one-time code by email. There is no password. The `/account` page lists businesses for the signed-in user.

## Architecture

Convex stores users, businesses, entitlements, scans, and jobs. Better Auth on Convex handles sessions and email one-time codes.

Cloudflare Workers run the Next.js app through OpenNext. The Worker also runs the audit engine. Convex stores app data. The Worker does not.

Worker bindings:

- `AUDIT_KV` - queued check jobs, run state, and anonymous Discover audits when Convex is down
- `BROWSER` - Cloudflare Browser Rendering
- `AI` - Workers AI for report briefs, or cited check text if AI is off

The project does not use D1 or Drizzle. Discover does not need a D1 database. If you set `SKIP_OPENNEXT_DEV=1`, local `next dev` uses in-memory audit state.

Scheduled monthly scans use a **Convex cron** (`convex/crons.ts` → `internal.scans.runDue` hourly at `:00` UTC). Convex owns entitlement due dates (`nextScanAt` on active `report_monthly` rows). Each due job calls the Worker at `POST /api/internal/scans/run-one`, which runs Chromium checks and writes Convex `scans` history. Scan execution stays on the Worker because Browser Rendering does not run in Convex. There is no Cloudflare Worker cron for scans (avoid duplicating schedulers).

After a scheduled scan completes, the Worker may send a UseSend email (monthly summary or alert if the score drops or a listing breaks). Users can opt out via the link in the email (`/unsubscribe`, which posts to `/api/notifications/unsubscribe`; mail clients may one-click POST the API URL).

One-off buyers get **one free re-scan within 30 days** of purchase (`lib/scan-config.ts`: `ONCE_RESCAN_FREE_LIMIT`, `ONCE_RESCAN_WINDOW_DAYS`), enforced server-side at `POST /api/businesses/{id}/rescan`.

OpenNext config is `open-next.config.ts`.

## Stack

- Next.js App Router
- Convex and Better Auth (`@convex-dev/better-auth`)
- OpenNext on Cloudflare Workers
- Bun

- Polar for payments (Merchant of Record)
- UseSend for email one-time codes
- `@listwell/audit-engine` for the 32 website and listing checks
- Ultracite (Oxlint and Oxfmt) for lint and format

## Routes

- `/` - chat to start an audit
- `/discover` - listing lookup
- `/new` - confirm profiles

- `/{id}` - report
- `/sign-in` - email one-time code
- `/account` - businesses for the signed-in user

## Local development

1. Copy `.env.example` to `.env.local`.
2. Fill in the values. See Environment variables.
3. Start Convex. This links a dev deployment and writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_*`.

```bash
npx convex dev
```

Keep this process running while you work.

4. Open a second terminal.
5. Install packages. Then copy shared secrets to Convex. Then start the Next.js app.

```bash
bun install
bun run convex:sync-env
bun dev
```

`bun run convex:sync-env` copies shared secrets from `.env.local` to the Convex deployment.

Use `bun dev:localhost` if you want `http://localhost:3000` without Portless.

If you do audit work without remote Worker bindings, set `SKIP_OPENNEXT_DEV=1` in `.env.local`.

Do not run `npx convex deploy` during local work. Use `npx convex dev`. Use `bun run convex:deploy` only for production.

`wrangler.jsonc` is the OpenNext Worker config. Local `bun run build` still runs `next build`. In Workers CI (`WORKERS_CI=1`) it runs `opennextjs-cloudflare build`, then `npx wrangler deploy` uploads that Worker. Run `bun run cf:sync-build-env` to set the dashboard commands to `bun run cf:build` and `npx wrangler deploy --keep-vars`.

On the production branch, deploy with `npx opennextjs-cloudflare deploy -- --keep-vars`.

**Preview deployments:** Non-`main` Workers Builds triggers run `npx wrangler preview` after the OpenNext build (`bun run cf:sync-build-env` sets this on preview triggers). `wrangler.jsonc` must include a `previews` block with bindings for KV, R2, AI, Browser, Images, and Durable Objects. Preview Convex and secrets come from Workers Builds environment variables (`--keep-vars`). Production custom domain (`listwell.dev`) is unchanged; `preview_urls` stays `false` so previews do not share the live hostname. Each build gets a preview URL in the Workers Builds check on the pull request.

Run smoke against a preview host:

```bash
bun run smoke:discover https://<preview-url-from-workers-builds>
```

## Scripts

Development:

- `bun dev` - Next.js with Portless
- `bun dev:localhost` - Next.js on port 3000
- `bun run build` - Next.js production build locally; OpenNext package in Workers CI

- `bun run convex:dev` - Convex development
- `bun run convex:sync-env` - copy env from `.env.local` to Convex
- `bun run convex:deploy` - Convex production only

Quality:

- GitHub Actions runs `bun x ultracite check`, `bun run typecheck`, and `bun run test` on pull requests and `main`.
- `bun run catalog` - write `lib/checks/catalog.ts` from `content/checks`
- `bun run test` - Vitest for the app and the audit engine (use this instead of bare `bun test` at the repo root)
- `bun run typecheck` - TypeScript for the app and the audit engine
- `bun run check` - Ultracite, React Doctor, TypeScript, and knip
- `bun run fix` - Ultracite auto-fix

Deploy:

- `bun run preview` - OpenNext build and Wrangler preview
- `bun run deploy` - OpenNext build and Worker deploy
- `bun run upload` - OpenNext build and Worker version upload
- `bun run cf-typegen` - write `cloudflare-env.d.ts` from Wrangler
- `bun run smoke:discover` - prove Discover → save → checks on a live origin

## Environment variables

## Environment variables

Copy `.env.example` to `.env.local`. Do not commit secrets.

### Next.js (`.env.local`)

App and auth:

- `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` - from `npx convex dev`
- `NEXT_PUBLIC_SITE_URL`, `SITE_URL` - public app URL, for example `http://localhost:3000`
- `BETTER_AUTH_SECRET` - session signing (generate a long random string)
- `INTERNAL_API_SECRET` - shared secret for Next.js and Convex scan callbacks
- `SITE_PASSWORD` - optional Worker secret that enables the public site password gate (leave unset locally)

Lookups:

- `GOOGLE_API_KEY` - Google Places, Google Business Profile checks, Programmable Search, CrUX, PageSpeed
- `GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID` - web search for social and website discovery
- `APPLE_MAPKIT_TEAM_ID`, `APPLE_MAPKIT_KEY_ID`, `APPLE_MAPKIT_PRIVATE_KEY` - Apple Maps search
- `LISTWELL_BROWSER_RENDERING_ACCOUNT_ID`, `LISTWELL_BROWSER_RENDERING_API_TOKEN` - Browser Rendering REST
- `TYPESAFE_API_KEY` - optional TypeSafe Jev for listing disambiguation, social/website hit selection, and chat intake (chat and discover fall back without it)
- `TYPESAFE_MODEL` - optional, default `jev-latest`

Business names, suburbs, and URLs sent to Jev are processed by TypeSafe when this key is set. Do not enable it for flows that must stay fully on-prem unless your privacy policy covers that.

Payments and email:

- `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET` - Polar API and webhooks
- `POLAR_PRODUCT_REPORT_ONCE`, `POLAR_PRODUCT_REPORT_MONTHLY`, `POLAR_PRODUCT_REPORT_YEARLY` - Polar product IDs (create products in Polar at the amounts in `lib/polar.ts`; IDs are not hardcoded in the app). Yearly checkout is hidden when `POLAR_PRODUCT_REPORT_YEARLY` is unset.
- `POLAR_SERVER` - `sandbox` or `production`
- `USESEND_API_KEY`, `USESEND_FROM` - sign-in codes (Convex) and optional monthly scan emails (Worker; set as Worker secrets via `bun run cf:sync-secrets` / dashboard)
- `USESEND_BASE_URL` - optional, default `https://app.usesend.com`

Local:

- `SKIP_OPENNEXT_DEV` - `1` to skip remote Worker bindings in `next dev`

`USESEND_FROM` must use a domain that UseSend already verified.

Apple Maps keys, Browser Rendering REST, and Polar values are optional for local UI work. Without Polar, checkout does not complete. Without UseSend, sign-in emails do not send.

### Convex deployment

Set the same shared values on the Convex deployment (dev and production). If the project is not linked, run `npx convex dev` first.

```bash
bun run convex:sync-env
```

Or set values by hand:

```bash
npx convex env set SITE_URL http://localhost:3000
npx convex env set BETTER_AUTH_SECRET "<same value as .env.local>"
npx convex env set INTERNAL_API_SECRET "<same value as .env.local>"
npx convex env set USESEND_API_KEY "<your usesend api key>"
npx convex env set USESEND_FROM "Listwell <noreply@yourdomain.com>"
# optional:
# npx convex env set USESEND_BASE_URL https://app.usesend.com
```

`SITE_URL` must match the origin that users hit. Do not add a trailing slash. `INTERNAL_API_SECRET` must match the Next.js value. Scheduled scans call the Worker with this secret.

Production `SITE_URL` must be the live domain.

Polar keys stay on Next.js and the Worker. Do not copy Polar keys to Convex.

## Cloudflare Worker bindings and secrets

`wrangler.jsonc` is the production OpenNext config. It enables Workers logs, traces, smart placement, and Worker caching, and wires R2 incremental cache (`listwell-next-cache`), the OpenNext DO queue, `AUDIT_KV`, Browser Rendering, Workers AI, and Images.

Workers Builds needs Bun 1.4.2 for `lockfileVersion: 2`. Production `NEXT_PUBLIC_CONVEX_*` and `NEXT_PUBLIC_SITE_URL` are set in `next.config.ts` so `next build` can inline them without a local `.env`. The same values live in `wrangler.jsonc` `vars` for the Worker runtime. After `.env.local` is set, run:

- `bun run cf:sync-build-env` — sets `BUN_VERSION=1.4.2`, `NEXTJS_ENV=production`, public build variables, and the OpenNext build/deploy commands (needs `CLOUDFLARE_API_TOKEN` with Workers CI Write)
- `bun run cf:sync-env` — pushes runtime secrets from `.env.local`

Bindings:

- `AUDIT_KV` - KV namespace for audit jobs and early-access sign-ups (`site-interest:by-email:*`)
- `NEXT_INC_CACHE_R2_BUCKET` - OpenNext incremental cache (`listwell-next-cache`)
- `NEXT_CACHE_DO_QUEUE` - OpenNext ISR revalidation queue
- `BROWSER` - Cloudflare Browser Rendering
- `AI` - Workers AI
- `IMAGES` - Cloudflare Images for Next.js image optimisation

Set remaining Worker secrets with `wrangler secret put` or `bun run cf:sync-env`. See `.env.example`.

### Public site password gate

When `SITE_PASSWORD` is set on the Worker, visitors see an early-access landing page with:

- a password field (sets an HttpOnly cookie for 30 days on success), and
- a waitlist form (email required; name and a short business or website note optional).

If `SITE_PASSWORD` is unset, the gate is off (default for local development). Production should set it before launch:

```bash
npx wrangler secret put SITE_PASSWORD --config wrangler.jsonc
# or add SITE_PASSWORD to .env.local and run:
bun run cf:sync-env
```

Health checks, `robots.txt`, `sitemap.xml`, static assets, Better Auth (`/api/auth/*`), Polar webhooks, and the gate APIs stay reachable without the cookie.

Waitlist rows are stored in `AUDIT_KV` under `site-interest:by-email:<email>` (easy to migrate into Convex later).

Export sign-ups:

```bash
# JSON via authenticated API (uses INTERNAL_API_SECRET)
curl -sS -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  "https://listwell.dev/api/internal/site-interest" | jq .

# CSV download
curl -sS -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  "https://listwell.dev/api/internal/site-interest?format=csv" -o listwell-site-interest.csv

# Or read KV directly with Wrangler
bash scripts/export-site-interest.sh site-interest-export.json
```

- `GOOGLE_API_KEY` - required for full Google Business Profile quality
- `GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID` - social and website discovery
- `APPLE_MAPKIT_TEAM_ID`, `APPLE_MAPKIT_KEY_ID`, `APPLE_MAPKIT_PRIVATE_KEY`
- `LISTWELL_BROWSER_RENDERING_ACCOUNT_ID` and `LISTWELL_BROWSER_RENDERING_API_TOKEN`

You can use `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` instead of the `LISTWELL_BROWSER_RENDERING_*` pair for Browser Rendering REST.

Full Google Business Profile quality needs `GOOGLE_API_KEY`. That key gives official reviews, photos, Places category, claimed listing, and Places autocomplete.

Without the key, create-audit and listing checks use Nominatim, pasted URLs, website markup, and a synthetic browser LCP. That path does not give official reviews, a photo gallery, Places category, or claimed-listing facts.

The product does not scrape Google Maps HTML. It does not bypass bot walls.

## Polar payments

Polar is the merchant of record.

Plans (user-facing amounts come from `lib/polar.ts`):

- Full report with fix steps — `REPORT_ONCE_PRICE` once (`report_once`)
- Continued monthly reports — `REPORT_MONTHLY_PRICE` (`report_monthly`)
- Continued yearly reports — `REPORT_YEARLY_PRICE` (`report_yearly` checkout; grants the same entitlement as monthly for continued scans)

Create matching products in the Polar dashboard at those prices, then set `POLAR_PRODUCT_REPORT_ONCE`, `POLAR_PRODUCT_REPORT_MONTHLY`, and `POLAR_PRODUCT_REPORT_YEARLY` to those product IDs on the Worker.

Set the Polar webhook to `POST /api/webhook/polar` on your public site URL.

After checkout, Listwell emails a sign-in code so the buyer can open the report.

## Create an audit

1. Type the business name.
2. Confirm or correct the suburb from browser geolocation.
3. Listwell looks up candidates with Google Places first.
4. If Apple MapKit is configured, it also looks up Apple Maps.
5. If those keys are absent or return nothing, it asks OpenStreetMap Nominatim.

6. If one match is strong, confirm or reject it.
7. If several matches appear, pick one.
8. If no match is confident, add a website URL, optional listing URL, optional social URLs, and an address.

The product does not invent a business.

## What the engine does

All 32 check IDs in `content/checks` run in the Next.js Worker.

- The Worker fetches website HTML once per run and shares it across checks.
- It uses plain `fetch` first.
- It uses Browser Rendering only when the page looks like a thin single-page app (SPA).
- Google listing checks use Places details when a Place ID and `GOOGLE_API_KEY` exist.

- If Places is unavailable, listing facts come from website schema.org and visible name-address-phone (NAP).
- Listing facts also come from HTML of listing URLs the user pasted.
- If fetch of a listing URL fails and Places is unavailable, that check is inconclusive.
- `website-performance` uses Chrome User Experience Report (CrUX) then PageSpeed when `GOOGLE_API_KEY` is present.
- If that key is absent, it uses a synthetic Browser Rendering Largest Contentful Paint (LCP).

Presence checks for Facebook, Instagram, TikTok, LinkedIn, YouTube, and food delivery test stored fields. Programmable Search can also find social profiles when configured.

After you edit `content/checks`, run `bun run catalog` so `lib/checks/catalog.ts` stays in sync.

## Production deploy

1. Set production env on Convex and on the Worker.
2. Put the live domain in `SITE_URL` with no trailing slash.
3. Bind `AUDIT_KV` and `listwell-next-cache` on the same Cloudflare account as the `listwell` Worker.
4. Point Polar webhooks at `https://your-domain/api/webhook/polar`.
5. Run `bun run convex:deploy`.
6. Run `bun run deploy`.

The apex Worker on `https://listwell.dev` is production. `https://www.listwell.dev` 301s to the apex with the same path and query through the shared `www-to-apex` Worker (`0b0a8688c79a480c819d1604056d9bdf`). Do not add `www.listwell.dev` as a Listwell custom domain. `wrangler deploy` then fights that Worker and Workers Builds fails.

`wrangler.jsonc` binds only `listwell.dev`. `middleware.ts` still 301s www if a request ever reaches this Worker.

Do not invent D1 ids or Google/Apple keys. This agent cannot bind hostnames (no Wrangler login). Discover does not use D1. Anonymous audits persist in `AUDIT_KV` when Convex is down. Accounts, sign-in, and paid unlock still need Convex.

## Prove Discover on production

After merge, use the **preview deployment URL** from the pull request Workers Builds check while the branch is open. After a production Workers Builds deploy on `main`:

```bash
bun run smoke:discover https://listwell.dev
```

Or by hand:

1. `GET https://listwell.dev/api/health` — `ok` is true, `storage.d1` is false, `storage.auditKv` is true, `lookups.osm` is true. `convex` is `ok` after Convex production is redeployed.
2. Open https://listwell.dev. Enter `Blackstar Coffee` and suburb `Brisbane`. Continue.
3. Confirm an OpenStreetMap listing. Land on a report URL `/{id}`.
4. `GET /api/businesses/{id}` returns the cafe. `GET /api/businesses/{id}/checks` returns check results.

Google/Apple keys are optional for this OSM path. Full Google Business Profile quality still needs `GOOGLE_API_KEY`.

### Zacchary-only

Production Convex is `fine-elephant-894` (`https://fine-elephant-894.ap-southeast-2.convex.cloud`). `SITE_URL` on that deployment must be `https://listwell.dev` with no trailing slash. Auth returns 500 until that variable is set. The previous deployment `hallowed-mallard-135` no longer serves queries or auth routes.

Confirm `AUDIT_KV` stays bound on the `listwell` Worker (live id already in `wrangler.jsonc`). Do not create D1. Do not add `www.listwell.dev` as a Listwell custom domain.

On Convex production `fine-elephant-894`, set env (no trailing slash on `SITE_URL`):

```bash
npx convex env set SITE_URL https://listwell.dev --prod
npx convex env set BETTER_AUTH_SECRET "<same value as the Worker / .env.local>" --prod
npx convex env set INTERNAL_API_SECRET "<same value as the Worker>" --prod
npx convex env set USESEND_API_KEY "<usesend api key>" --prod
npx convex env set USESEND_FROM "Listwell <noreply@your-verified-domain>" --prod
# optional:
# npx convex env set USESEND_BASE_URL https://app.usesend.com --prod
```

`INTERNAL_API_SECRET` must also be a Worker secret (`bun run cf:sync-env`).

From a machine linked to the Listwell Convex project, deploy functions, schema, the Better Auth component, and HTTP actions to production:

```bash
bun run convex:deploy
```

This targets prod `fine-elephant-894`. Do not run `npx convex deploy` from local feature work except this production restore.

Optional Worker secrets: `GOOGLE_API_KEY`, `GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID`, Apple MapKit keys, Browser Rendering `LISTWELL_*`.

Verify:

```bash
curl -sS -X POST https://fine-elephant-894.ap-southeast-2.convex.cloud/api/query \
  -H 'content-type: application/json' \
  -d '{"path":"businesses:getByExternalId","args":{"externalId":"health-probe"},"format":"json"}'
# expect {"status":"success","value":null}

curl -fsS https://listwell.dev/api/health
# expect convex:"ok"

curl -sS https://fine-elephant-894.ap-southeast-2.convex.site/api/auth/ok
# must not say "HTTP actions are not enabled"
```
