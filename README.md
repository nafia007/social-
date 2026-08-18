# Social Scheduler

A full-stack multi-platform social media scheduler built with **Next.js (App Router)**, **Clerk** for authentication, **Prisma** + **PostgreSQL**, and **Vercel Cron** for scheduling.

## Features

- 🔐 **Clerk Authentication** + **Organizations (Teams)** with role-based access (OWNER/ADMIN/MEMBER/VIEWER)
- 🔗 **Multi-Platform OAuth** - Connect X (Twitter), LinkedIn, Instagram, and Facebook accounts (tokens encrypted at rest, AES-256)
- 🖼️ **Media Pipeline** - S3 presigned uploads for images/videos/carousels, per-platform media handling
- 📝 **Post Scheduling** - Schedule posts for future publishing or publish immediately
- 🔁 **Resilient Publishing Queue** - BullMQ + Redis with exponential backoff, 429/rate-limit aware retry, dead-letter
- 🚦 **Per-Platform Rate Limiting** - token-bucket limiter backed by DB buckets
- 📊 **Analytics** - platform metrics (impressions, engagements, likes, comments, shares, reach) + charting
- 🪝 **Webhook Ingestion** - verified Meta & X webhooks; mention → in-app notification
- 🤖 **AI Assist** - OpenAI post generation, improvement, and hashtag suggestions
- 📰 **RSS Auto-Posting** - poll feeds and auto-schedule posts from new items
- ⏰ **Best-Time Scheduling** - suggests optimal post times from historical engagement
- ♻️ **Evergreen Recycling** - automatically re-schedules top evergreen posts
- 🔔 **Notifications** - in-app + optional email alerts for publish/failure/mentions
- 🔑 **API Keys** - programmatic access via bearer tokens (per-user/team)
- 🛠️ **Admin Observability** - queue jobs + webhook event inspection endpoints

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Authentication | Clerk |
| Database | PostgreSQL with Prisma ORM |
| Scheduling | Vercel Cron Jobs |
| Styling | Tailwind CSS + Clerk shadcn theme |
| Encryption | crypto-js (AES-256) |
| Validation | Zod |

## Project Structure

```
social-scheduler/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── (auth)/            # Clerk sign-in/sign-up pages
│   │   ├── api/
│   │   │   ├── auth/          # OAuth connect & callback routes
│   │   │   ├── accounts/      # Account management API
│   │   │   ├── posts/         # Post scheduling API
│   │   │   ├── cron/          # Cron job for publishing
│   │   │   └── webhooks/      # Clerk webhook handler
│   │   ├── layout.tsx         # Root layout with ClerkProvider
│   │   └── page.tsx           # Dashboard page
│   ├── components/
│   │   ├── Header.tsx         # Navigation header
│   │   ├── Dashboard.tsx      # Main dashboard with tabs
│   │   ├── AccountCard.tsx    # Connect/disconnect accounts
│   │   ├── PostScheduler.tsx  # Create/schedule posts
│   │   └── PostList.tsx       # View scheduled posts
│   ├── lib/
│   │   ├── encryption.ts      # AES encryption for tokens
│   │   ├── prisma.ts          # Prisma client singleton
│   │   └── social/
│   │       ├── oauth.ts       # Base OAuth client
│   │       ├── x.ts           # X (Twitter) API client
│   │       ├── linkedin.ts    # LinkedIn API client
│   │       ├── meta.ts        # Meta (Instagram/Facebook) client
│   │       └── publisher.ts   # Post publishing engine
│   └── middleware.ts          # Clerk middleware
├── vercel.json                # Cron job configuration
└── package.json
```

## Setup Instructions

### 1. Prerequisites

- Node.js 20.9.0 or higher
- PostgreSQL database (local or hosted like Supabase/Neon)
- Clerk account (free tier available)
- Developer accounts for each social platform you want to support

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

### 4. Configure Clerk

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com/)
2. Create a new application
3. Get the API keys and add to `.env.local`
4. Configure the webhook endpoint:
   - Go to **Webhooks** in Clerk dashboard
   - Add endpoint: `https://your-domain.com/api/webhooks/clerk`
   - Subscribe to events: `user.created`, `user.updated`, `user.deleted`
   - Copy the webhook secret to `CLERK_WEBHOOK_SECRET`

### 5. Configure Social Media APIs

