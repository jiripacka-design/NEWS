# Competitor Intelligence Tracker - Full Fix v3.0.0

This release combines the complete v24 visual tracker with the robust authenticated scanning backend.

## Restored visual tracker
- Full News & updates, Insights, Competitors, Sources and Settings navigation
- Competitor cards, filters, comparison views, charts and embedded bike-focused photos
- Lemmo and the full competitor data set from v24

## Working backend
- Password protection for the tracker, admin area and APIs
- Persistent source configuration using Vercel Blob
- Manual **Scan now** control and scan history in `/admin.html`
- Scheduled daily refresh via `/api/refresh`
- Bike-focused relevance filtering and validation-item support
- Dynamic scanned-news endpoint at `/api/news`

## Deploy to Vercel
1. Replace the contents of the existing GitHub repository with this package and push.
2. In Vercel, set:
   - `SITE_PASSWORD` = your chosen password
   - `SESSION_SECRET` = a long random value
   - `CRON_SECRET` = a different long random value
   - `BLOB_READ_WRITE_TOKEN` = Vercel Blob token
3. Redeploy, preferably without the build cache.
4. Open the site in a private window. The login screen must appear before the tracker.
5. After login, use **Scanner admin** at the bottom-right or visit `/admin.html`.

## Important
Scanned items are stored and exposed through `/api/news`. The restored v24 interface retains its curated tracker dataset and all original visual features. Scanner administration remains separate so backend controls cannot break the tracker UI again.
