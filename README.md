# Social Scheduler

A full-stack multi-platform social media scheduler built with **Next.js (App Router)**, **Clerk** for authentication, **Prisma** + **PostgreSQL**, and **Vercel Cron** for scheduling.

## Features

- 🔐 **Clerk Authentication** - Sign up, sign in, user management
- 🔗 **Multi-Platform OAuth** - Connect X (Twitter), LinkedIn, Instagram, and Facebook accounts
- 📝 **Post Scheduling** - Schedule posts for future publishing or publish immediately
- ⏰ **Automated Publishing** - Vercel Cron runs every 5 minutes to publish due posts
- 🔒 **Secure Token Storage** - OAuth tokens encrypted at rest using AES-256
- 📊 **Dashboard** - View connected accounts and post status

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
# Push the schema to your database
npx prisma db push

# (Optional) Open Prisma Studio to inspect data
npx prisma studio
```

### 7. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Clerk.

## Deployment to Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Set all environment variables in Vercel dashboard
4. The `vercel.json` file configures cron jobs automatically
5. Add your Vercel domain as the OAuth redirect URI in each platform's developer console
6. Deploy!

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

## Limitations & Next Steps

This is a foundation that you can extend:

- [ ] Media upload support (currently text-only for X/LinkedIn)
- [ ] Image/video storage (S3/Cloudinary)
- [ ] Retry logic for failed posts
- [ ] Analytics and engagement tracking
- [ ] Team/organization support via Clerk Orgs
- [ ] Webhook handling for platform events (comments, mentions)
- [ ] Queue system (BullMQ) for higher volume
- [ ] Rate limiting per platform

## License

MIT
