# Competitor Intelligence Tracker v3.2.0

This release combines the complete v24 visual tracker with the robust authenticated scanning backend.

## Restored visual tracker
- Full News & updates, Insights, Competitors, Sources and Settings navigation
- Competitor cards, filters, comparison views, charts and embedded bike-focused photos
- Lemmo and the full competitor data set from v24

## Working backend
- Password protection for the tracker, admin area and APIs
- Persistent source configuration using Vercel Blob
- Manual **Scan now** control and scan history in `/admin`
- Scheduled daily refresh via `/api/refresh`
- Bike-focused relevance filtering and validation-item support
- Dynamic scanned-news endpoint at `/api/news`

## Deploy to Vercel
1. Replace the contents of the existing GitHub repository with this package and push.
2. In Vercel, set:
   - `SITE_PASSWORD` = your chosen password
   - `SESSION_SECRET` = a long random value
   - `CRON_SECRET` = a different long random value
   - Vercel Blob: connect a Blob store to the project. Private stores work; either `BLOB_READ_WRITE_TOKEN` or the store-id variable (`BLOB_STORE_ID` / `BLOB_READ_WRITE_TOKEN_STORE_ID`) is enough
3. Redeploy, preferably without the build cache.
4. Open the site in a private window. The login screen must appear before the tracker.
5. After login, use **Scanner admin** at the bottom-right or visit `/admin`.

## Important
Scanned items are stored and exposed through `/api/news`. The restored v24 interface retains its curated tracker dataset and all original visual features. Scanner administration remains separate so backend controls cannot break the tracker UI again.

## v3.0.1 corrections
- Version information is in the normal page footer, not a floating control.
- Scanner admin links to the Next.js `/admin` route.
- `/scanner-admin.html` is included as a direct fallback.
- The default BBC validation source is `BBC News - World`: `https://feeds.bbci.co.uk/news/world/rss.xml`. It is intentionally marked as validation content, not as a competitor source.

## v3.1.1 fixes
- Admin page script no longer crashes on load (missing log-download button and an undefined helper stopped every control from working).
- Add/edit source form no longer sends an empty name (`window.name` shadowed the field).
- Login redirect loop fixed: `/login` and `/login.html` are both public, since `cleanUrls` rewrites between them.
- Vercel Cron can now reach `/api/refresh` (it was blocked by the cookie check; the route still requires `CRON_SECRET`).
- Removed the `/admin` Next.js page that collided with `public/admin.html` and caused recursive iframes.
- Scanner: handles Atom multi-link entries, object-valued fields and invalid dates; stable article ids; per-source last success/error now recorded and shown in admin; 60s max duration on scan routes.

- Storage layer rewritten for **private** Blob stores (`access:'private'`, read via `get()`), and works with the store-id/OIDC setup Vercel creates when no static token variable exists. Read errors are no longer swallowed silently.

## v3.1.3
- Tracker now loads scanned articles from `/api/news` (merged with the curated items, newest first), refreshes every 60s while open and when the tab regains focus.
- "Run scan" was a fake 0.9s delay; it now calls `/api/rescan` and reloads the feed.
- Feed text from RSS is HTML-escaped and non-http(s) links are neutralised.

## v3.1.4
- Visual redesign: dark theme with large-numeral stats, hairline dividers, and blue/orange/green data colours.
- New stacked bar chart on Insights: news per brand split by priority.

## v3.2.0
- **Scanner now uses the tracker's full source list** (129 sources): a Google News search per brand, local-market feeds, and official/product websites. Websites are auto-checked for an RSS/Atom feed (advertised in the page, or at common paths such as `/feed` and `/blogs/news.atom`); the feed found is remembered. Sites with no feed are flagged `no-feed` in the scan report and retried weekly.
- Sources are scanned 10 at a time, least-recently-scanned first, with a time budget so a scan finishes inside Vercel's 60s limit. Anything deferred goes first next time.
- Brand filter: brand-specific sources keep items that mention the brand (so local-language articles are no longer dropped by the English bike-word filter). Duplicate links across sources are skipped.
- New **Social watch** tab: one button per Instagram / Facebook / LinkedIn / YouTube page, remembering when each was last opened on this device. **Log a post** saves what you find to `/api/manual`, so it appears in News and Insights.
- Sources you delete in `/admin` stay deleted; new seed sources are added automatically.

## v3.3.0
- **Add source now saves to the scanner** (the old button only added a row to a list kept in the browser). Paste a plain website link such as `https://bikebiz.com/`; the feed is found automatically. A feed link also works. **Check link** shows the latest headlines before saving.
- New **General** category for industry sources that cover many brands (BikeBiz is included). Headlines that name a tracked competitor are filed under that brand automatically; the rest stay under General. General is also a filter in News.
- Sources tab lists every scanned source with its last-scan status, with Pause/Resume and Remove. Social page links (Instagram, Facebook, LinkedIn, TikTok) are rejected with a pointer to Social watch.

## v3.3.1
- News feed: time range bar (Today / 7 days / 30 days / All time, remembered per browser), an "All brands" chip with selected brands always visible, and a first-load limit of 20 items with "Show 20 more". The page size resets when a filter changes but is kept across the 60s auto-refresh.
- The year dropdown is hidden in favour of the time range; summaries are clamped to two lines.
