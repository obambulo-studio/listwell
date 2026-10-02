# DNS for AI Discovery (DNS-AID) on listwell.dev

Listwell agent discovery over DNS is configured in Cloudflare DNS for the `listwell.dev` zone. HTTP discovery (API catalog, MCP server card, WebMCP) is served by the Worker; DNS-AID advertises the same endpoints to resolvers.

## Prerequisites

1. Enable **DNSSEC** for `listwell.dev` in Cloudflare (**DNS → Settings → DNSSEC**). Validating resolvers must receive authenticated data (`AD` bit) for the scanner check.
2. Publish **HTTPS** (ServiceMode SVCB) records under `_agents` labels per [draft-mozleywilliams-dnsop-dnsaid](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/).

## Recommended records

Replace targets if the MCP HTTP endpoint moves.

| Name             | Type  | Data                                    |
| ---------------- | ----- | --------------------------------------- |
| `_index._agents` | HTTPS | `1 listwell.dev alpn="h2,mcp" port=443` |
| `_mcp._agents`   | HTTPS | `1 listwell.dev alpn="mcp,h2" port=443` |
| `_a2a._agents`   | HTTPS | `1 listwell.dev alpn="a2a,h2" port=443` |

In the Cloudflare dashboard: **DNS → Add record → Type HTTPS**, name `_index._agents`, priority `1`, target `listwell.dev`, and SvcParam `alpn="h2,mcp" port=443`.

HTTP fallbacks for the same discovery data:

- `https://listwell.dev/.well-known/mcp/server-card.json`
- `https://listwell.dev/.well-known/api-catalog`
- `https://listwell.dev/.well-known/ai-catalog.json`

## Apply with the Cloudflare API

When `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` are set:

```bash
bash scripts/publish-dns-aid-cloudflare.sh
```

Verify with DNS-over-HTTPS:

```bash
curl -sS 'https://cloudflare-dns.com/dns-query?name=_index._agents.listwell.dev&type=HTTPS&do=1' \
  -H 'Accept: application/dns-json'
```

Look for `"AD": true` after DNSSEC propagation and non-empty `Answer` for the HTTPS type.
