# `@listwell/audit-engine`

Workers-friendly TypeScript modules for Listwell website and local SEO checks.

Check IDs match `content/checks/*.md` so reports stay comparable with the original Nuxt handlers. Upstream `drevantonder/visimate` is fork history only.

The Next.js OpenNext Worker imports this package and runs checks on the existing report routes. Do not stand up a parallel app.

```ts
import { runChecks } from "@listwell/audit-engine";

const results = await runChecks(business, undefined, {
  env: {
    googleApiKey: process.env.GOOGLE_API_KEY,
    googleProgrammableSearchEngineId: process.env.GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
  },
});
```

**Full Google Business Profile quality requires `GOOGLE_API_KEY`.** Fallback (Nominatim, pasted URLs, website markup, synthetic LCP) is degraded.

## Faster than NuxtHub/puppeteer

- Website HTML is fetched once per run and shared across checks.
- Plain `fetch` is used first. Cloudflare Browser Rendering (Workers binding, then REST `/content`) is only used when the page looks like a thin SPA.
- Listing checks call Google Places when a Place ID and API key exist. They fall back to website and pasted listing HTML only when Places is unavailable.
- `website-performance` uses CrUX then PageSpeed when a Google API key exists, otherwise a synthetic Browser Rendering LCP. It is marked `queued` so the Next Worker can finish it in the background.

## Next Worker routes

- `GET /api/businesses/:id/checks` — applicable checks; queues `website-performance`
- `GET /api/businesses/:id/checks/:checkId` — one check
- `GET /api/jobs/:id` — queued job status
