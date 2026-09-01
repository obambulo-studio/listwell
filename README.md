# Listwell

Local and website SEO auditor. Create an audit, run website and listing checks, then read a report with step-by-step fixes.

This repository is a MIT fork of [drevantonder/visimate](https://github.com/drevantonder/visimate).

## Stack

- Next.js App Router
- OpenNext on Cloudflare Workers
- Wrangler
- Bun
- Drizzle with SQLite / D1

## Scripts

```bash
bun install
bun run catalog
bun run dev
bun run build
bun run preview
```

`bun run preview` builds the Worker with OpenNext and serves it through Wrangler. `bun run deploy` deploys that Worker. Create a D1 database named `listwell`, put its id in `wrangler.jsonc`, then apply `lib/db/migrations/0000.sql`.

Local `next dev` can run without D1 and keeps audits in memory for the process.

## What is ported

Homepage, discover, new audit, edit listings, and the report. Website checks that can run with `fetch` (title, meta, robots, sitemap, canonical, Open Graph, tel links, address, hours, JSON-LD, HTTPS, HTTP status) plus presence checks for stored Google, social, and food-delivery listings.

## Still to port

Browser-only checks (performance, mobile viewport) and Google Business Profile field checks that need the Places API (reviews, photos, phone, hours, category, NAP match). Discovery of Apple Maps and social suggestions is also still outstanding; you can add those listings by hand on the new-audit screen.
