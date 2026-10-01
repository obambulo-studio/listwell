---
channelCategory: Website
points:
  food: 2
  retail: 2
  services: 3
  other: 2
---

# AI visibility

People ask ChatGPT, Perplexity, and Claude for a local plumber, café, or shop. This check looks at whether those answer engines are allowed to read your homepage.

::tech-detail{summary="What we check for AI visibility"} We read `robots.txt` and the homepage. The check passes when ChatGPT search (`OAI-SearchBot`, `ChatGPT-User`), Perplexity (`PerplexityBot`), and Claude search (`Claude-SearchBot`, `Claude-User`) can fetch the homepage, and when the site has not opted out of AI answers.

An opt-out is a `Content-Signal` of `ai-input=no`, or `noai` in a homepage `meta name="robots"` tag or `X-Robots-Tag` header. Blocking a training crawler such as `GPTBot` or `Google-Extended` does not fail this check. A missing `robots.txt` counts as allowed. A published `/llms.txt` file is noted on a pass. It is not required. ::

## What we're checking

We verify that AI answer engines can read your homepage and use it when someone asks for a business like yours.

::impact{type="customers" severity="medium"} If those crawlers are blocked, your site is left out of the answers people get when they ask an assistant for a local business. ::

## Problems This Check Identifies

### Missing from AI answers

Customers who ask ChatGPT, Perplexity, or Claude for a nearby business never see a page those tools were told not to read.

### Accidental lockout

A blanket `Disallow: /`, or a copied robots file that blocks every AI user-agent, removes the site from answer engines as well as from training.

### Explicit opt-out

`ai-input=no` and `noai` tell answer engines not to use the page, even when the crawler is otherwise allowed.

::example{type="bad" title="Café blocked from ChatGPT search"} Northside Coffee blocked every bot except Googlebot. The site still ranked in Google, and ChatGPT search could not read the menu or hours. ::

## How to Fix This

::fix-step{number="1" title="Open robots.txt"} Visit yoursite.com/robots.txt. If the file is missing, answer crawlers are already allowed and you can skip to the homepage tags. ::

::fix-step{number="2" title="Allow answer crawlers"} Keep `User-agent: *` with `Allow: /` for the homepage, or add `Allow: /` groups for `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Claude-SearchBot`, and `Claude-User`. You can still `Disallow: /` for training crawlers such as `GPTBot`. ::

::fix-step{number="3" title="Keep AI answers allowed"} If you publish a Content-Signal, set `ai-input=yes` for the answer crawlers you want cited. Remove `noai` from the homepage robots meta tag and from `X-Robots-Tag`. ::

::fix-step{number="4" title="Add llms.txt"} Optional. Publish a short markdown file at `/llms.txt` with an H1, a one-line summary, and links to your menu, hours, and contact page so assistants can quote the right URLs. ::

::time-estimate{minutes="20" difficulty="easy"} ::

## What is the positive impact?

### Cited with the right details

Answer engines can read your hours, address, and services instead of guessing from an old directory.

### Training stays separate

You can refuse model training and still be eligible to appear in live answers.

### A page assistants can quote

An `llms.txt` file gives them a stable summary and the links you want customers to open.

::example{type="good" title="Plumber visible in answers"} Harbour Plumbing allows answer crawlers, sets `ai-input=yes`, and publishes `/llms.txt` with suburbs served and a booking link. Assistants can point people at that page. ::

## Learn more

- [OpenAI crawlers](https://platform.openai.com/docs/bots) - Which bots train models and which power ChatGPT search
- [Content Signals](https://contentsignals.org/) - How `ai-input` differs from search and training
- [llms.txt](https://llmstxt.org/) - A markdown summary file for assistants
