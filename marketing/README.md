# Satstreet Marketing

A lightweight content operating system: calendar → Claude → Telegram, with a
human deciding what gets published.

```bash
npm run marketing:today                      # three opportunities, in your terminal
npm run marketing:today -- --chat            # no API key — paste into claude.ai
npm run marketing:today -- --print-prompt    # system and user turns, separated
npm run marketing:check                      # verify the Telegram connection
npm run marketing:chatid                     # find the group's chat id
npm run marketing:bot                        # the bot (long polling)
npm run marketing:morning                    # post the 8 AM plan to the group
npm run marketing:morning -- --dry-run       # generate and print, send nothing
```

## Running it without an API key

`--chat` assembles the whole thing — job description, context pack, today's
calendar, and the output shape — as one block to paste into claude.ai. Same
prompt the automation uses; the only difference is that a human moves it.

```bash
npm run marketing:today -- --chat | pbcopy    # macOS: straight to the clipboard
```

**Better, once you're doing this daily:** create a Project in claude.ai and put
the *system* half in its custom instructions once —
`npm run marketing:today -- --print-prompt` prints the two halves separately.
Each morning you then paste only the short user block, which is a few lines
rather than a few pages.

This is the whole Phase 0 loop, at no cost. An API key only buys the unattended
part: the 8 AM post arriving in Telegram by itself and the draft buttons
working.

## Setup

```bash
cp marketing/.env.example marketing/.env
```

### Telegram

