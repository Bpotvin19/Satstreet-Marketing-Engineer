import { InlineKeyboard } from 'grammy'

export const OS_HOME = `<b>Satstreet OS</b>

What do you need?

🎯 <b>Sales & BD</b> — prospects, research, meeting prep
✍️ <b>Marketing</b> — content, drafts, calendar, approvals
📊 <b>Market Intel</b> — briefs, prices, charts
📚 <b>Knowledge</b> — company facts and approved reference pages
⚙️ <b>System</b> — automation status and help

Choose a section below.`

export function homeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎯 Sales & BD', 'os:sales')
    .text('✍️ Marketing', 'os:marketing')
    .row()
    .text('📊 Market Intel', 'os:intel')
    .text('📚 Knowledge', 'os:knowledge')
    .row()
    .text('⚙️ System', 'os:system')
}

export const SALES_MENU = `<b>Sales & BD</b>

<b>Today</b>
/todays-prospects — Canada
/todays-prospects florida — Florida research

<b>Research</b>
/research &lt;company&gt; — public company research

<b>Coming next</b>
Meeting prep · reactivation ideas · referral opportunities

No client or HubSpot private data is used in these workflows.`

export const MARKETING_MENU = `<b>Marketing</b>

/today — strongest content opportunities
/queue — items waiting for review
/post — guided post drafting
/brief — client market brief draft
/calendar — upcoming content dates
/weekly — next week's mix

Existing specialist commands still work, but you do not need to memorize them.`

export const INTEL_MENU = `<b>Market Intel</b>

/brief — current client-market brief draft
/price &lt;asset&gt; — reference price
/chart &lt;asset&gt; — chart + live links
/calendar — important upcoming dates

Daily Intel and Macro Desk run behind the scenes; Telegram should surface the output, not the implementation.`

export const KNOWLEDGE_MENU = `<b>Knowledge</b>

/company-facts &lt;topic&gt; — versioned Satstreet facts
/ref &lt;page&gt; — read an approved Notion reference page

Examples:
/company-facts custody
/company-facts eligibility
/ref funding
/ref regulations`

export const SYSTEM_MENU = `<b>System</b>

Use /help for the full power-user list.
Use /whoami for Telegram access setup.

Implementation lives in GitHub and Notion's Automation Registry. Normal users should not need to open either to run everyday workflows.`

export function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('← Satstreet OS', 'os:home')
}
