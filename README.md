# Ameer Global Full-Stack Website

This repo now includes:
- Frontend pages based on your provided designs (`/home`, `/products`, `/about`, `/contact`)
- Backend APIs (`/api/health`, `/api/products`, `/api/newsletter`, `/api/contact`)
- File-based data storage in `data/*.json`
- Stripe checkout + webhook order pipeline (`/api/checkout`, `/api/stripe-webhook`)
- Admin stats endpoint (`/api/admin-stats`)
- SEO keyword and execution files for GTA mango ranking (`/seo`)

## Run locally

```bash
npm start
```

Server runs on `http://localhost:3000` by default.

## Routes

- `GET /` -> Home
- `GET /home`
- `GET /products`
- `GET /about`
- `GET /contact`
- `GET /api/health`
- `GET /api/products`
- `POST /api/newsletter`
- `POST /api/contact`
- `POST /api/checkout`
- `POST /api/stripe-webhook`
- `GET /api/admin-stats` (requires `x-admin-key` header)

## API payloads

### `POST /api/newsletter`
```json
{ "email": "user@example.com" }
```

### `POST /api/contact`
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "subject": "Need quote",
  "message": "Please share pricing and shipment timeline."
}
```

## Supabase Integration (Recommended)

The API automatically writes to Supabase when these env vars are set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_CONTACTS_TABLE` (optional, default: `contacts`)
- `SUPABASE_NEWSLETTER_TABLE` (optional, default: `newsletter_subscribers`)

If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not set, the app falls back to local JSON files in `data/*.json`.

### Suggested SQL

```sql
create table if not exists public.contacts (
  id uuid primary key,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  source text,
  product text,
  intent text,
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);
```

RLS can stay disabled for these tables when using server-side `service_role` key only.

### If You Already Created The Old `contacts` Table

Run this once to add order tracking fields:

```sql
alter table public.contacts
  add column if not exists product text,
  add column if not exists intent text;
```

Without these two columns, contact submissions still work, but order-specific tracking fields are skipped in Supabase.

## Stripe Production Setup

Set these environment variables in Vercel:

- `STRIPE_SECRET_KEY` (`sk_live_...` in production)
- `STRIPE_WEBHOOK_SECRET` (from Stripe webhook endpoint)
- `ADMIN_STATS_KEY` (your private key for `/api/admin-stats`)
- `RESEND_API_KEY` (for email automation)
- `ORDER_EMAIL_FROM` (verified sender, e.g. `orders@yourdomain.com`)
- `ORDER_EMAIL_ADMIN_TO` (your receiving email)

Optional Supabase table names:

- `SUPABASE_ORDERS_TABLE` (default: `orders`)
- `SUPABASE_INVENTORY_TABLE` (default: `inventory`)

### Stripe Dashboard Steps

1. Go to Developers -> Webhooks.
2. Add endpoint: `https://your-domain.com/api/stripe-webhook`.
3. Subscribe to event: `checkout.session.completed`.
4. Copy webhook signing secret and set `STRIPE_WEBHOOK_SECRET`.
5. Switch your API key from test to live when going live.

### Supabase Order Tables (Optional but recommended)

```sql
create table if not exists public.orders (
  order_number text primary key,
  submission_id text not null,
  stripe_session_id text unique not null,
  payment_intent_id text,
  customer_name text,
  customer_email text,
  phone text,
  product text,
  quantity integer not null default 1,
  fulfillment text,
  city text,
  postal_code text,
  address_line_1 text,
  address_line_2 text,
  amount_total numeric(10,2) not null default 0,
  currency text not null default 'CAD',
  status text not null default 'pending_payment',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  product text primary key,
  stock_on_hand integer not null default 0,
  updated_at timestamptz not null default now()
);
```

Order numbers are generated automatically as:

- `AMG-YYYYMMDD-0001`
- `AMG-YYYYMMDD-0002`
- etc.

### Admin Stats API

Example:

```bash
curl -H "x-admin-key: YOUR_ADMIN_STATS_KEY" https://your-domain.com/api/admin-stats
```

## SEO Files

- `seo/keywords-gta-mangoes.csv`: prioritized keyword clusters for GTA mango intent.
- `seo/seo-gta-mango-execution.md`: practical execution checklist to improve rankings.
