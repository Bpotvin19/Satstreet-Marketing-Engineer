# Internal terminal source

This directory preserves the existing protected team workspace while the client terminal is developed separately.

- `news.html` is the former mixed internal landing page.
- `assets/news-desk.js` renders the protected Macro Desk feed.
- `assets/team-workspace.js` renders staff, draft, prospect, and operating-system views.

Nothing in this directory is included in Netlify's `public/` publish directory. It is source for a future authenticated internal deployment, not a hidden client route. The existing internal APIs remain access-key protected and must not be linked from the client terminal.
