# Listwell product design

Listwell is a chat-first local and website SEO audit. This document describes how the **shipped app** should look and read. For report-page composition and evidence-led layouts, still follow `docs/DESIGN.md` (Vercel report skill), but apply the rules below for product chrome and copy—not Vercel marketing or product UI.

## Brand and naming

- Product name is **Listwell** everywhere user-facing (titles, metadata, chat, emails).
- Do not use Visimate in UI, copy, or metadata.
- Do not show the Vercel wordmark or triangle on Listwell surfaces.

## Typography

- **Geist Sans** for UI and report body (`--font-geist-sans` from `next/font/google` in `app/layout.tsx`).
- **Geist Mono** for codes, IDs, and technical values (`--font-geist-mono`).
- Prefer sentence case for headings, buttons, and labels (e.g. “Sign in”, not “Sign In”).

## Layout and shell

- One continuous canvas: `AppShell` → `Shell` with `listwell-chat-shell` on `body`.
- Home (`/`) uses a non-scrollable main region; other routes use `listwell-chat-shell__main--page` for page scroll.
- Skip link: “Skip to content” → `#main`.
- Account and page controls live in the shell header (`AccountControl`, `PageControls`), not duplicated per page.

## Language and locale

- Document language: `en-AU` on `<html>`.
- Use Australian English in user-facing copy where it differs from US English (e.g. “organise” in long-form help if you add it; keep API field names stable).
- Plain, direct sentences. Avoid hype and false certainty—match the evidence-led tone in reports.

## Colour and theme

- Semantic tokens via Beautifui foundation (`app/beautifui/foundation.css`) and `app/globals.css` (`bg-page`, `text-ink`, etc.).
- Respect light/dark via `ThemeBootstrapScript` in the root layout.
- Do not introduce a parallel Tailwind-only theme that fights the foundation tokens.

## Key surfaces

| Route | Design intent |
| --- | --- |
| `/` | Chat-led onboarding; primary action is describing a business |
| `/discover` | Lookup results; clear next step to confirm profiles |
| `/new` | Confirm category, locations, and channel URLs |
| `/[id]` | Report: score, checks, upgrade path; evidence before sales copy |
| `/sign-in` | Email OTP only; calm error states |
| `/account` | Owned reports, plan (preview / once / monthly), last scan |

## Reports and paywall

- Free preview shows basic check outcomes; full report and fix steps require entitlement.
- Upgrade copy should be factual (what unlocks), not urgency-driven.
- Suggested CTA: “Unlock the full report with fix steps.”

## When editing UI

1. Reuse primitives under `components/primitives/` and existing patterns in `components/report-client.tsx`, `listwell-chat.tsx`, etc.
2. Prefer extending existing files over new one-off components.
3. Run `bun x ultracite fix` before commit.

## Related docs

- `docs/DESIGN.md` — report authoring and evidence layout (Vercel skill; adapt authorship to Listwell).
- `README.md` — routes, stack, and environment.
