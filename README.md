# Listwell

Listwell is a local and website SEO auditor. Create an audit. Then run the website checks and the listing checks. Then read the report. The report gives step-by-step fixes.

This project uses the MIT license.

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

`bun run preview` builds the Worker with OpenNext. Then Wrangler serves the Worker.

`bun run deploy` deploys that Worker.

## Database and storage

1. Create a D1 database named `listwell`.
2. Create a KV namespace for audit jobs.
3. Put those ids in `wrangler.jsonc`. The file uses `0000…` as placeholders.
4. Apply `lib/db/migrations/0000.sql`.

If you use local `next dev` without D1, the process stores audits in memory.

## Bindings and secrets

`wrangler.jsonc` declares the Workers bindings. Replace the placeholder ids before you deploy:

- `DB` — D1
- `AUDIT_KV` — queued check jobs. Use `00000000000000000000000000000000` until you create the namespace.
- `AUDIT_QUEUE` — producer for `listwell-audit`. This binding is optional. The Worker also finishes `website-performance` with `waitUntil`.
- `BROWSER` — Cloudflare Browser Rendering
- `AI` — Workers AI for the report executive brief. If this binding is missing, the Worker uses a cited check summary.

Set secrets with `wrangler secret put`. See `.env.example`:

- `GOOGLE_API_KEY`
- `GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID`
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for Browser Rendering REST when the binding is missing
- `APPLE_MAPKIT_TEAM_ID`, `APPLE_MAPKIT_KEY_ID`, and `APPLE_MAPKIT_PRIVATE_KEY` for Apple Maps search on create-audit

## What the engine does

The Next Worker runs all 32 check IDs in `content/checks`:

- Plain `fetch` first. Each run shares HTML.
- Browser Rendering only when the page looks like a thin SPA.
- Google Business Profile field checks through the Places API.
- `website-performance` is queued (CrUX, then PageSpeed).

Presence checks for Facebook, Instagram, TikTok, LinkedIn, YouTube, and food delivery still test stored fields. This matches the original handlers.
