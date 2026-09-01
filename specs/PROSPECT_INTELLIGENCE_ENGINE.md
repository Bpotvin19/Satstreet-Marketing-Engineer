# Prospect Intelligence Engine — MVP Specification

## Objective

Build a public-data-only prospecting system that gives Sales / BD a prioritized list of high-quality net-new opportunities each morning.

The first product is a **Daily Prospect List**.

The system should reduce time spent on:

- searching for prospects
- reading company websites
- understanding business models
- finding recent trigger events
- identifying decision-makers
- deciding why Satstreet should reach out
- drafting first-touch outreach

It should **not** send outreach autonomously.

---

## Primary user

Satstreet Sales / BD.

## Primary outcome

Create more qualified sales conversations without increasing time spent on research.

## Success definition

A successful daily output makes it possible for the salesperson to start the day with:

> "These are the 10–20 entities most worth my attention today, this is why each one matters now, and this is how I should approach them."

---

# Data boundary

## Allowed for MVP

Public or explicitly approved business information only:

- company websites
- public news
- public regulatory registries
- public press releases
- public executive / founder biographies
- public funding announcements
- public treasury announcements
- public mining updates
- public custody / security developments
- public business-model information
- public social content where permitted
- approved Satstreet positioning / company facts

## Not allowed

- client PII
- private CRM notes
- account balances
- private trading history
- private emails
- client documents
- private financial information
- sensitive compliance material
- passwords / secrets / private keys

**No HubSpot client data is required for the MVP.**

---

# Target universe

Initial prospect categories:

1. Canadian crypto businesses
2. Bitcoin miners
3. corporate treasuries
4. founders with recent liquidity events
5. family-office / investment entities with public crypto activity
6. stablecoin and payment companies
7. remittance businesses
8. crypto lenders
9. smaller brokers / OTC desks
10. high-value referral partners

---

# Trigger library

The system should look for recent events such as:

- company financing
- acquisition / sale
- founder exit
- new MSB / registration
- crypto product launch
- Bitcoin treasury announcement
- mining shutdown or restart
- mining production update
- stablecoin launch / expansion
- custody incident
- market drawdown
- major BTC rally
- cross-border payments expansion
- new geography / Canadian expansion
- executive public commentary on Bitcoin / digital assets
- corporate capital raise
- treasury or balance-sheet change

---

# Daily Prospect List output

For each prospect, return:

| Field | Description |
|---|---|
| Rank | Daily priority |
| Entity | Company / founder / organization |
| Category | Miner, broker, founder, treasury, etc. |
| Location | City / country where relevant |
| Trigger | Why the entity matters now |
| Trigger date | Recency of the signal |
| Source | Public evidence |
| Potential Satstreet need | Liquidity, execution, custody, settlement, treasury, etc. |
| Repeat-flow potential | Low / Medium / High |
| Decision-maker | Publicly identifiable person / title |
| Public contact path | Website, public email, LinkedIn, etc. |
| Outreach angle | 1–2 sentence rationale |
| Email draft | Short human-review draft |
| LinkedIn draft | Short human-review draft |
| Confidence | High / Medium / Low |
| Score | Prioritization score |

---

# Prioritization model

Score each prospect from 1–5 on:

- **Trigger Strength (T)** — how strong the current reason to transact / engage is
- **Repeat Flow Potential (F)** — whether this could create recurring volume
- **Satstreet Fit (S)** — fit with Satstreet's service model
- **Recency (R)** — how fresh the trigger is
- **Contactability (C)** — whether the right decision-maker can be reached

### Daily score

**Score = (T × 3) + (F × 3) + (S × 2) + R + C**

Maximum score: 50.

### Priority bands

- **40–50:** Contact today
- **32–39:** High priority
- **24–31:** Research / nurture
- **Below 24:** Do not clutter the daily list

The list should optimize for **quality, not volume**.

---

# MVP workflow

## Step 1 — Discover

Collect recent public triggers from approved sources.

## Step 2 — Deduplicate

Remove companies already surfaced recently unless a new trigger materially changes the opportunity.

## Step 3 — Enrich

Research:

- company model
- executive / founder
- recent activity
- likely crypto flow
- potential Satstreet use case

## Step 4 — Score

Apply the prioritization model.

## Step 5 — Draft

Generate:

- outreach angle
- short email
- short LinkedIn message

## Step 6 — Human review

Salesperson decides:

- contact now
- save
- reject
- research further

## Step 7 — Learn

Capture the salesperson's disposition so future ranking improves:

- contacted
- not relevant
- wrong person
- duplicate
- meeting booked
- nurture
- no response

No autonomous outreach is permitted.

---

# Daily user experience

The intended interface can eventually be Telegram / Grokbot:

`/prospects`

Example response:

> **#1 — Example Miner — Score 44/50**  
> Trigger: Restarted operations after a temporary shutdown.  
> Why Satstreet: Potential recurring BTC treasury sales and block execution.  
> Contact: CFO / Head of Treasury  
> Suggested angle: Ask how they currently monetize produced BTC and whether an additional Canadian execution counterparty would be useful.

A richer version can link to the full prospect record in Notion or another approved workspace.

---

# Phase plan

## Phase 1 — Manual assisted MVP

Goal: prove the scoring and output format before building automation.

- generate a public-data daily list
- manually review 10–20 prospects
- capture disposition
- test whether the list produces better conversations

## Phase 2 — Persistent prospect database

Add:

- deduplication
- history
- status
- prior trigger events
- salesperson disposition
- source tracking

Keep this limited to **net-new public business information**.

## Phase 3 — Automated trigger monitoring

Run on a schedule and surface only high-scoring new opportunities.

## Phase 4 — Telegram / Grokbot interface

Commands:

- `/prospects`
- `/research <entity>`
- `/draft <entity>`
- `/why-now <entity>`

## Phase 5 — Measurement

Track:

- prospects surfaced
- prospects contacted
- reply rate
- meetings booked
- onboarding conversations
- funded accounts
- first trades
- trading volume influenced

---

# Dormant client reactivation — privacy-safe design

Dormant client reactivation is the next priority, but it must be architected differently.

Because external AI should not receive client information:

1. HubSpot creates private cohorts internally.
2. Examples:
   - no trade in X days
   - approved but unfunded
   - prior miner relationship
   - HNW buyer during a prior market period
3. The salesperson sees the client names **inside HubSpot only**.
4. AI receives only a generic cohort description, for example:
   - "HNW Bitcoin buyer inactive for 9+ months"
   - "Bitcoin miner that paused operations"
5. AI produces generic outreach angles / talking points.
6. A human applies those ideas to the actual relationship.

This preserves client privacy while still using AI to improve the sales playbook.

---

# Non-goals

The MVP will not:

- access private client data
- automatically email prospects
- automatically message LinkedIn users
- make calls
- decide suitability
- provide investment advice
- make compliance decisions
- place trades