1. Message **@BotFather** → `/newbot`. Copy the token into `TELEGRAM_BOT_TOKEN`.
2. Create the private marketing group and add the bot.
3. Send any message in the group, then find its id:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
   ```
   Look for `"chat":{"id":-100…}` — group ids are negative. That's
   `TELEGRAM_CHAT_ID`.
4. `npm run marketing:check` verifies all of it.

Leave BotFather's **group privacy mode ON** (the default). The bot then sees
only messages addressed to it or starting with `/`, and never the team's
conversation. The check command reports which mode is active.

### Running it

Two processes. `marketing:bot` handles commands and button presses and needs to
stay up; `marketing:morning` posts the daily plan and is driven by cron, the
same box that runs the client brief:

```
0 8 * * 1-5  cd /path/to/satstreetgolf && npm run marketing:morning >> logs/marketing.log 2>&1
```

Set `TZ=America/New_York` in the crontab. For a webhook deployment instead of
long polling, swap `bot.start()` in `bot.ts` for grammY's `webhookCallback` —
nothing above that line changes.

## Commands

| Command | Does |
| --- | --- |
| `/today` | The day's two or three best opportunities, with draft buttons |
| `/draft <n>` | Draft opportunity n on its recommended channel |
| `/x <n>` · `/linkedin <n>` | Force the channel |
| `/rewrite [direction]` | Three stronger versions of the last draft |
| `/ideas <topic>` | Angles on a topic |
| `/weekly` | Next week's content mix, plus which pillars go untouched |
| `/calendar` | The next 30 days |
| `/published` | What's already gone out, and which backend is recording it |

Buttons do the same work: each opportunity gets **X** and **LinkedIn**, and each
draft gets **Approve**, **Rewrite**, and the other channel.

## The approval gate

Nothing is published from here, by design. **Approve** logs who approved what
and when, then hands the copy back for a human to post.

Every draft passes the rules in `compliance.ts` before it's shown:

| Rule | Severity | Catches |
| --- | --- | --- |
| `custody-and-insurance` | block | "fully insured", "your assets are protected", risk-free |
| `regulatory-claims` | block | "registered with", named regulators, "fully compliant" |
| `no-forecasts` | block | price predictions, targets, "next leg up", 10x |
| `no-advice` | block | "you should buy", "now is a great time to" |
| `client-confidentiality` | block | "one of our clients moved…" |
| `no-competitor-naming` | block | names from `COMPETITOR_NAMES` |
| `house-voice` | warn | HODL, hype adjectives, exclamation marks, hashtag stuffing |
| `editorial-guardrail` | warn | a figure in the body that isn't flagged for refresh |

A blocked draft is still shown — it's usually 95% right with one bad phrase, and
hiding it just makes the team ask again. What's withheld is the **Approve
button**, which never renders on a blocked draft. Approval re-runs the check, so
a rule added after drafting still catches it.

## The week-one loop

1. Fill in the remaining **TODO** sections of `context/satstreet.md`. Highest-
   leverage hour in the project; suggestions stay generic until it's done.
2. Run it every morning for a week.
3. Each morning, answer one question: *would I have posted any of these?*
4. When the answer is no, edit the context pack — not the code. Nearly every
   quality problem at this stage is a missing fact or a missing example.

## The calendar

Sources are tried in order, so a Notion outage degrades to a stale calendar
rather than none:

| Condition | Source |
| --- | --- |
| `NOTION_CALENDAR_PAGE_ID` + `NOTION_TOKEN` | The team's Notion Calendar page |
| `MARKETING_SHEET_ID` set | Google Sheet, via CSV export |
| otherwise | `marketing/calendar.json` |

### From Notion

The Calendar page isn't a database — it's a page with an at-a-glance table plus
one detail table per event. The adapter reads it as-is rather than asking anyone
to restructure a working document:

- **Pass 1** — the at-a-glance table (`Date · Event · Category · Primary angle · Lead time`)
- **Pass 2** — the per-event sections (`Why it matters · Content angles · Best formats`, plus the `Reference:` line)

Dates carry no year, which is right for a document reused annually. Anniversaries
stay year-less and roll to their next occurrence; conferences are pinned to the
edition year stated on the page ("specific to 2026"), so a passed conference
drops out instead of reappearing next year. `Category` decides which is which —
anything matching "conference" is a one-off.

Date cells handle `Jan 3`, `Feb 18-21`, `Mar 30-Apr 2`, and year-crossing ranges
like `Dec 30-Jan 2`. `TBD` rows are skipped and counted.

To use the team's existing sheet, share it "anyone with the link can view" and
put its id in `marketing/.env`:

```
MARKETING_SHEET_ID=1a2b3c…      # the long id in the sheet URL
MARKETING_SHEET_TAB=Calendar    # optional; omit for the first tab
```

Columns are matched by header name, case-insensitively, in any order. Extra
columns are ignored, so the team keeps their own layout:

| Field | Also accepts |
| --- | --- |
| `date` | when, day |
| `title` | event, name, content, topic |
| `type` | category, kind |
| `channel` | platform, where |
| `notes` | note, description, details, angle |
| `assets_url` | assets, drive, link, url, folder |

Only `date` and `title` are required. Rows with no title, or with `TODO` in the
date or title, are skipped and counted.

**Recurrence follows `type`.** Entries typed `anniversary` (also `recurring`,
`annual`, `holiday`) roll forward to their next occurrence, so the calendar
doesn't need re-dating every January. Everything else is a one-off — once it's
past, it stays past rather than resurfacing a year later. This is why the 2026
conferences drop off as they pass and the anniversaries never do.

### Richer fields

`calendar.json` carries everything the printed content calendar provides, and
all of it reaches the model. A Google Sheet supplies the six columns above;
these extras stay blank there until Phase 1 adds a proper sheet mapping.

| Field | What it does |
| --- | --- |
| `end_date` | Multi-day events render as a range |
| `category` | The content pillar — Bitcoin history, Self-custody, and so on |
| `angles` | The desk's house angles. The model is told to build on them, not repeat them |
| `formats` | Formats that have worked for this date |
| `location` | Conferences |
| `reference` | The primary source to cite |
| `lead_time_days` | How far ahead the team drafts |

**`lead_time_days` decides what counts as today's work.** An entry whose
drafting window is open is a live opportunity now, even when the date itself is
weeks away; one outside its window is listed as upcoming instead. That mirrors
the operating rhythm in the content calendar — anniversaries 7–10 days early,
conferences 2–3 weeks early.

A genuinely private sheet needs a service account; that lands in Phase 1 rather
than blocking this one.

## The context pack

`context/satstreet.md` is the brain. Review it like code — a wrong line there
produces wrong suggestions every morning until someone notices.

Everything not marked TODO was taken from Satstreet's own public site copy, so
it's safe to repeat publicly. The TODOs are the things only the team knows:
US expansion status, posts you liked and why, competitors, this quarter's
objective, sustainable cadence.

It's loaded into the system prompt as a cached prefix, so it's read fresh every
run but only billed in full on the first.

## Satstreet reference material

The pages listed in `reference-pages.json` are pulled from Notion and appended
to the system prompt. This is worth more than any amount of prompt tuning — it
covers exactly the topics where guessing is expensive.

```
/refresh        re-read the pages from Notion
```

Fetched on demand, cached to `.state/reference.md`, then read synchronously when
the prompt is built. Empty pages are skipped and cost nothing, so a page the team
hasn't written yet starts working the moment it has content.

Budgets: 14,000 chars per page, 45,000 total. Generous on purpose — the system
block is cached, so a bigger reference costs a fraction of a cent on the first
call of the day. Over-long pages are clipped at a paragraph break, never
mid-sentence; half a sentence about custody is worse than none.

The prompt tells the model to treat this as authoritative *internally* but not as
approved public copy — a fee or regulatory detail written there hasn't
necessarily been cleared for a post, and an angle depending on one gets flagged
in `risk_notes` for sign-off.

Add a page: put its label and id in `reference-pages.json`, share it with the
integration, then `/refresh`.

## The published log

Approving a draft records it, and every morning's plan is told what ground has
already been taken — which is what stops the bot proposing custody three times
in a fortnight. Two backends, chosen by configuration:

| Configured | Backend | Behaviour |
| --- | --- | --- |
| Nothing | `marketing/.state` | Works today. Local to the box, invisible to the team. |
| `NOTION_TOKEN` + `NOTION_MARKETING_DB_ID` | Notion | Durable, shared, survives redeploys. |

The local backend isn't a stub — same data, same bot behaviour. Notion just
makes it last.

To upgrade, create a Notion database with these properties and share it with
your integration (••• → Connections):

| Property | Type |
| --- | --- |
| `Name` | Title |
| `Date` | Date |
| `Channel` | Select |
| `Approved By` | Text |

Then `npm run marketing:check` verifies the properties exist with the right
types. Rename the keys in `PROPS` in `published.ts` if your columns differ.

Writes are belt-and-braces: the local record is written first because it's
synchronous and can't fail, then Notion on top. A Notion outage degrades the
log, it never loses an approval or breaks the button — and `/today` says so
rather than silently falling back.

## Not built yet

| Deferred | Phase |
| --- | --- |
| External signal — news, trending topics | 3 |

The model is told explicitly that it has no live market or news data and must
not claim a topic is trending, so no suggestion rests on information it can't
see. `recently_published` is stubbed until Phase 2 — until then the bot is told
to assume nothing about what the team has already posted rather than guess.

State lives in `marketing/.state/sessions.json` (gitignored): today's plan per
chat, its drafts, and the approval log. A new plan clears the old drafts, so
"draft 1" can never resolve to yesterday's opportunity.

## Model

`claude-opus-5` at effort `high`, structured output against `PLAN_SCHEMA`.
Override with `CLAUDE_MODEL` / `CLAUDE_EFFORT` in `marketing/.env`. A daily run
costs cents; `medium` effort is worth trying once the context pack is rich.

No API key yet? `--print-prompt` assembles the full prompt with no credentials —
paste it into claude.ai to judge output quality today.
