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

- `GOOGLE_API_KEY`
- `GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID`
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Browser Rendering REST fallback)
- `APPLE_MAPKIT_TEAM_ID`, `APPLE_MAPKIT_KEY_ID`, and `APPLE_MAPKIT_PRIVATE_KEY` for Apple Maps search on create-audit

## What the engine does

All 32 `content/checks` IDs run in the Next Worker:

- Plain `fetch` first, shared HTML per run
- Browser Rendering only when the page looks like a thin SPA
- Google Business Profile field checks via Places API
- `website-performance` queued (CrUX, then PageSpeed)

Presence checks for Facebook, Instagram, TikTok, LinkedIn, YouTube, and food delivery still test stored fields, same as the original handlers.
