# Listwell audit worker

Cloudflare Worker that runs `@listwell/audit-engine`.

- Browser Rendering REST `/content` for SPA HTML (faster than launching puppeteer).
- Queue `listwell-audit` for `website-performance` (PageSpeed).
- KV `AUDIT_KV` for job status.

Replace the placeholder KV namespace IDs in `wrangler.toml` before deploy.

Required secrets:

- `GOOGLE_API_KEY`
- `GOOGLE_PROGRAMMABLE_SEARCH_ENGINE_ID`
- `APPLE_MAPKIT_TEAM_ID`
- `APPLE_MAPKIT_KEY_ID`
- `APPLE_MAPKIT_PRIVATE_KEY`
- `CLOUDFLARE_ACCOUNT_ID` (Browser Rendering REST)
- `CLOUDFLARE_API_TOKEN` (Browser Rendering REST)
