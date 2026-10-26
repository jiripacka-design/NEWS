# Competitor Intelligence Tracker v2.1.0

## Required Vercel environment variables
- SITE_PASSWORD
- SESSION_SECRET (32+ random characters)
- CRON_SECRET (16+ random characters)
- BLOB_READ_WRITE_TOKEN (created by connecting Vercel Blob)

## Features
- Site-managed RSS, Google News and validation sources
- BBC News World preconfigured as a validation source
- Manual rescan and 3-hour Vercel Cron schedule
- Incremental article history, stable deduplication, source health, scan history and locking
- All runtime data persisted in Vercel Blob; no local file editing required

After deployment, open `/admin` and run the first scan.

## Hobby schedule
Automatic scan: daily at 06:00 UTC. Manual rescans remain available from `/admin`.
