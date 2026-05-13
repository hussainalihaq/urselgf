# Ameer Global Full-Stack Website

This repo now includes:
- Frontend pages based on your provided designs (`/home`, `/products`, `/about`, `/contact`)
- Backend APIs (`/api/health`, `/api/products`, `/api/newsletter`, `/api/contact`, `/api/reserve`, `/api/availability`)
- File-based data storage in `data/*.json`
- Stripe checkout + webhook order pipeline (`/api/checkout`, `/api/stripe-webhook`)
- Internal admin API router (`/api/admin/*`)
- SEO keyword and execution files for GTA mango ranking (`/seo`)
- Backend operations reference in [BACKEND_TRACE.md](./BACKEND_TRACE.md)

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
- `POST /api/reserve`
- `POST /api/availability`
- `POST /api/checkout`
- `POST /api/stripe-webhook`
- `GET /api/admin/session`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/dashboard`
- `GET /api/admin/orders`
- `POST /api/admin/orders-update`
- `GET /api/admin/inventory`
- `POST /api/admin/inventory-update`
- `GET /api/admin/diagnostics`

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

## SEO Files

- `seo/keywords-gta-mangoes.csv`: prioritized keyword clusters for GTA mango intent.
- `seo/seo-gta-mango-execution.md`: practical execution checklist to improve rankings.
- `seo/seo-roadmap-4-days.md`: short sprint plan for immediate SEO action.
- `seo/easy-seo-framework.md`: simple weekly framework to maintain growth.

## Admin Panel + Stripe Webhook (Current)

Internal admin routes:

- `/admin/login`
- `/admin`
- `/admin/orders`
- `/admin/inventory`

Only this email is allowed:

- `managingdirector@ameerglobal.ca`

Set:

- `ADMIN_EMAIL=managingdirector@ameerglobal.ca`
- `ADMIN_SESSION_SECRET=your_random_secret`

Built-in fallback values if you do not set the admin env vars:

- Admin email: `managingdirector@ameerglobal.ca`
- Admin passcode: `AmeerGlobal1966`
- Session secret fallback is hardcoded for convenience and should be replaced in Vercel later

Required env vars:

- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL` (set this to the same value as `SUPABASE_URL`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_LOGIN_CODE`
- `ADMIN_SESSION_SECRET`

If `ADMIN_LOGIN_CODE` is not set, the code falls back to `AmeerGlobal1966`.

Create tables:

```sql
create table if not exists public.orders (
  id text primary key,
  stripe_session_id text unique not null,
  stripe_payment_intent_id text,
  customer_name text,
  customer_email text,
  customer_phone text,
  mango_type text not null,
  quantity integer not null default 1,
  order_type text not null,
  delivery_address text,
  amount_total numeric(12,2) not null default 0,
  currency text not null default 'CAD',
  payment_status text not null default 'paid',
  fulfillment_status text not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id text primary key,
  mango_type text unique not null,
  fixed_size text not null,
  fixed_price numeric(12,2) not null,
  starting_stock integer not null default 0,
  sold_quantity integer not null default 0,
  remaining_stock integer not null default 0,
  low_stock_threshold integer not null default 10,
  updated_at timestamptz not null default now()
);
```

Seeded mango rows (auto-seeded if missing):

- `Sindhri Mangoes`
- `Anwar Ratol Mangoes`
- `Chaunsa Mangoes`

Stripe webhook endpoint:

- `/api/stripe/webhook`

Subscribe event:

- `checkout.session.completed`
