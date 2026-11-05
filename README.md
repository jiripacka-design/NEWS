# Brompton Enemies v3.13.0

Next.js app for Vercel: a password-protected tracker (news scanner, social watch, insights, product matrix, competitor profiles, weekly digest) with a scanner admin at `/admin`.

## Deploy to Vercel
1. Replace the repository contents with this package and push.
2. Environment variables: `SITE_PASSWORD`, `SESSION_SECRET` (long random), `CRON_SECRET` (different long random). Connect a Vercel Blob store (private stores work).
3. Optional, personal sign-ins: `SITE_USERS` = `Jiri:password1, Anna:password2` (each person signs in with their own name and password; the shared `SITE_PASSWORD` then stops working). Without it, people sign in with the shared password and type their name, which is shown on their changes.
4. Optional email alerts (market changes, at most once a day): `RESEND_API_KEY` + `ALERTS_TO` (falls back to `DIGEST_TO`), optional `SITE_URL` for the link in the email.
5. Optional digest: `SLACK_WEBHOOK_URL`, or `RESEND_API_KEY` + `DIGEST_TO` (+ `DIGEST_FROM`). It sends Mondays 07:00 UTC; use **Send now** on the Watchlist to test.
4. Redeploy (without build cache) and check the login screen appears first.

Local development: `CI_LOCAL_STORE=./.data npm run dev` keeps data on disk instead of Blob. Tests: `npm test`.

## What is in it
- Sections run across the top: **News & updates** (opening page), **Insights** (watchlist, momentum, portfolio and volumes, price chart, regions, activity, data gaps), **Social watch**, **Product Comparison** (compare up to 6), **Competitors** (profiles, company panel, where-they-sell map, pictures), **Sources** (source manager and scanner status).
- The scanner reads 129+ sources daily (and on **Run scan**); add a website or feed under Sources > Add source.

## v3.13.0
1. **Price history.** Every list price saved (by hand, Collect data or a re-check) and every street price read is kept with its date. **Insights › Charts › Price history** draws each model's price over time with street prices as dots, and lists every change (was, now, %, who or what found it).
2. **Email alerts.** List and street price changes, new and discontinued models, product pages that have gone, and spec changes found by re-checks are emailed at most once a day (after the morning scan) and after the Monday re-check. Set `RESEND_API_KEY` and `ALERTS_TO`. Status, the waiting alerts and **Send now** are in **History › Email alerts**.
3. **Discontinued models.** **Mark as discontinued** (Collect data, or when a re-check finds the product page has gone, or when an AI re-check says so). Discontinued models stay saved with their history, are tagged, and are left out of gaps, re-checks, charts and counts; **Include discontinued models** on Charts brings them back. **Back on sale** undoes it.
4. **Street prices.** Add shop links to a model in Collect data (Evans, Halfords, Tredz and so on). Their prices are read every Monday (or **Check now**), shown against the list price, kept in the price history and alerted on when they move. The battle card shows the lowest one.
5. **Named sign-ins, edit history and Undo.** Sign-in asks for your name (or uses personal passwords with `SITE_USERS`), and your initials show top right. **History** lists every change to models and brand profiles: who, when, how (by hand, Collect data, re-check, AI re-check, undo) and the values before and after. **Undo** puts the old values back, warns if they have been changed again since, and is itself recorded.
6. **Backups.** A backup of everything entered (models, brands, sources, tags, history, prices, alerts) is made every Monday; the last 12 are kept. **History › Backups**: make one now, download any of them or the current data, or restore one (a safety backup is made first).
7. **Battle card.** **Product Comparison › Battle card** (or from Head-to-head): one printable A4 page for our model against its three closest-priced rivals (changeable), with the specs side by side and the best in each row marked, **Where we win** and **Objections to expect** worked out from the figures, and what we know about each rival: threat level, strengths and weak spots, price moves and news from the last 90 days.
8. Fixes: the re-check job could not run on its own in v3.12 (the sign-in check blocked it); the weekly job now also reads street prices. Shorter menu labels so all sections fit.