#### X (Twitter)
1. Go to [developer.twitter.com](https://developer.twitter.com/en/portal/dashboard)
2. Create an app and get API credentials
3. Add OAuth 2.0 callback URL: `http://localhost:3000/api/auth/callback/x`
4. Required scopes: `tweet.read`, `tweet.write`, `users.read`, `offline.access`

#### LinkedIn
1. Go to [linkedin.com/developers](https://www.linkedin.com/developers/)
2. Create an app and get credentials
3. Add redirect URL: `http://localhost:3000/api/auth/callback/linkedin`
4. Required scopes: `r_liteprofile`, `r_emailaddress`, `w_member_social`

#### Meta (Facebook + Instagram)
1. Go to [developers.facebook.com](https://developers.facebook.com/)
2. Create an app (Business type for Instagram Graph API)
3. Add Facebook Login product
4. Add redirect URL: `http://localhost:3000/api/auth/callback/meta`
5. Required scopes: `pages_show_list`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`

### 6. Set Up Database

```bash
# Production / Deploy: apply committed migrations (idempotent, safe to re-run)
npx prisma migrate deploy

# Local dev: create/applying migrations during development
npx prisma migrate dev

# (Optional) Open Prisma Studio to inspect data
npx prisma studio
```

Migrations live in `prisma/migrations/` and are committed to the repo. On startup,
`npm start` runs `prisma migrate deploy` automatically before serving traffic.

### 7. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Clerk.

### 8. Production Startup

`npm start` runs `start.js`, which:

1. Applies pending database migrations (`prisma migrate deploy`)
2. Starts the Next.js web server (`next start`)
3. Starts the BullMQ worker (`npm run worker`) as a managed child process
   — set `RUN_WORKER=false` to disable the in-process worker (e.g. when you
   run the worker as a separate deployment on serverless hosts)

```bash
npm start
```

A healthcheck is exposed at `GET /api/health` (reports DB status + worker mode).

## Deployment to Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Set all environment variables in Vercel dashboard
4. The `vercel.json` file configures cron jobs automatically (runs every minute)
5. Add your Vercel domain as the OAuth redirect URI in each platform's developer console
6. Deploy! `npm start` applies migrations and serves the app.
7. For the publishing queue, set `RUN_WORKER=false` on the web deployment and run a
   separate background worker deployment with start command `npm run worker` + Redis.

## How It Works

### Connecting Accounts

1. User clicks "Connect" on a platform
2. System redirects to platform's OAuth consent screen
3. User authorizes the app
4. Platform redirects back to callback URL with auth code
5. Server exchanges code for access token (encrypted and stored)
6. For Meta, also exchanges for long-lived token (60 days)

### Scheduling Posts

1. User creates a post with content and selects platforms
2. Post is saved to database with `SCHEDULED` status
3. Vercel Cron triggers every 5 minutes (`/api/cron/publish-posts`)
4. Cron finds all posts due for publishing
5. Publisher posts to each selected platform's API
6. Post status updated to `PUBLISHED` or `FAILED`

### Security Notes

- OAuth tokens are encrypted at rest using AES-256
- Cron endpoint is protected with `CRON_SECRET` bearer token
- All API routes require authentication via Clerk
- Database uses relations with cascade delete to prevent orphaned records

## Running the Worker

The publishing engine runs as a separate long-lived process (BullMQ worker) that consumes the `publish-queue`. On a single host it is started automatically by `npm start`; for a multi-process setup:

```bash
# Terminal 1 — Redis
docker compose up -d redis

# Terminal 2 — App (web + worker, both via start.js)
npm start

# OR run them separately:
npm run start:web   # next start
npm run worker      # BullMQ worker
```

On serverless hosts (Vercel), set `RUN_WORKER=false` on the web deployment and run the worker as a separate background deployment with start command `npm run worker` (requires Redis).

## Environment Variables

See `.env.example` for the full list. New services require:

- `REDIS_URL` — BullMQ/Redis connection
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_CDN_URL` — media storage
- `OPENAI_API_KEY`, `OPENAI_MODEL` — AI features
- `SMTP_*` — optional email notifications
- `META_WEBHOOK_SECRET`, `X_WEBHOOK_SECRET` — webhook signature verification

## Architecture Overview

```
Browser ──presigned PUT──▶ S3
   │
   ├─ POST /api/posts ──▶ Post (SCHEDULED)
   │                         │
   └─ GET /api/cron/* ──▶ runCronTick()
                           ├─ scheduleDuePosts() ──▶ BullMQ enqueue (per platform)
                           ├─ processDueFeeds()    ──▶ RSS auto-post
                           ├─ recycleEvergreen()   ──▶ re-schedule top posts
                           └─ refreshRecentAnalytics()
                                    │
Worker (BullMQ) ── rate-limit ──▶ processScheduledPost() ──▶ platform API
                                        └─▶ QueueJob + Analytics + Notification
```

## License

MIT
