# Sales / BD Audit

## Current operating model

The Sales / BD day is split roughly in half:

1. **Net-new outbound** — HubSpot lists, LinkedIn, referrals, old leads, news, and company research.
2. **Existing book** — catching up with current relationships and prior opportunities.

The main constraint is not willingness to do outreach. It is the amount of time required to decide **who is worth contacting, why now, and what context matters before reaching out**.

---

## Current workflow

### Prospect sourcing

Prospects currently come from a mix of:

- HubSpot CRM lists
- LinkedIn
- referrals
- old leads
- news
- manual company research

There is no single daily prioritization layer across these sources.

### Pre-outreach research

Before contacting a prospect, Sales / BD may need to research:

- company background
- founder / executive background
- public contact information
- recent company news
- regulatory status
- business model
- custody setup where publicly known
- prior relationship history
- prior messages
- trading history for existing relationships

This research is one of the largest time sinks before an actual sales conversation occurs.

### Where opportunities are lost

Three recurring failure modes were identified:

1. **No clear reason to reach out now**
2. **Too many names and insufficient prioritization**
3. **Prospects becoming less interested in the market over time**

The system therefore needs to prioritize **timing and trigger events**, not merely produce more names.

### Repetitive work suitable for automation

High-value candidates:

- LinkedIn outreach drafting
- email template drafting
- net-new prospect research
- public-company / founder research
- trigger-event monitoring
- daily prospect prioritization

### Follow-up tracking

Follow-ups currently exist across:

- HubSpot
- calendar
- memory
- spreadsheets
- Notion

This fragmentation creates a risk that next actions are duplicated, forgotten, or deprioritized.

### Post-meeting workflow

Current post-meeting workflow is already partially supported:

- salesperson writes meeting notes
- HubSpot AI also creates notes
- an email template is drafted
- follow-ups are tracked

Because this process already has tooling, it is **not the first automation priority**.

---

## Best-fit prospect categories

Sales / BD sees opportunity across:

- HNW individuals
- founders
- family offices
- crypto businesses
- miners
- corporate treasuries
- referral partners

The problem is not a lack of target categories. The problem is identifying **which specific entity has the strongest reason to transact now**.

---

## Transaction / outreach trigger signals

High-value signals include:

- liquidity event
- funding round
- major BTC move
- custody / security incident
- new MSB or crypto registration
- treasury activity
- tax event
- market drawdown
- mining operational changes
- corporate crypto expansion

These signals should become the backbone of the prospecting system.

---

## Underworked existing-book segments

Two segments were specifically identified:

### HNW clients who bought near the top of the market

Potential relevance:

- position review
- renewed accumulation interest
- custody / security conversation
- changed market conditions

### Bitcoin miners who temporarily shut down operations

Potential relevance:

- restarted production
- treasury sales
- liquidity requirements
- operational financing needs
- block execution

**Important:** these are existing-client / relationship use cases. The user has explicitly stated that sensitive client information should not be exposed to external AI systems.

---

## AI boundaries

The Sales / BD system must **not**:

- join sales calls autonomously
- send emails to clients or prospects autonomously
- access sensitive client information
- access private trading history in an external AI workflow
- make unsupervised client-facing decisions

AI may:

- research public net-new prospects
- monitor public trigger events
- draft outreach for human review
- prepare public-information meeting briefs
- create generic cohort-level reactivation ideas
- help prioritize public prospect opportunities

For existing clients, private CRM segmentation should remain inside HubSpot or another approved system of record. AI can generate **generic playbooks** for a cohort without receiving names, notes, balances, trade history, or other sensitive information.

---

# Ranked Sales / BD priorities

Based on the Sales / BD audit, the desired build order is:

1. **Daily Prospect List**
2. **Prospect Intelligence Engine**
3. **Dormant Client Reactivation**
4. **Meeting Prep**
5. **Personalized Outreach**
6. **Follow-up Engine**
7. **Referral Engine**

## Key design decision

The first two priorities should be treated as one product:

> **The Prospect Intelligence Engine is the backend; the Daily Prospect List is its first user-facing output.**

This avoids building a static list that still requires manual research.

---

# Core diagnosis

The highest-value Sales / BD problem is:

> **Too much time is spent deciding who deserves attention and assembling enough context to create a relevant reason to reach out.**

The first system should therefore optimize for:

**right prospect + right trigger + right context + right message + human action**

—not maximum lead volume.
