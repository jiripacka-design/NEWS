# Competitor Tracker

Clean Next.js/Vercel deployment package.

## Required Vercel environment variables

- `SITE_PASSWORD`
- `SESSION_SECRET` - random 32+ character value
- `CRON_SECRET` - random 16+ character value
- `BLOB_READ_WRITE_TOKEN` - supplied when Vercel Blob is connected

## Features

- Shared-password login using a signed HTTP-only cookie
- Next.js 16 `proxy.js` route protection
- Daily news collection at 06:00 UTC
- Vercel Blob article storage
- Live article search and brand filtering

## Deploy

Upload the contents of this package to the repository root. Do not upload the ZIP itself. Delete any old `middleware.js` first.
