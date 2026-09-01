# Regional Prospecting Engine

## Purpose

Extend the existing Prospect Intelligence Engine into a reusable geographic system.

The core process stays the same:

**Discover → Enrich → Score → Draft → Human Review → Learn**

The geography changes through a regional configuration rather than by building a new prospecting system from scratch.

---

## Regional inputs

Each region should define:

- Geography
- Eligible prospect categories
- Local regulatory / licensing sources
- Local company registries
- Local industry clusters
- High-value trigger events
- Key cities / business hubs
- Recommended outreach angles
- Excluded / restricted use cases
- Compliance status for Satstreet servicing that jurisdiction

---

## Critical compliance gate

A regional prospecting engine may research and prioritize public prospects before Satstreet is approved to service them.

However, the system must distinguish:

### Research mode
Used to:
- map the market
- identify potential counterparties
- understand regional demand
- build relationships
- prepare expansion strategy

### Commercial mode
Used only after Satstreet legal/compliance has confirmed:
- which Satstreet entity may serve the prospect
- required federal / state registrations or licences
- permitted products and services
- approved marketing language
- onboarding eligibility
- any jurisdiction-specific disclosures

Until approved, outreach must not imply that Satstreet is currently able to execute transactions for a Florida / U.S. prospect.

---

## Shared scoring model

Each prospect is scored 1–5 on:

- Trigger Strength (T)
- Repeat Flow Potential (F)
- Satstreet Fit (S)
- Recency (R)
- Contactability (C)

**Score = (T × 3) + (F × 3) + (S × 2) + R + C**

Max = 50.

Regional configuration can add a separate **Strategic Expansion Value** field without changing the core score.

---

## Daily output

For each region:

- Rank
- Entity
- City / state
- Category
- Trigger
- Trigger date
- Public source
- Potential Satstreet need
- Repeat-flow potential
- Decision-maker
- Public contact path
- Outreach angle
- Email draft
- LinkedIn draft
- Confidence
- Score
- Expansion status:
  - Research only
  - Relationship building approved
  - Commercial outreach approved
  - Eligible for onboarding

---

## Regional directory structure

```
config/
  regions/
    canada.md
    florida.md
    new-york.md
    texas.md

outputs/
  daily-prospects/
    canada/
    florida/
    new-york/
    texas/
```

This makes the engine scalable from one market to many without duplicating the underlying logic.
