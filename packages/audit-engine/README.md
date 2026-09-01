# `@listwell/audit-engine`

Workers-friendly TypeScript modules for Listwell website and local SEO checks.

Check IDs and pass/fail behaviour stay aligned with the original Nuxt handlers in `server/api/businesses/[id]/checks/*` so reports stay comparable. Upstream `drevantonder/visimate` is fork history only.

Next.js (or any Worker) should import this package rather than re-implementing checks:

```ts
import { runChecks, checksForCategory, searchSocial } from '@listwell/audit-engine'

const results = await runChecks(business, undefined, {
  env: {
    googleApiKey: process.env.GOOGLE_API_KEY,
    googleProgrammableSearchEngineId: process.env.GOOGLE_CSE_ID,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
  },
})
```

## Faster than NuxtHub/puppeteer

- Website HTML is fetched once per run and shared across checks.
- Plain `fetch` is used first. Cloudflare Browser Rendering REST `/content` is only used when the page looks like a thin SPA.
- `website-performance` (CrUX, then PageSpeed) is marked `queued` so the Worker can put it on a Queue.

## HTTP Worker

`workers/audit` exposes:

- `POST /v1/checks` — run applicable checks; queues long jobs when a Queue binding exists
- `GET /v1/jobs/:id` — queued job status
- `GET /v1/lookups/google/places|search`
- `GET /v1/lookups/apple/search|places/:id`
- `GET /v1/lookups/social/{facebook,instagram,tiktok,linkedin,youtube,x}`
