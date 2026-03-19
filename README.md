# SearchAgent

An AI-powered market research briefing tool. Configure a research monitor in 5 minutes, get curated intelligence briefs delivered to your inbox on a schedule you set.

## What it does

- Users configure a **research monitor** in 5 guided steps: topic, sources, keywords, optional document, and delivery schedule
- The app runs monitors on schedule using **Anthropic Claude** with web search enabled
- Delivers a clean formatted brief to the user's **email inbox**
- Credits-based billing via **Stripe** — buy credits, spend them on brief runs

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Hosting + Cron | Vercel |
| Database + Auth + Storage | Supabase |
| Payments | Stripe |
| AI | Anthropic API (`claude-sonnet-4-6`, web search enabled) |
| Email | Resend |
| Styling | Tailwind CSS |

## Getting started

### 1. Clone and install

```bash
git clone <repo-url>
cd searchAgent
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local` — see comments in the file for where to find each key.

### 3. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the schema in `supabase/schema.sql` in the SQL editor
3. Create a storage bucket called `documents` (non-public)
4. Add storage policies from the commented SQL at the bottom of the schema file

### 4. Set up Stripe

1. Create three products/prices in the [Stripe dashboard](https://dashboard.stripe.com):
   - **Starter**: 50 credits for $7.99
   - **Pro**: 150 credits for $19.99
   - **Team**: 500 credits for $59.99
2. Copy the Price IDs to your `.env.local`
3. Create a webhook endpoint pointing to `https://your-app.vercel.app/api/stripe/webhook` with the `checkout.session.completed` event
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 5. Run locally

```bash
npm run dev
```

## Project structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── auth/
│   │   ├── login/page.tsx          # Login page
│   │   ├── signup/page.tsx         # Signup page
│   │   └── callback/route.ts       # OAuth callback
│   ├── dashboard/
│   │   ├── page.tsx                # Monitor list
│   │   └── credits/page.tsx        # Credit balance + purchase
│   ├── monitors/
│   │   ├── new/page.tsx            # 5-step monitor setup
│   │   └── [id]/page.tsx           # Monitor detail + run history
│   └── api/
│       ├── monitors/[id]/run/      # Trigger a monitor run
│       ├── stripe/
│       │   ├── checkout/           # Create Stripe checkout session
│       │   └── webhook/            # Handle Stripe payment webhooks
│       └── cron/run/               # Vercel cron job endpoint
├── components/
│   ├── ui/                         # Reusable UI components
│   ├── monitor/                    # Monitor-specific components
│   └── layout/                     # Navbar etc.
├── lib/
│   ├── supabase/                   # Supabase client (browser + server + middleware)
│   ├── anthropic/                  # AI brief generation
│   ├── stripe/                     # Stripe client + credit bundles
│   ├── resend/                     # Email delivery
│   └── utils/                      # Utilities (cn, rate limiting, etc.)
├── types/index.ts                  # TypeScript types
└── middleware.ts                   # Auth middleware
supabase/
└── schema.sql                      # Full database schema with RLS policies
vercel.json                         # Cron job schedule
.env.example                        # Environment variable template
```

## Security

- **Anthropic API key**: Server-side only, never exposed to the client
- **Supabase RLS**: All tables have Row Level Security — users can only access their own data
- **Credit validation**: Happens server-side before every AI call
- **Rate limiting**: Max 10 monitor runs per hour per user
- **Input sanitization**: User topic and keyword inputs are sanitized to prevent prompt injection
- **Document uploads**: File type and size validated, stored in private Supabase bucket
- **Cron endpoint**: Protected by a secret token (`CRON_SECRET`)
- **Stripe webhooks**: Signature verified before processing

## Vercel cron job

`vercel.json` configures the cron to run daily at 8 AM UTC:

```json
{
  "crons": [
    {
      "path": "/api/cron/run",
      "schedule": "0 8 * * *"
    }
  ]
}
```

The cron endpoint:
1. Fetches all active monitors where `next_run_at <= now()`
2. Checks each user's credit balance
3. Runs the AI via Anthropic API
4. Decrements credits, saves the brief, sends email
5. Updates `last_run_at` and `next_run_at` on the monitor

## Credits model

| Bundle | Credits | Price |
|---|---|---|
| Starter | 50 | $7.99 |
| Pro | 150 | $19.99 |
| Team | 500 | $59.99 |

**Cost per run** = `(max_results × 2) + (3 if document attached)`

New users receive **10 free credits** on signup.
