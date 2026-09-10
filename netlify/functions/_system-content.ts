/* Markup for the "How Satstreet OS works" view.

   It lives here rather than in public/news.html because the page is served to
   anyone: content in that file is readable with View Source whether or not a
   tab is hidden, and news.html is the site's landing page.

   Plain HTML. Keep backticks and ${ out of it.
*/
export const SYSTEM_HTML = `
    <nav class="guide-nav" aria-label="Operating guide sections"><a href="#flow-title">Workflow</a><a href="#team-title">Your role</a><a href="#day-title">Day &amp; week</a><a href="#modules-title">Tools</a><a href="#readiness-title">Readiness</a><a href="#value-title">Value</a></nav>
    <section class="card system-hero">
      <div>
        <p class="eyebrow">The operating guide</p>
        <h2>One shared brief. Clear next actions.</h2>
        <p>Start with the market, choose the relationships and work that need attention, then prepare and review the next action. Use this guide to understand the workflow; private records stay in the team workspace.</p>
      </div>
      <div class="system-proof" aria-label="Operating system principles">
        <div class="proof-row"><b>Records &amp; priorities</b><span>Notion</span></div>
        <div class="proof-row"><b>Brief &amp; reference tools</b><span>This dashboard</span></div>
        <div class="proof-row"><b>Decisions &amp; external use</b><span>Human responsibility</span></div>
      </div>
    </section>

    <section class="card system-card" aria-labelledby="flow-title">
      <div class="section-intro"><h2 id="flow-title">How information moves through the system</h2><p>The intended handoff: each step uses the previous output, and a person reviews material before external use.</p></div>
      <div class="system-flow">
        <article class="flow-step"><span class="flow-num">01 · CAPTURE</span><h3>Monitor the market</h3><p>Macro, crypto, regulation, geopolitics, market prices and social signals are scanned through defined research windows.</p></article>
        <article class="flow-step"><span class="flow-num">02 · STRUCTURE</span><h3>Write to Notion</h3><p>Daily Intel, client resources and content knowledge are organized in one source of truth rather than scattered across tabs and chats.</p></article>
        <article class="flow-step"><span class="flow-num">03 · DECIDE</span><h3>Choose the next action</h3><p>Choose the relevant relationship, client question or content opportunity. Assign an owner and a next step in the team workspace.</p></article>
        <article class="flow-step"><span class="flow-num">04 · ACTIVATE</span><h3>Put it to work</h3><p>Review the draft and its evidence. Obtain required approval, then deliberately send or publish. Record the outcome separately from approval.</p></article>
      </div>
    </section>

    <section class="card system-card" aria-labelledby="team-title">
      <div class="section-intro"><h2 id="team-title">Where each team starts</h2><p>Use the brief to prepare. Keep ownership and outcomes in the existing team records.</p></div>
      <div class="module-grid">
        <article class="module-card"><span class="module-label">Sales &amp; relationships</span><h3>Choose who needs a conversation</h3><p>Review priority relationships, follow-ups and referrals. Adapt the relevant research to the conversation, then record the next step.</p></article>
        <article class="module-card"><span class="module-label">Trading &amp; client service</span><h3>Explain what matters</h3><p>Check market context and source dates. Use approved educational resources to answer recurring questions; obtain executable quotes from the desk.</p></article>
        <article class="module-card"><span class="module-label">Content &amp; review</span><h3>Prepare, check, then publish</h3><p>Develop a sourced draft, review company claims and obtain required sign-off. Approval is a separate step from sending or publishing.</p></article>
      </div>
    </section>
    <div class="cadence-grid">
      <section class="card">
        <header><h2 id="day-title">A normal day</h2><span class="eyebrow">Operating rhythm</span></header>
        <ol class="rhythm">
          <li><time>Before 8:30</time><span>Check that the morning brief exists and its date is current. If it is missing or stale, check the source before relying on it.</span></li>
          <li><time>Morning</time><span>Read the top stories and catalysts. Choose the day's priority relationships, follow-ups and decisions in Notion.</span></li>
          <li><time>During day</time><span>Use the research for calls and drafts. Review material developments, approve the work that is ready and resolve blocked handoffs.</span></li>
          <li><time>End of day</time><span>Record conversations and next steps. Capture recurring questions and flag missing outputs for the responsible owner.</span></li>
        </ol>
      </section>
      <section class="card">
        <header><h2>A normal week</h2><span class="eyebrow">Compounding workflow</span></header>
        <ol class="rhythm">
          <li><b>MONDAY</b><span>Choose priority relationships and referrals. Confirm owners and the outcomes to pursue this week.</span></li>
          <li><b>THURSDAY</b><span>Turn the week's approved intelligence into inputs for Mike's newsletter and supporting social content.</span></li>
          <li><b>FRIDAY</b><span>Review what generated conversations, refine the system and set the following week's priorities.</span></li>
          <li><b>TUE–WED</b><span>Research prospects, follow up with relationships and improve resources using recurring client questions.</span></li>
        </ol>
      </section>
    </div>

    <section class="card system-card" aria-labelledby="modules-title">
      <div class="section-intro"><h2 id="modules-title">What has been built</h2><p>Open the reference tools here. Work queues and private records remain in Notion; this guide does not display live queue counts.</p></div>
      <div class="module-grid">
        <article class="module-card"><span class="module-label">Intelligence</span><h3>Markets and Macro Desk</h3><p>Live reference prices, charts, ranked news, catalysts and a Satstreet-specific interpretation.</p><div class="module-links"><a href="./ticker.html">Markets</a><a href="./chart.html">Charts</a><a href="./news.html">Macro Desk</a></div></article>
        <article class="module-card"><span class="module-label">Trading context</span><h3>Structure and Treasuries</h3><p>Tools that help the team explain market structure and frame corporate treasury conversations.</p><div class="module-links"><a href="./structure.html">Structure</a><a href="./treasuries.html">Treasuries</a></div></article>
        <article class="module-card"><span class="module-label">Client experience</span><h3>Resources and Portfolio</h3><p>Educational resources for clients and watch-only Bitcoin analytics. Portfolio estimates are not Satstreet account balances or tax cost basis.</p><div class="module-links"><a href="./resources.html">Resources</a><a href="./portfolio.html">Portfolio</a></div></article>
        <article class="module-card"><span class="module-label">Knowledge layer</span><h3>Notion workspace</h3><p>Research, priority relationships, content queues, approvals and decisions have their working records in Notion.</p></article>
        <article class="module-card"><span class="module-label">Content engine</span><h3>Telegram, social and newsletter</h3><p>Telegram supports research and drafting. Reuse source material for social posts, client drafts and the weekly newsletter; review each output before use.</p></article>
        <article class="module-card"><span class="module-label">Governance</span><h3>Human review stays central</h3><p>Check evidence, company claims and required approvals. A bot screen supports review; it does not grant approval or confirm publication.</p></article>
      </div>
    </section>

    <section class="card system-card" aria-labelledby="readiness-title">
      <div class="section-intro"><h2 id="readiness-title">Know what is ready to use</h2><p>This guide describes the workflow. It is not a live automation health monitor.</p></div>
      <div class="value-grid">
        <article class="value-item"><h3>Reference tools</h3><p>Open the tools above and check their source dates. Missing or delayed data should remain visibly unavailable.</p></article>
        <article class="value-item"><h3>Scheduled work</h3><p>Confirm the last successful run and open its output in the team workspace. A schedule or “Live” label alone is not evidence of a completed run.</p></article>
        <article class="value-item"><h3>External communication</h3><p>Check the reviewer and approval record. Send or publish deliberately, then save the outcome. Escalate missing ownership or evidence.</p></article>
      </div>
    </section>
    <section class="card system-card" aria-labelledby="value-title">
      <div class="section-intro"><h2 id="value-title">The value proposition</h2><p>Measure the system by time saved, useful conversations and completed handoffs.</p></div>
      <div class="value-grid">
        <article class="value-item"><h3>Less duplicated work</h3><p>Reuse a sourced brief across the team. Track time spent preparing calls and drafts to see whether that reuse saves work.</p></article>
        <article class="value-item"><h3>More consistent judgment</h3><p>Make priorities, evidence and owners visible. Track approval turnaround and missed or stale handoffs.</p></article>
        <article class="value-item"><h3>Better client conversations</h3><p>Use relevant context to start useful conversations. Track replies, meetings and next steps rather than counting bot outputs.</p></article>
      </div>
    </section>

    <section class="card presentation-close">
      <div><h2>The principle: automate preparation, preserve judgment.</h2><p>Satstreet OS gives the team more time for high-value human work—relationships, decisions and execution.</p></div>
      <button class="btn" id="open-desk" type="button">Open today's brief</button>
    </section>
  
`
