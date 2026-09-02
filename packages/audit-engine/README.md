# `@listwell/audit-engine`

Workers-friendly TypeScript modules for Listwell website and local SEO checks.

Check IDs match `content/checks/*.md` so reports stay comparable with the original Nuxt handlers. Upstream `drevantonder/visimate` is fork history only.

The Next.js OpenNext Worker imports this package and runs checks on the existing report routes. Do not stand up a parallel app.

```ts
import { runChecks } from "@listwell/audit-engine";

const results = await runChecks(business, undefined, {
  env: {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
  },
});
```

Google, Apple, CrUX, and PageSpeed keys are not used.

## Faster than NuxtHub/puppeteer

- Website HTML is fetched once per run and shared across checks.
- Plain `fetch` is used first. Cloudflare Browser Rendering (Workers binding, then REST `/content`) is only used when the page looks like a thin SPA.
- Listing checks read website and pasted listing HTML. They do not call Places.
- `website-performance` is a synthetic Browser Rendering LCP. It is marked `queued` so the Next Worker can finish it in the background.

## Next Worker routes

- `GET /api/businesses/:id/checks` — applicable checks; queues `website-performance`
- `GET /api/businesses/:id/checks/:checkId` — one check
- `GET /api/jobs/:id` — queued job status
