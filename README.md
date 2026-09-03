# Listwell

Local and website SEO auditor. Create an audit, run website and listing checks, then read a report with step-by-step fixes.

This repository is a MIT fork of [drevantonder/visimate](https://github.com/drevantonder/visimate).

## Stack

- Next.js App Router
- OpenNext on Cloudflare Workers
- Wrangler
- Bun
- Drizzle with SQLite / D1
- `@listwell/audit-engine` for the 32 website and listing checks

## Scripts

```bash
bun install
bun run catalog
bun run test
bun run typecheck
bun run dev
bun run build
bun run preview
```

`bun run preview` builds the Worker with OpenNext and serves it through Wrangler. `bun run deploy` deploys that Worker.

Create a D1 database named `listwell` and a KV namespace for audit jobs. Put those ids in `wrangler.jsonc` (placeholders are `0000…`). Discover persists the chosen listing through the Drizzle `businesses` and `business_locations` tables. The Worker path reads that row back, so a refresh does not lose it.

Apply `lib/db/migrations/0000.sql` to a local D1 (`bun run db:push`). LIST-8 deploy still applies this schema to the live database. Do not invent a Cloudflare account or database id in this repo.

Local `next dev` can run without D1 and keeps audits in memory for the process.

## Bindings and secrets

`wrangler.jsonc` declares real Workers bindings. Replace placeholder ids before deploy:

- `DB` — D1
- `AUDIT_KV` — queued check jobs (`00000000000000000000000000000000` until you create the namespace)
- `AUDIT_QUEUE` — producer for `listwell-audit` (optional; the Worker also finishes `website-performance` with `waitUntil`)
- `BROWSER` — Cloudflare Browser Rendering
- `AI` — Workers AI for the report executive brief. Missing binding falls back to a cited check summary.

Set secrets with `wrangler secret put` (see `.env.example`):

- `GOOGLE_API_KEY` — required for full Google Business Profile quality (official reviews, photos, Places category, claimed listing, Places autocomplete). Also used for Programmable Search, CrUX, and PageSpeed
- `GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID` — web-wide social and website discovery
- `APPLE_MAPKIT_TEAM_ID`, `APPLE_MAPKIT_KEY_ID`, `APPLE_MAPKIT_PRIVATE_KEY` — Apple Maps listing search
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Browser Rendering REST fallback)

**Full Google Business Profile quality requires `GOOGLE_API_KEY`.** Without it, create-audit and listing checks fall back to Nominatim, pasted URLs, website markup, and a synthetic browser LCP. That fallback is degraded: no official reviews, photo gallery, Places category, or claimed-listing facts.

The product never scrapes Google Maps HTML or bypasses bot walls.

## Create an audit

1. Type the business name.
2. Confirm or correct the suburb from browser geolocation.
3. Listwell resolves candidates with Google Places first (and Apple MapKit when configured). If those keys are missing or return nothing, it asks OpenStreetMap Nominatim.
4. If one match is strong, confirm or reject it. If several matches appear, pick one. If none are confident, add a website URL, optional listing URL, optional social URLs, and an address.

The product does not invent a business.

## What the engine does

All 32 `content/checks` IDs run in the Next Worker:

- Plain `fetch` first, shared HTML per run
- Browser Rendering only when the page looks like a thin SPA
- Google listing checks use Places details when a Place ID and `GOOGLE_API_KEY` exist
- Fallback listing facts from website schema.org / visible NAP and from HTML of listing URLs the user pasted
- If a listing URL cannot be fetched and Places is unavailable, that check is inconclusive
- `website-performance` uses CrUX then PageSpeed when `GOOGLE_API_KEY` is present, otherwise a synthetic Browser Rendering LCP

Presence checks for Facebook, Instagram, TikTok, LinkedIn, YouTube, and food delivery still test stored fields. Programmable Search can also discover social profiles when configured.
