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

Create a D1 database named `listwell` and a KV namespace for audit jobs. Put those ids in `wrangler.jsonc` (placeholders are `0000…`), then apply `lib/db/migrations/0000.sql`.

Local `next dev` can run without D1 and keeps audits in memory for the process.

## Bindings and secrets

`wrangler.jsonc` declares real Workers bindings. Replace placeholder ids before deploy:

- `DB` — D1
- `AUDIT_KV` — queued check jobs (`00000000000000000000000000000000` until you create the namespace)
- `AUDIT_QUEUE` — producer for `listwell-audit` (optional; the Worker also finishes `website-performance` with `waitUntil`)
- `BROWSER` — Cloudflare Browser Rendering
- `AI` — Workers AI for the report executive brief. Missing binding falls back to a cited check summary.

Set secrets with `wrangler secret put` (see `.env.example`):

- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Browser Rendering REST fallback)

Google Places, Programmable Search, CrUX, PageSpeed, and Apple MapKit keys are not required. The product ignores those secrets if they are still present.

## Create an audit

1. Type the business name.
2. Confirm or correct the suburb from browser geolocation.
3. Listwell asks OpenStreetMap Nominatim for nearby matches. It identifies the app and rate-limits requests.
4. If one match is strong, confirm or reject it. If several matches appear, pick one. If none are confident, add a website URL, optional listing URL, optional social URLs, and an address.

The product does not invent a business. It does not search Google Maps or Apple Maps.

## What the engine does

All 32 `content/checks` IDs run in the Next Worker:

- Plain `fetch` first, shared HTML per run
- Browser Rendering only when the page looks like a thin SPA
- Listing facts from website schema.org / visible NAP and from HTML of listing URLs the user pasted
- If a listing URL cannot be fetched, that check is inconclusive
- `website-performance` queued as a synthetic Browser Rendering LCP, not CrUX or PageSpeed

Presence checks for Facebook, Instagram, TikTok, LinkedIn, YouTube, and food delivery still test stored fields.
