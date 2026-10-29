# Competitor Intelligence Tracker v3.6.0

Next.js app for Vercel: a password-protected tracker (news scanner, social watch, insights, product matrix, competitor profiles, weekly digest) with a scanner admin at `/admin`.

## Deploy to Vercel
1. Replace the repository contents with this package and push.
2. Environment variables: `SITE_PASSWORD`, `SESSION_SECRET` (long random), `CRON_SECRET` (different long random). Connect a Vercel Blob store (private stores work).
3. Optional digest: `SLACK_WEBHOOK_URL`, or `RESEND_API_KEY` + `DIGEST_TO` (+ `DIGEST_FROM`). It sends Mondays 07:00 UTC; use **Send now** on the Watchlist to test.
4. Redeploy (without build cache) and check the login screen appears first.

Local development: `CI_LOCAL_STORE=./.data npm run dev` keeps data on disk instead of Blob. Tests: `npm test`.

## What is in it
- **Watchlist** (opening page), **News & updates** (time range, event types, pictures), **Social watch**, **Insights** (momentum, what changed, regions, data coverage), **Product matrix**, **Competitors** (profiles, company panel, where-they-sell map, photo fetch), **Sources** (scanner sources and scanner status).
- The scanner reads 129+ sources daily (and on **Run scan**); add a website or feed under Sources > Add source.

## v3.6.0 (merge of v3.4.0 "Compare" and v3.5.0)
**Merged.** v3.5.0 was the base: it contains everything in the v3.4.0 logging build plus the product-manager release. The v3.4.0 Compare tab was replaced by the Product matrix, which does the same job with more fields, partial-update imports and the price map.

**Product matrix now has every field on brompton.com's Specification list:** weight, speed, material, folded size, main frame, rear frame, fork, grips, seatpost, saddle, seat clamp, hinge clamps, pedals, drivetrain, chainset, bottom bracket, headset, shifters, sprockets, derailleur, rear wheel, front wheel, tyres, tubes, mudguards, lighting, roller wheels, rack, brakes, front carrier, plus colours, handlebar options, price, wheel size and the electric fields (motor, battery, range). Rows are grouped; empty rows are hidden unless you tick "Show rows with no data". Each model shows a "% of specs filled" bar. Folded size is entered as height, width, depth (cm). CSV import/export has all columns (`foldD` is accepted for `foldL`, `speed` for `gears`).

**Researched data.** Product matrix > **Load researched data** loads 13 models with sources (see `starter-data/README.md`). The Brompton C Line 12-speed MY27 row matches the page you linked (GBP 1,809, 12.5 kg).

**Removed**
- **Settings page.** Its only content was a "Monitoring status" box that printed the first 10 brand names next to the word "Configured" regardless of what was happening. Replaced by a real **Scanner status** line on Sources and a **Last scan** tile on News.
- **Sources > Reference list** (a 129-row table saved only in your browser, never read by the scanner) and its Save / Export / Import buttons. Social watch keeps using the built-in social links.
- Old compare/charts code from v3.4.0 and the fixed "37 brands" and "Refresh: while open" tiles.

**Fixed**
- `package-lock.json` pointed all 93 packages at a Microsoft-internal feed (`ms-feed-25.pkgs.visualstudio.com`); `npm ci` failed outside that network. Now points to registry.npmjs.org (same integrity hashes).
