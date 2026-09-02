# Listwell

Listwell is a local and website SEO auditor.

You create an audit. Listwell runs website checks and listing checks. Then you read a report. The report gives step-by-step fixes.

This repository is a MIT fork of [drevantonder/visimate](https://github.com/drevantonder/visimate).

## Stack

The application uses these tools:

- Next.js App Router
- OpenNext on Cloudflare Workers
- Wrangler
- Bun
- Drizzle with SQLite / D1
- `@listwell/audit-engine` for the 32 website and listing checks

## Scripts

Install the packages. Then generate the check catalog. Then run the tests:

```bash
bun install
bun run catalog
bun run test
bun run typecheck
bun run dev
```

`bun run dev` starts the local Next.js server.

Use these commands for a Worker build:

```bash
bun run build
bun run preview
```

`bun run preview` builds the Worker with OpenNext. Then Wrangler serves the Worker.

`bun run deploy` deploys that Worker.

## Database and storage

Create a D1 database. Use the name `listwell`.

Create a KV namespace for audit jobs.

Put the ids in `wrangler.jsonc`. The file has placeholder ids (`0000…`).

Then apply `lib/db/migrations/0000.sql`.

Local `next dev` can run without D1. In that case, the process keeps audits in memory.

## Bindings and secrets

`wrangler.jsonc` declares the Workers bindings.

Before you deploy, replace the placeholder ids.

Bindings:

- `DB` — D1
- `AUDIT_KV` — queued check jobs. The id is `00000000000000000000000000000000` until you create the namespace.
- `AUDIT_QUEUE` — producer for the `listwell-audit` queue. This binding is optional. The Worker can also finish `website-performance` with `waitUntil`.
- `BROWSER` — Cloudflare Browser Rendering
- `AI` — Workers AI for the report executive brief. If the binding is missing, Listwell uses a cited check summary.

Set secrets with `wrangler secret put`. See `.env.example`.

Secrets:

- `GOOGLE_API_KEY`
- `GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID`
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Browser Rendering REST fallback)
- `APPLE_MAPKIT_TEAM_ID`, `APPLE_MAPKIT_KEY_ID`, and `APPLE_MAPKIT_PRIVATE_KEY` (Apple Maps search when you create an audit)

## What the engine does

The Next Worker runs all 32 check IDs in `content/checks`.

- The Worker uses plain `fetch` first. The Worker shares the HTML for one run.
- The Worker uses Browser Rendering only when the page looks like a thin SPA.
- The Worker checks Google Business Profile fields with the Places API.
- The Worker queues `website-performance` (CrUX, then PageSpeed).

Presence checks for Facebook, Instagram, TikTok, LinkedIn, YouTube, and food delivery still test stored fields. This is the same behaviour as the original handlers.
