# Ameer Global Full-Stack Website

This repo now includes:
- Frontend pages based on your provided designs (`/home`, `/products`, `/about`, `/contact`)
- Backend APIs (`/api/health`, `/api/products`, `/api/newsletter`, `/api/contact`)
- File-based data storage in `data/*.json`

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
