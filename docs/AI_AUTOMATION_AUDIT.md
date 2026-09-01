# Satstreet AI & Automation Audit

## Purpose

Map repetitive, manual, error-prone, or revenue-constraining work across Satstreet so we can identify where AI and automation can create the highest operational leverage.

This audit is **not** a mandate to automate everything. Each process should be evaluated on business value, risk, and whether automation preserves Satstreet's high-touch client experience.

---

## How to use this audit

For each recurring process, capture:

| Field | What to record |
|---|---|
| Department | Sales, Trading, Compliance, Client Service, Marketing, Management |
| Process | Short name of the workflow |
| Owner | Person primarily responsible |
| Trigger | What starts the process |
| Frequency | Daily / Weekly / Monthly / Ad hoc |
| Current steps | What actually happens today |
| Inputs | Systems, files, emails, market data, CRM data, etc. |
| Output | Email, trade action, report, meeting, post, approval, etc. |
| Time per run | Approximate human minutes |
| Volume | How often it occurs |
| Pain point | Why the current process is inefficient |
| Revenue impact | 1–5 |
| Time-saving potential | 1–5 |
| Implementation difficulty | 1–5 |
| Risk / sensitivity | 1–5 |
| Human approval required? | Yes / No |
| Candidate automation | What AI / workflow could do |
| Status | Discover / Design / Build / Test / Live / Rejected |

---

# 1. Sales / Business Development

Audit these first because they are closest to revenue.

### Processes to map

- Net-new prospect discovery
- Prospect qualification
- Trigger-event research
- Decision-maker identification
- Account research before outreach
- Personalized email drafting
- LinkedIn message drafting
- Call-list preparation
- Follow-up reminders
- Follow-up drafting
- Meeting preparation
- Meeting-note capture
- CRM note creation
- Next-step extraction
- Client reactivation
- Dormant lead reactivation
- Referral-partner prospecting
- Crypto-business counterparty prospecting
- Pipeline review
- Lost-opportunity analysis
- Daily priority account selection
- Client / prospect market update selection

### Questions

- Where are reps spending time searching rather than selling?
- Which prospects are most likely to transact soon?
- What information is repeatedly researched before every call?
- Where do good leads currently fall through the cracks?
- Which follow-ups depend on someone remembering manually?
- Which existing relationships could generate near-term volume if surfaced at the right time?

---

# 2. Trading

Automation here should support the desk, not make unsupervised trading decisions.

### Processes to map

- Pre-trade client information gathering
- Internal trade handoff from relationship manager to trader
- Quote-request intake
- Trade-status communication
- Settlement-status updates
- Funding confirmation handoff
- Post-trade client communication
- Recurring client reporting
- Trade-related FAQ responses
- Market context summaries
- Counterparty / venue information retrieval
- End-of-day internal reporting

### Questions

- What information does the trading team repeatedly ask sales for?
- What client questions interrupt traders most often?
- Which status updates could be generated automatically from approved data?
- What manual reporting takes time but requires little judgment?
- Where does information get re-keyed between systems?

---

# 3. Compliance

**Highest-risk automation category.**

AI should assist with organization, retrieval, summarization, and workflow routing. Final compliance judgments should remain with authorized humans.

### Processes to map

- Onboarding document completeness checks
- Missing-information follow-up
- Client information routing
- Policy / procedure lookup
- Approved-answer retrieval
- Internal regulatory knowledge search
- Document classification
- Case summaries
- Review queue prioritization
- Periodic information refresh reminders
- Public marketing claim review
- Social-content factual / regulatory checks
- Regulatory update monitoring

### Questions

- What repetitive administrative work surrounds compliance judgment?
- Which questions are answered repeatedly from the same approved policies?
- Can the system identify missing documents without deciding whether a client is acceptable?
- Where could AI create summaries for human review?
- Which external communications need mandatory compliance approval?

---

# 4. Client Service

### Processes to map

- Onboarding questions
- Funding questions
- Withdrawal questions
- Custody questions
- Account-status questions
- Document-request explanations
- First-trade guidance
- FAQ retrieval
- Routing client questions to the correct employee
- Appointment booking / coordination
- Post-meeting recaps
- Client education delivery
- Knowledge-hub maintenance
- Client update personalization

### Questions

- What questions does the team answer every week?
- Which answers should come only from an approved knowledge base?
- Which questions should always escalate to a human?
- Can AI shorten response time while keeping a named employee accountable?
- What client-service work is currently fragmented across email, Telegram, phone, and Notion?

---

# 5. Marketing

### Processes to map

- Market-event monitoring
- Content-idea generation
- Satstreet voice application
- X post drafting
- LinkedIn drafting
- Newsletter drafting
- Fact checking
- Compliance review
- Image / creative briefs
- Content-calendar management
- Content repurposing
- Performance analysis
- Competitor monitoring
- Website-copy maintenance
- Knowledge-hub content creation
- Educational content sourcing
- Social post approval
- Archive / tagging of published content

### Questions

- Which content types create useful conversations, not just impressions?
- What can be produced from existing Satstreet knowledge automatically?
- Which facts require a controlled source of truth?
- Where is human opinion / market judgment the most valuable input?
- What can be repurposed once rather than recreated from scratch?

---

# 6. Management / Internal Operations

### Processes to map

- Weekly pipeline summary
- Management reporting
- KPI collection
- Meeting agendas
- Meeting notes
- Action-item tracking
- Internal knowledge retrieval
- Project status updates
- Sales activity reporting
- Marketing performance reporting
- Client issue summaries
- Cross-team handoffs
- SOP creation
- SOP maintenance
- Decision logs

### Questions

- What reports are manually assembled every week?
- Which meetings exist because information is hard to access asynchronously?
- What knowledge currently lives only in one employee's head?
- Which decisions should be documented automatically?
- What metrics would prove whether AI is actually helping Satstreet?

---

# Initial candidate opportunities

These should be validated during interviews rather than treated as approved builds.

| Candidate | Department | Expected value | Human role |
|---|---|---|---|
| Daily Prospect Intelligence | Sales | More qualified outreach | Select targets + sell |
| Dormant Client Reactivation | Sales | Near-term trade volume | Review + contact |
| Meeting Prep Brief | Sales | Less research time | Run meeting |
| Follow-up Drafting | Sales | Faster follow-up | Edit + send |
| Internal Satstreet Q&A | Client Service | Faster answers | Escalate sensitive cases |
| Social Drafting Engine | Marketing | Higher content output | Opinion + approval |
| Marketing Fact Checker | Compliance/Marketing | Lower external-claim risk | Final review |
| Onboarding Completeness Assistant | Compliance | Less admin | Compliance decision |
| Weekly Management Brief | Management | Less reporting time | Interpret + decide |
| Client Knowledge Bot | Client Service | Better self-service | Human escalation |

---

# Audit output

At the end of discovery, we should be able to answer:

1. What are the top 10 repetitive workflows by total human hours?
2. Which 10 workflows are closest to revenue?
3. Which processes create the most avoidable errors or delays?
4. Which workflows can be automated safely?
5. Which workflows should **never** be autonomous?
6. Which three workflows should be shipped first?
7. What data / permissions are required?
8. How will each workflow be measured?
