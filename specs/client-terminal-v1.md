# Satstreet Client Terminal V1

## Objective
Create a distinct client-facing Satstreet Terminal that is useful enough for clients to revisit daily, while keeping all internal operating-system content, prospecting, personal staff tabs, agent controls, and internal drafts separate.

## Product thesis
Satstreet Terminal V1 is a daily market-intelligence and Bitcoin utility dashboard designed to keep clients engaged with Satstreet even when they are not trading.

## Non-negotiable separation
### Client-facing terminal
May contain only public, approved, or intentionally client-facing information.

### Internal Satstreet OS
Remains private and may contain internal research workflows, prospecting, staff-specific content, social drafts, automation controls, and operating-system tooling.

Never expose internal staff tabs, prospecting records, bot controls, internal prompts, approval queues, or internal-only draft content in the client terminal.

## V1 client navigation
1. Overview
2. News / Morning Brief
3. Markets / Charts
4. Bitcoin Explorer
5. Treasuries / Macro
6. Resources, if already client-safe
7. Place a Trade

Keep V1 deliberately narrow. Do not add additional pages unless they clearly improve daily client utility.

## V1 priorities

### 1. Overview
The Overview page should answer in under one minute:
- What moved?
- What matters today?
- What does Satstreet think is worth watching?
- Where can I explore further?
- How do I place a trade?

Recommended modules:
- Market snapshot
- Satstreet Morning Brief / Desk View
- Key news
- Major crypto and macro charts
- Quick links to Explorer, Treasuries, and Place a Trade

### 2. Satstreet Morning Brief
Make this the primary recurring content product.

Each approved daily brief should contain:
- Overnight / prior-session market context
- 3–5 most important developments
- Bitcoin / digital-asset relevance
- Key macro item(s)
- What the desk is watching today

The client view must receive only approved final copy. Internal research and drafting remain upstream and private.

### 3. News
News should lean toward Bitcoin, digital assets, macro, regulation, institutional adoption, market structure, rates, liquidity, and major geopolitical developments that affect markets.

Remove any internal staff views, agent outputs, content suggestions, or password-protected internal navigation from the client-facing version.

### 4. Bitcoin Explorer
The Explorer is a real utility, not decoration.

V1 should support:
- Block height search
- Block hash search
- TXID search
- Bitcoin address search
- Latest blocks
- Confirmation status
- Transaction fee and fee rate
- Inputs / outputs
- Address transaction history
- Network fee reference
- Clear loading and failure states

Do not claim independent verification until Satstreet operates and queries its own validating Bitcoin infrastructure.

### 5. Markets / Charts
Keep only charts that materially help clients understand the market. Prioritize:
- Bitcoin
- Ethereum if useful
- Gold
- Oil
- DXY
- US Treasury yields
- Equity indices
- ETF flows
- Derivatives metrics where reliable

No fabricated catalysts, hard-coded stale values, or unsupported desk views.

### 6. Treasuries / Macro
Provide clean, explanatory market context rather than a dense institutional terminal replica.

Potential V1 items:
- 2Y / 10Y / 30Y yields
- Yield curve
- DXY
- Oil
- Gold
- Key upcoming macro events
- Short explanation of why these matter for Bitcoin / risk assets

### 7. Commercial paths
The product must remain useful first, commercial second.

Primary CTAs:
- Place a Trade
- Open an Account
- Speak With the Desk

Place a Trade must route to the approved Satstreet trading-platform login URL.

Avoid intrusive popups and aggressive lead capture.

## Analytics requirements
Before wider rollout, instrument at minimum:
- Page views
- Returning visitors
- Most-used pages
- Morning Brief engagement
- Explorer usage
- Place a Trade clicks
- Open Account clicks
- Speak With the Desk clicks

Do not log searched Bitcoin addresses or TXIDs unnecessarily.

## Client feedback loop
Pilot with a small group of existing clients before broad launch.

Ask:
1. What do you use most?
2. What is missing?
3. What would make you open this every morning?
4. What would you remove?

Use feedback to prioritize V1.1 instead of expanding scope in advance.

## Technical deployment
V1 should be hosted on a stable Satstreet-controlled domain or subdomain before external launch.

Requirements:
- Stable URL
- Production deployment process
- HTTPS
- Mobile responsiveness
- Error monitoring
- Reasonable uptime
- Analytics
- No changing temporary preview links for clients

Recommended approach:
- Continue implementation on `client-terminal-v1`
- Do not merge until internal review
- Use preview deployment for design review
- Separate client and internal routes at the code / deployment level where practical

## Immediate implementation sequence

### Phase 1 — Separation and audit
- [ ] Audit every current public page for internal-only material
- [ ] Identify navigation that belongs only in internal OS
- [ ] Remove staff-specific tabs from client scope
- [ ] Remove internal content-generation views from client scope
- [ ] Verify no client-facing page exposes internal access controls or prompts

### Phase 2 — Client V1 shell
- [ ] Finalize client navigation
- [ ] Make Overview the clear starting point
- [ ] Add Morning Brief module to Overview
- [ ] Add clear Place a Trade CTA
- [ ] Ensure News is client-only
- [ ] Ensure consistent visual system across Overview, News, Charts, Explorer, Treasuries

### Phase 3 — Daily utility
- [ ] Finalize Bitcoin Explorer
- [ ] Improve macro / treasury visuals
- [ ] Improve ETF / derivatives visuals only where data is reliable
- [ ] Add oil alongside other core macro indicators
- [ ] Add concise client explanations where technical data needs context

### Phase 4 — Production readiness
- [ ] Add analytics
- [ ] Add privacy-conscious event naming
- [ ] Test mobile
- [ ] Test failed-data states
- [ ] Test all trade/account/contact CTAs
- [ ] Confirm production hosting path with John / engineering
- [ ] Create preview for internal sign-off

### Phase 5 — Pilot and iterate
- [ ] Select pilot clients
- [ ] Share stable client URL
- [ ] Gather structured feedback
- [ ] Review usage analytics
- [ ] Prioritize V1.1 based on observed behavior, not assumptions

## Internal implementation strategy owners
Suggested ownership for discussion, not final assignment:
- Ben: product owner, client UX, content requirements, implementation coordination
- John / engineering: hosting, production architecture, deployment, security review
- Mike / George: commercial and client-value review
- Dan: transaction / block-explorer utility review and market-data usability
- Compliance: review client-facing claims and recurring Morning Brief process where required

## Success criteria
V1 is ready for pilot when:
- A client can open one stable URL and understand the market quickly
- No internal Satstreet OS content is exposed
- Morning Brief is current and clearly visible
- Explorer works for real transaction / settlement checks
- Market data fails gracefully instead of showing fake values
- Place a Trade is one click away
- Mobile experience is usable
- Analytics can distinguish first-time and returning usage at an aggregate level
- The team can explain who owns updates, approvals, deployment, and incident response
