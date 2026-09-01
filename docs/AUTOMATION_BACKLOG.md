# Automation Backlog

Use this document to rank what gets built.

## Scoring model

Score each category from 1–5.

- **Revenue Impact (R):** potential to create, accelerate, protect, or recover revenue.
- **Time Saved (T):** expected reduction in recurring human work.
- **Ease (E):** 5 = simple to implement, 1 = difficult.
- **Risk Safety (S):** 5 = low sensitivity / easy to control, 1 = high regulatory, financial, security, or client risk.
- **Adoption Likelihood (A):** likelihood that the team will actually use it.

### Priority score

**Priority = (R × 3) + (T × 2) + E + S + A**

Revenue is deliberately weighted most heavily.

---

## Sales / BD — validated priorities

| Workflow | Dept | R | T | E | S | A | Score | Owner | Status | KPI |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Daily Prospect List — MVP | Sales | 5 | 5 | 5 | 5 | 5 | 40 | Ben | Design | Qualified conversations / meetings |
| Prospect Intelligence Engine | Sales | 5 | 5 | 3 | 5 | 5 | 38 | Ben | Design | Research time saved + qualified meetings |
| Dormant Client Reactivation — privacy-safe | Sales | 5 | 4 | 3 | 2 | 5 | 33 | Ben | Discover | Reactivated accounts / trading volume |
| Meeting Prep — public info first | Sales | 4 | 4 | 5 | 5 | 5 | 35 | Ben | Discover | Prep time saved |
| Personalized Outreach Drafting | Sales | 4 | 4 | 5 | 4 | 5 | 34 | Ben | Discover | Reply / meeting rate |
| Follow-up Engine | Sales | 4 | 3 | 4 | 3 | 5 | 30 | Ben | Discover | Follow-up completion / response time |
| Referral Engine | Sales | 4 | 3 | 4 | 5 | 4 | 31 | Ben | Discover | Partner meetings / introductions |

### Design note

The **Daily Prospect List** is the first output of the **Prospect Intelligence Engine**. They are intentionally separated in the backlog so the team can ship a useful MVP before building the full automated engine.

Dormant-client reactivation has a lower safety score because client information is sensitive. The approved architecture should keep client-level data inside HubSpot and use AI only on generic cohort descriptions unless Satstreet explicitly approves a controlled private integration.

---

## Other departments — provisional

| Workflow | Dept | R | T | E | S | A | Score | Owner | Status | KPI |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Internal Knowledge Q&A | Client Service | 3 | 5 | 4 | 4 | 5 | 32 | TBD | Discover | Questions resolved |
| Social Drafting Engine | Marketing | 3 | 4 | 5 | 4 | 5 | 30 | Ben | Discover | Approved posts / time saved |
| Marketing Fact Checker | Compliance/Marketing | 3 | 3 | 4 | 5 | 4 | 28 | TBD | Discover | Issues caught before publish |
| Weekly Management Brief | Management | 3 | 4 | 4 | 5 | 4 | 29 | TBD | Discover | Reporting hours saved |

> Non-sales scores remain provisional until the relevant process owners are interviewed.
