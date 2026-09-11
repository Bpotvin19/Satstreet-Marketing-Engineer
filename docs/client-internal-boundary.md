# Client and internal boundary

## Client-facing routes

The primary Client Terminal navigation is deliberately limited to:

| Label | Route | Purpose |
| --- | --- | --- |
| Overview | `/overview.html` | Cross-asset snapshot, reviewed desk note, catalysts, and watch-only utilities |
| News | `/news.html` | Reviewed client Morning Brief only |
| Charts | `/ticker.html` | Market board, with `/chart.html` as the chart detail route |
| Explorer | `/explorer.html` | Public Bitcoin network, block, transaction, and address data |
| Treasuries | `/treasuries.html` | Public digital-asset treasury context |
| Resources | `/resources.html` | Client-safe educational material |

`/` resolves to `/overview.html`. The existing `/structure.html` and `/portfolio.html` utilities remain client-safe but are not part of the V1 primary navigation. They should be reviewed before being promoted back into the main shell.

## Internal-only source and services

- `internal/news.html` preserves the former team workspace UI.
- `internal/assets/news-desk.js` and `internal/assets/team-workspace.js` preserve the protected internal renderers.
- `/api/news`, `/api/workspace`, `/api/system`, and `/api/prospect-owner` are internal services. They require the configured team access key and must never be called from client pages.
- `_system-content.ts` and the internal Notion integration code remain server-side.

The `internal/` directory is outside Netlify's `public/` publish directory. It is not a hidden client route. Reintroducing its UI requires a separately authenticated internal deployment and a security review.

## Shared assets

`public/assets/terminal.js` and `public/assets/terminal.css` define the client shell, navigation, visual language, formatting, and common states. Client pages may use these assets. Internal UI must not add items to the client navigation at runtime.

## Data boundaries

- Client pages may use public third-party market or blockchain data and intentionally client-facing educational content.
- `/api/desknote` is the only internal editorial bridge used by the Client Terminal. It returns only the latest `Reviewed` client document and returns no content when that condition is not met.
- Client pages must fail empty or unavailable when approved data is missing. They must not substitute drafts, demo values, or internal research.
- Watch-only Bitcoin addresses remain in the viewer's browser. Do not add address, transaction, or client-identity analytics.

## Never public

Do not place staff-specific views, prospect or CRM data, internal contacts, drafts, prompts, model instructions, bot or agent controls, decision queues, system-health details, workflow metadata, access keys, private Notion material, client records, or admin actions under `public/` or in a client API response.

## Placement test for future work

A feature belongs in Client Terminal only when its data is public or explicitly approved for clients, it remains useful without internal context, its failure state reveals nothing private, and it does not enable an internal action. If any answer is unclear, keep the feature internal until Product, Compliance, and Engineering approve the boundary and delivery path.