## v3.12.0
1. **A picture per model.** Every model can have its own picture (a C Line and a G Line look different). Set it in Collect data (open a model: **Upload a picture**, or **Use the product page's picture**, which finds the picture on the model's page and opens it in the crop editor), from the thumbnails in a competitor's profile, or on the Product Comparison. Model pictures now show on the competitor cards (a strip of the brand's models), in profiles, in Head-to-head, and stand in for the brand picture when a brand has none. Reading a product page in Collect data also offers the page's picture.
2. **Re-check (refresh and validate).** Every model shows when its specs were last verified; anything older than 90 days is marked out of date. **Re-check** re-reads the product pages (one model, one brand, or every out-of-date model) and lists what changed against what is saved: changed and new values are ticked, nothing is saved until you press Save, and unchanged models are marked verified today. For company facts and models without a page link, **Ask an AI › Re-check what we have** sends everything saved with its date and asks the AI to confirm or correct each value; changes are ticked and everything confirmed is marked verified. **Mark as verified today** records a check you did yourself. A monthly job (1st of the month, 05:00 UTC) re-checks out-of-date models on its own and leaves any changes waiting for review in Collect data. Logic in `lib/recheck.js`, API `/api/recheck`.

## v3.11.0
1. **Collect data, rebuilt.** One brand at a time in three steps on one card. **1. What is missing**: the empty company facts and every model with its number of empty specs; select one to jump straight to its box. **2. Get the details**, four ways: **Read a product page** (paste a link; the price, weight and specification table are read from the page by a script, `/api/extract`), **Ask an AI** (copy the request, or open ChatGPT, Claude or Perplexity with it already typed in; the answer is checked the moment you paste it), **Paste text or a file**, or **Type it in** (only the empty fields). **3. Check and save**: every value is checked; new values are ticked, replacements are not, and anything that could not be used is listed with the reason. A € or $ price given as the £ price is now kept as the € or $ price instead of being thrown away.
2. **Field sizes.** Number boxes are short, text boxes medium, and filters size to their content instead of stretching across the page. Typed brand facts are checked as you leave the box, with the reason shown underneath.
3. **Markets map.** The browser's own tooltip no longer sits on top of the hover panel. Two colourings: **Number of competitors** (a warm scale, brighter = more) and **Us vs them** (orange: competitors only, green: both, blue: only us). Zoom to Europe, the Americas or Asia Pacific. Colours are checked for colour-blind separation and contrast.
4. **Charts.** Each competitor brand has its own colour (Brompton stays #002fa7), hover shows a clear label, and the price-vs-spec charts no longer join a brand's models with a line. New at the top of Charts: **where our model stands** (how many competitor models are cheaper, lighter or fold smaller; price rivals within ±15%), measured against any model you pick. New view: **Head-to-head**, every competitor model against ours on price, weight and folded size, blue where we are ahead and orange where they are, closest price first.
5. **Duplicate check in News.** The same story from several feeds (Google News, the publisher, trade sites) shows once, with "Also reported by". Exact repeats are not stored at all; similar headlines are folded and can be shown with **Show repeats** or split with **Not a duplicate**. The weekly digest counts each story once. Logic in `lib/dedupe.js`.
6. **Menu at the top.** The sections run left to right in the header; the page uses the full width.
7. **Polish.** No sideways scroll (the scan ring was 300px wide while hidden), no scrollbar shift between pages, Insights no longer redraws every minute unless the news changed, the comparison header sticks below the menu, the toast fades, "How to read this" stays as you left it, tighter tiles on phones.

## v3.10.0
**Collect data is now one guided page.** Pick a brand (the page suggests where to start: our brand, then your watchlist, then the biggest gaps). Then either **A. let an AI find it** (copy one ready-made request for that brand, paste it into an AI, paste the answer back, check the preview, save) or **B. type what you know** (only the missing brand facts and model specs are shown; tick *Not published* when a company does not say, so it stops nagging). Brand facts and models are handled together, models can be added on the spot, and **Next brand with gaps** keeps you moving. Spreadsheets and bulk AI requests for many brands at once are under "Many brands at once".

## v3.9.1
- **Product Comparison accepts any model in any column**, so all Brompton models (C Line, P Line, T Line and so on) can be added and two or more Bromptons compared. Before, the picker only listed competitor brands. The first column is the baseline: the "vs us" differences are measured against it. "null" is no longer accepted as a model name on import or save.

## v3.9.0
**Merged with your uploaded "Collect data" build.** Your v3.8.0 zip and my v3.8.0 were two separate builds of 3.7.0. This one keeps Collect data (import with a preview, checklist, AI brief) and adds everything below.

1. **Remove and clean up.** Any source can be removed, including the built-in BBC and validation feeds (restorable). Removing or pausing a source asks what to do with its articles: keep, archive (hidden but kept) or delete for good. Articles have Archive / Delete buttons, a "Show archived" filter and a "Clean up…" button that acts on whatever the filters show. Deleted articles are remembered so a source that is still active does not bring them back. Competitors can be added (with news sources created for them) and removed (sources, articles and models are your choice); built-in ones can be restored.
2. **Map hover panel.** Hover a country to see who sells there, in a panel inside the map that opens on whichever side has room.
3. **Charts.** The price ladder is easier to read. Four new views: Rankings, Volume vs value, Range breadth, Share of voice.
4. **One import for everything.** Collect data now reads model specs *and* brand facts (volumes, SKUs, P&A, offers, regions) from a spreadsheet, pasted text or an AI answer, shows a preview, creates a competitor if the brand is new, and then lists where the data now appears. New fields: product line (e.g. C Line), € and $ prices, brand "Offers".
5. **Pictures.** Brand and model pictures open in an editor: drag, zoom, trim white space, guides. Models can have their own picture.
6. **Priority** is now a score (our brand, watchlist threat, type of news, recency) with the reasoning on hover, instead of a keyword test that said "Medium" for almost everything.
7. **Event tags** use weighted scoring with a confidence level; uncertain ones are marked. Three new types: Review / test, Award / event, People.
8. **Run scan** draws a blue ring clockwise from top-centre as sources are read (/api/progress).

Fixed: live articles and several controls (search, priority, year, category filter, dialog close) had stopped working in 3.7 and 3.8; restored, with a test.

## v3.8.0
- **Renamed Brompton Enemies.** Product Comparison is now **Product Comparison**.
- **Colours.** Brompton is #002fa7 everywhere (news feed, tables, cards, charts, map). Everyone else uses the palette #000000, #707070, #DBDBDB, #F6F6F6, #FFFFFF. In the news feed, Brompton items get a blue card, blue edge, blue date block and a BROMPTON pill.
- **Insights** now opens on **Markets**, then Overview, Portfolio and volumes, Charts and Data gaps. Activity is removed (the weekly digest moved to the bottom of Overview). Sections are bordered cards with a collapsible "How to read this" box.
- **Markets** is a **flat** world map (Miller cylindrical, no globe curve) with the same data as the competitor profiles: pick all competitors, the watchlist or one brand; select a country to see who sells there; a table lists the countries with the most competitors, with a filter for places where we do not sell. The region table sits underneath.
- **Charts**: Pareto line removed. Five views: Price ladder (range per brand, with our range as a blue band), Price vs weight, Price vs folded size, Portability map (weight vs folded size, bubble = price) and E-bikes price vs battery. Brands listed beside the chart are now always plottable; brands missing a value for the chosen view are listed separately with the reason. Models priced only in € or $ are converted to £ at editable approximate rates (default €1 = £0.85, $1 = £0.74).
- **Product Comparison**: × on each competitor card to remove it; the dashed **+ Add a model** card opens a searchable picker; **Change model** swaps a column. New product fields: price in € and price in $.
- **/world-map.js** was regenerated from Natural Earth (public domain) with the antimeridian wrapped correctly.

## v3.7.0
1. **News is the opening page.** Menu order: News, Insights, Social watch, Product Comparison, Competitors, Sources.
2. **Watchlist and Insights are one page** with six tabs: Overview (brands to watch, 7-day changes, momentum), Portfolio and volumes, Price vs spec, Markets, Activity, Data gaps. Every table has a one-line plain-English explanation of each metric.
3. **Portfolio and volumes (new):** units per year, revenue, revenue per bike, SKUs, models tracked, price range, P&A (parts and accessories) products and offering. New brand fields: P&A products, P&A offering, year of the figures. Low-confidence figures (for example Dahon's own 1 million claim) are flagged, not hidden.
4. **Product Comparison is now an Apple-style compare:** up to 6 models across the full width, sticky model cards with a picker in each column, large section headings, "show only differences". Use **Show menu / Full width** to toggle the side menu.
5. **Price vs spec chart** (Insights): one line per brand, labels on the right, Pareto line, Linear/Log, brand list with toggles.
6. **"Download rebuilt tracker" removed.** Update picture now saves the picture on the server for everyone.
7. **Export, fill in, import:** Competitors and Insights have **Export brand data** (CSV with every brand and every field) and **Import**. Empty cells are ignored, so nothing is wiped. Product Comparison **Export CSV** now also lists brands that have no models yet as empty rows; rows without a model name are skipped on import.
8. **Sources is the source manager** (the old /admin page now redirects there): add, edit, pause, remove, restore removed built-in sources, scan history, scan log download, and a test-article tool. The two built-in system sources (BBC validation feed and the Tracker Validation Feed) can be paused but no longer deleted; the API refuses.

Also fixed: the "pick a picture" action was attached to every button with the `imagebtn` style, so some buttons could open a file chooser instead of doing their job.

## v3.6.0 (merge of v3.4.0 "Compare" and v3.5.0)
**Merged.** v3.5.0 was the base: it contains everything in the v3.4.0 logging build plus the product-manager release. The v3.4.0 Compare tab was replaced by the Product Comparison, which does the same job with more fields, partial-update imports and the price map.

**Product Comparison now has every field on brompton.com's Specification list:** weight, speed, material, folded size, main frame, rear frame, fork, grips, seatpost, saddle, seat clamp, hinge clamps, pedals, drivetrain, chainset, bottom bracket, headset, shifters, sprockets, derailleur, rear wheel, front wheel, tyres, tubes, mudguards, lighting, roller wheels, rack, brakes, front carrier, plus colours, handlebar options, price, wheel size and the electric fields (motor, battery, range). Rows are grouped; empty rows are hidden unless you tick "Show rows with no data". Each model shows a "% of specs filled" bar. Folded size is entered as height, width, depth (cm). CSV import/export has all columns (`foldD` is accepted for `foldL`, `speed` for `gears`).

**Researched data.** Product Comparison > **Load researched data** loads 13 models and the researched brand figures, with sources (see `starter-data/README.md`). The Brompton C Line 12-speed MY27 row matches the page you linked (GBP 1,809, 12.5 kg).

**Removed**
- **Settings page.** Its only content was a "Monitoring status" box that printed the first 10 brand names next to the word "Configured" regardless of what was happening. Replaced by a real **Scanner status** line on Sources and a **Last scan** tile on News.
- **Sources > Reference list** (a 129-row table saved only in your browser, never read by the scanner) and its Save / Export / Import buttons. Social watch keeps using the built-in social links.
- Old compare/charts code from v3.4.0 and the fixed "37 brands" and "Refresh: while open" tiles.

**Fixed**
- `package-lock.json` pointed all 93 packages at a Microsoft-internal feed (`ms-feed-25.pkgs.visualstudio.com`); `npm ci` failed outside that network. Now points to registry.npmjs.org (same integrity hashes).
