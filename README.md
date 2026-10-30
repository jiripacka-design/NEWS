# Competitor Intelligence Tracker v3.8.0

Next.js app for Vercel: a password-protected tracker (news scanner, social watch, insights, product matrix, competitor profiles, weekly digest) with a scanner admin at `/admin`.

## Deploy to Vercel
1. Replace the repository contents with this package and push.
2. Environment variables: `SITE_PASSWORD`, `SESSION_SECRET` (long random), `CRON_SECRET` (different long random). Connect a Vercel Blob store (private stores work).
3. Optional digest: `SLACK_WEBHOOK_URL`, or `RESEND_API_KEY` + `DIGEST_TO` (+ `DIGEST_FROM`). It sends Mondays 07:00 UTC; use **Send now** on the Watchlist to test.
4. Redeploy (without build cache) and check the login screen appears first.

Local development: `CI_LOCAL_STORE=./.data npm run dev` keeps data on disk instead of Blob. Tests: `npm test`.

## What is in it
- **News & updates** (opening page), **Insights** (watchlist, momentum, portfolio and volumes, price chart, regions, activity, data gaps), **Social watch**, **Product matrix** (compare up to 6), **Competitors** (profiles, company panel, where-they-sell map, pictures), **Sources** (source manager and scanner status).
- The scanner reads 129+ sources daily (and on **Run scan**); add a website or feed under Sources > Add source.

## v3.8.0 - Collect data (new page, between Product matrix and Competitors)
1. **Import.** Paste a spec table copied from a product page, an AI answer (JSON) or a spreadsheet (CSV/tab), or drop a file on the box. It is read automatically (labels like "Weight", "Folded size", "Brakes" on one line or two; lb, mm, inches, miles and volts x amp-hours are converted), matched to a model (by id, name or closest name) and shown in a preview. Values that fill a blank are ticked; values that would replace something you already have are not. Nothing is saved until you press the button, and empty cells never wipe anything (this also now applies to the Product matrix **Import CSV**).
2. **Checklist.** Every model with its missing values, grouped like the Brompton spec list. Type a value and press Enter, or tick **Not published** when the maker does not say; both finish the row. Progress bars per model and overall. Electric fields are only asked for e-bikes. Brands with no models can be added by name.
3. **AI brief.** A ready-to-paste prompt listing what is missing per model (with ids, what is already known and the format of each field). It tells the AI to use the maker's page, never guess, and answer with JSON only. Pick missing values or "models for brands that have none", a brand, and how many per brief. Paste the AI's answer into Import and check the preview.
- New fields: rider height, max load (kg), warranty, and a per-model "not published" list. Specs live in `public/collect.js` (reading, checking and brief code, tested in `tests/collect.test.js`).

## v3.7.0
1. **News is the opening page.** Menu order: News, Insights, Social watch, Product matrix, Competitors, Sources.
2. **Watchlist and Insights are one page** with six tabs: Overview (brands to watch, 7-day changes, momentum), Portfolio and volumes, Price vs spec, Markets, Activity, Data gaps. Every table has a one-line plain-English explanation of each metric.
3. **Portfolio and volumes (new):** units per year, revenue, revenue per bike, SKUs, models tracked, price range, P&A (parts and accessories) products and offering. New brand fields: P&A products, P&A offering, year of the figures. Low-confidence figures (for example Dahon's own 1 million claim) are flagged, not hidden.
4. **Product matrix is now an Apple-style compare:** up to 6 models across the full width, sticky model cards with a picker in each column, large section headings, "show only differences". Use **Show menu / Full width** to toggle the side menu.
5. **Price vs spec chart** (Insights): one line per brand, labels on the right, Pareto line, Linear/Log, brand list with toggles.
6. **"Download rebuilt tracker" removed.** Update picture now saves the picture on the server for everyone.
7. **Export, fill in, import:** Competitors and Insights have **Export brand data** (CSV with every brand and every field) and **Import**. Empty cells are ignored, so nothing is wiped. Product matrix **Export CSV** now also lists brands that have no models yet as empty rows; rows without a model name are skipped on import.
8. **Sources is the source manager** (the old /admin page now redirects there): add, edit, pause, remove, restore removed built-in sources, scan history, scan log download, and a test-article tool. The two built-in system sources (BBC validation feed and the Tracker Validation Feed) can be paused but no longer deleted; the API refuses.

Also fixed: the "pick a picture" action was attached to every button with the `imagebtn` style, so some buttons could open a file chooser instead of doing their job.

## v3.6.0 (merge of v3.4.0 "Compare" and v3.5.0)
**Merged.** v3.5.0 was the base: it contains everything in the v3.4.0 logging build plus the product-manager release. The v3.4.0 Compare tab was replaced by the Product matrix, which does the same job with more fields, partial-update imports and the price map.

**Product matrix now has every field on brompton.com's Specification list:** weight, speed, material, folded size, main frame, rear frame, fork, grips, seatpost, saddle, seat clamp, hinge clamps, pedals, drivetrain, chainset, bottom bracket, headset, shifters, sprockets, derailleur, rear wheel, front wheel, tyres, tubes, mudguards, lighting, roller wheels, rack, brakes, front carrier, plus colours, handlebar options, price, wheel size and the electric fields (motor, battery, range). Rows are grouped; empty rows are hidden unless you tick "Show rows with no data". Each model shows a "% of specs filled" bar. Folded size is entered as height, width, depth (cm). CSV import/export has all columns (`foldD` is accepted for `foldL`, `speed` for `gears`).

**Researched data.** Product matrix > **Load researched data** loads 13 models and the researched brand figures, with sources (see `starter-data/README.md`). The Brompton C Line 12-speed MY27 row matches the page you linked (GBP 1,809, 12.5 kg).

**Removed**
- **Settings page.** Its only content was a "Monitoring status" box that printed the first 10 brand names next to the word "Configured" regardless of what was happening. Replaced by a real **Scanner status** line on Sources and a **Last scan** tile on News.
- **Sources > Reference list** (a 129-row table saved only in your browser, never read by the scanner) and its Save / Export / Import buttons. Social watch keeps using the built-in social links.
- Old compare/charts code from v3.4.0 and the fixed "37 brands" and "Refresh: while open" tiles.

**Fixed**
- `package-lock.json` pointed all 93 packages at a Microsoft-internal feed (`ms-feed-25.pkgs.visualstudio.com`); `npm ci` failed outside that network. Now points to registry.npmjs.org (same integrity hashes).
