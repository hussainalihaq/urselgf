# Ameer Global Backend Trace

This document is the operational map of the website backend. It explains what is deployed on Vercel, where form and order data goes, which env vars are required, and what to check when something fails.

## Architecture Summary

- Public pages are static HTML pages in the repo root and subfolders such as `/checkout`, `/contact`, `/reserve`, and `/admin`.
- Production backend on Vercel is file-based serverless functions under `api/`.
- Shared backend logic lives under `api/_lib/` and does **not** count toward the Vercel Hobby function limit.
- `server.js` is the local Node server used by `npm start`. It mirrors most production behavior for local testing, but Vercel production uses the `api/` functions.
- The current admin is intentionally reservation-only. Paid order and inventory operations are expected to be handled primarily in Stripe unless `orders` and `inventory` tables are later added back as active operational stores.

## Serverless Function Inventory

### Before consolidation

These `20` function entrypoints exceeded the Vercel Hobby limit of `12`:

1. `api/admin-stats.js`
2. `api/admin/dashboard.js`
3. `api/admin/diagnostics.js`
4. `api/admin/inventory-update.js`
5. `api/admin/inventory.js`
6. `api/admin/links.js`
7. `api/admin/login.js`
8. `api/admin/logout.js`
9. `api/admin/orders-update.js`
10. `api/admin/orders.js`
11. `api/admin/session.js`
12. `api/availability.js`
13. `api/checkout.js`
14. `api/contact.js`
15. `api/debug.js`
16. `api/health.js`
17. `api/newsletter.js`
18. `api/products.js`
19. `api/reserve.js`
20. `api/stripe-webhook.js`

### After consolidation

These `9` function entrypoints are the expected production target and fit the Hobby plan:

1. `api/admin/[...route].js`
2. `api/availability.js`
3. `api/checkout.js`
4. `api/contact.js`
5. `api/health.js`
6. `api/newsletter.js`
7. `api/products.js`
8. `api/reserve.js`
9. `api/stripe-webhook.js`

### What counts and what does not

- Counts toward Hobby limit: every `.js` file in `api/` except files inside `api/_lib/`.
- Does not count: `api/_lib/admin-auth.js`, `api/_lib/admin-data.js`, `api/_lib/checkout.js`, `api/_lib/common.js`, `api/_lib/email.js`, `api/_lib/orders.js`.

## Public Endpoint Map

| Method | Path | Purpose | Data destination | Main dependencies |
| --- | --- | --- | --- | --- |
| `GET` | `/api/health` | Basic runtime health check | None | Vercel runtime, optional Supabase env check |
| `GET` | `/api/health?deep=1` | Authenticated keepalive + deep Supabase connectivity check | None | `KEEPALIVE_KEY`, Supabase tables |
| `GET` | `/api/products` | Returns static product list | None | None |
| `POST` | `/api/contact` | General inquiry form | Supabase `contacts` table when configured | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `POST` | `/api/reserve` | Reserve form submissions | Supabase `contacts` table when configured | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `POST` | `/api/newsletter` | Newsletter signup | Supabase `newsletter_subscribers` table when configured | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `POST` | `/api/availability` | GTA delivery eligibility check | None | Local business rules in `api/_lib/checkout.js` |
| `POST` | `/api/checkout` | Creates Stripe Checkout session and a pending order | Supabase `contacts` and `orders` when configured | Stripe secret key, Supabase, checkout pricing rules |
| `POST` | `/api/stripe-webhook` | Finalizes paid Stripe orders | Supabase `orders` and `inventory`, optional Resend emails | Stripe webhook secret, Stripe secret key, Supabase, optional Resend |

## Admin Endpoint Map

All admin endpoints are served by one file: `api/admin/[...route].js`.

| Method | Path | Auth | Returns | Failure mode |
| --- | --- | --- | --- | --- |
| `GET` | `/api/admin/session` | No login required | Current admin session state | Returns `{ authenticated: false }` if cookie invalid or missing |
| `POST` | `/api/admin/login` | No login required | Signed admin session cookie + session payload | `403` for wrong email/passcode, `500` if admin env missing |
| `POST` | `/api/admin/logout` | No login required | Clears admin session cookie | Always logs out current browser |
| `GET` | `/api/admin/dashboard` | Required | Reservation metrics + recent reserve submissions | `401` if not logged in, `500` for data/storage errors |
| `GET` | `/api/admin/diagnostics` | Required | Backend config and connectivity diagnostics | `401` if not logged in |
| `GET` | `/api/admin/links` | Required | Admin page/API link list | `401` if not logged in |

## End-to-End Data Flow

### Contact form

1. User submits a contact form on a public page.
2. Frontend `fetch()` calls `POST /api/contact`.
3. Backend validates name, email, subject, and message.
4. Record is written to Supabase `contacts` when Supabase env is configured.
5. Response returns success/failure JSON to the page.

### Reserve form

1. User submits reserve form on `/reserve`.
2. Frontend `fetch()` calls `POST /api/reserve`.
3. Backend normalizes it into a contact-style lead with `intent=reserve`.
4. Record is written to Supabase `contacts` when Supabase env is configured.
5. Response returns success/failure JSON to the page.

Reserve submissions currently store structured data in two places:

- Dedicated columns when available:
  - `product`
  - `intent`
- Message body lines:
  - `Product: ...`
  - `Quantity: ...`
  - `Phone: ...`
  - `Company: ...`
  - `City: ...`
  - `Country: ...`
  - `Delivery window: ...`
  - `Notes: ...`

The reservation dashboard parses those message lines back into fields, so older or partially structured records can still display correctly.

### Newsletter form

1. User submits email.
2. Frontend `fetch()` calls `POST /api/newsletter`.
3. Backend validates email and checks for an existing subscriber.
4. If new, record is written to Supabase `newsletter_subscribers`.

### Checkout before payment

1. User fills checkout form on `/checkout`.
2. Frontend `fetch()` calls `POST /api/checkout`.
3. Backend validates fulfillment, quantity, GTA delivery eligibility, and phone/address requirements.
4. Backend stores a lead-style contact record in Supabase `contacts`.
5. Backend creates a Stripe Checkout Session with product, quantity, customer, and delivery metadata.
6. Backend attempts to create a pending order row in Supabase `orders`.
7. Frontend receives a Stripe Checkout URL and redirects the user to Stripe.

The current Stripe metadata fields sent on both the Checkout Session and the PaymentIntent are:

- `orderNumber`
- `submissionId`
- `product`
- `quantity`
- `customerEmail`
- `customerName`
- `phone`
- `fulfillment`
- `orderType`
- `city`
- `postalCode`
- `addressLine1`
- `addressLine2`

This is the data your team should expect to inspect in Stripe Dashboard under the payment/session metadata.

### After Stripe payment

1. User pays on Stripe-hosted Checkout.
2. Stripe sends `checkout.session.completed` to `POST /api/stripe-webhook`.
3. Backend verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`.
4. Backend loads Checkout Session line items and metadata.
5. Backend creates or finalizes the paid order in Supabase `orders`.
6. Backend reduces `inventory` exactly once for that paid order.
7. Backend optionally sends customer/admin emails through Resend when email envs are configured.

### Where Stripe order info goes

After a successful payment, the order data goes to:

- Supabase `orders`
- Supabase `inventory` for stock reduction
- Optional Resend email notifications

Card details do **not** go to your website or Supabase. Card data stays in Stripe.

### How Stripe price selection works now

Checkout now supports automatic Stripe test/live switching by key mode:

1. If `STRIPE_SECRET_KEY` starts with `sk_test_`, checkout prefers:
   - `STRIPE_PRICE_SINDHRI_TEST`
   - `STRIPE_PRICE_CHAUNSA_TEST`
   - `STRIPE_PRICE_ANWAR_RATOL_TEST`
2. If `STRIPE_SECRET_KEY` starts with `sk_live_`, checkout prefers:
   - `STRIPE_PRICE_SINDHRI_LIVE`
   - `STRIPE_PRICE_CHAUNSA_LIVE`
   - `STRIPE_PRICE_ANWAR_RATOL_LIVE`
3. If mode-specific values are missing, checkout falls back to generic values:
   - `STRIPE_PRICE_SINDHRI`
   - `STRIPE_PRICE_CHAUNSA`
   - `STRIPE_PRICE_ANWAR_RATOL`

This allows the team to switch from test to live by changing Stripe keys and keeping the matching mode-specific price IDs in Vercel.

### Admin flow

1. Admin opens `/admin/login/`.
2. Login submits to `POST /api/admin/login`.
3. Backend checks `ADMIN_EMAIL`, `ADMIN_LOGIN_CODE`, and signs a cookie using `ADMIN_SESSION_SECRET`.
4. Admin pages call `/api/admin/session` to confirm the cookie.
5. Reservation dashboard and diagnostics load through `/api/admin/*`.
6. `/admin/orders/` and `/admin/inventory/` redirect back to `/admin/`.

Reservation dashboard data source:

- Reads from Supabase `contacts`
- Fetches the newest contact rows
- Filters locally for reserve-like submissions using:
  - `intent=reserve`
  - or `source=reserve-page`
  - or subjects containing `Reserve Request`

Reservation dashboard field extraction:

- `customer_name` <- `name`
- `customer_email` <- `email`
- `customer_phone` <- parsed from message line `Phone:`
- `product` <- `product` column, or fallback parsed from message line `Product:`
- `quantity` <- parsed from message line `Quantity:`
- `company` <- parsed from message line `Company:`
- `market` <- combined `City` + `Country`
- `delivery_window` <- parsed from message line `Delivery window:`
- `notes` <- parsed from message line `Notes:`

This fallback behavior is important because some historical reserve rows may have blank `product` columns while still containing the full reserve details inside `message`.

Default hardcoded fallback values:

- Admin email: `managingdirector@ameerglobal.ca`
- Admin passcode: `AmeerGlobal1966`
- If `ADMIN_SESSION_SECRET` is not set, the code uses a built-in fallback secret for convenience

## Environment Variable Matrix

| Variable | Required | Where to get it | What breaks if missing |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Yes for production storage | Supabase Dashboard -> Project Settings -> API -> Project URL | Contact, reserve, newsletter, Stripe order sync, and reservation admin storage access |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes, set equal to `SUPABASE_URL` | Same Supabase Project URL | Frontend/client-side Supabase config and any code expecting the public URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required for client-side Supabase usage and future extensions | Supabase Dashboard -> Project Settings -> API -> anon public key | Any browser-side Supabase integration |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for server-side writes | Supabase Dashboard -> Project Settings -> API -> service_role key | Contact, reserve, newsletter, orders, inventory, admin diagnostics/data |
| `SUPABASE_CONTACTS_TABLE` | Optional | Choose table name in Supabase | Defaults to `contacts` |
| `SUPABASE_NEWSLETTER_TABLE` | Optional | Choose table name in Supabase | Defaults to `newsletter_subscribers` |
| `SUPABASE_ORDERS_TABLE` | Optional | Choose table name in Supabase | Defaults to `orders`; only needed if you want local paid-order syncing beyond Stripe |
| `SUPABASE_INVENTORY_TABLE` | Optional | Choose table name in Supabase | Defaults to `inventory`; only needed if you want local inventory syncing |
| `STRIPE_SECRET_KEY` | Yes for checkout | Stripe Dashboard -> Developers -> API keys -> Secret key | `/api/checkout` and webhook order processing |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Required for clean production client setup | Stripe Dashboard -> Developers -> API keys -> Publishable key | Client-side Stripe integrations and future hosted flows |
| `STRIPE_WEBHOOK_SECRET` | Yes for webhook | Stripe Dashboard -> Developers -> Webhooks -> endpoint signing secret | Paid orders cannot be securely finalized |
| `STRIPE_PRICE_SINDHRI` / `STRIPE_PRICE_CHAUNSA` / `STRIPE_PRICE_ANWAR_RATOL` | Optional generic fallback | Stripe Product Catalog -> open each price -> copy `price_...` | Used only when mode-specific price IDs are not set |
| `STRIPE_PRICE_SINDHRI_TEST` / `STRIPE_PRICE_SINDHRI_LIVE` | Recommended | Stripe Product Catalog -> open each price -> copy `price_...` | Clean automatic test/live switching for Sindhri |
| `STRIPE_PRICE_CHAUNSA_TEST` / `STRIPE_PRICE_CHAUNSA_LIVE` | Recommended | Stripe Product Catalog -> open each price -> copy `price_...` | Clean automatic test/live switching for Chaunsa |
| `STRIPE_PRICE_ANWAR_RATOL_TEST` / `STRIPE_PRICE_ANWAR_RATOL_LIVE` | Optional until Anwar buy-now is enabled | Stripe Product Catalog -> open each price -> copy `price_...` | Clean automatic test/live switching for Anwar Ratol |
| `ADMIN_EMAIL` | Yes | Manually set to `managingdirector@ameerglobal.ca` | Admin login access policy |
| `ADMIN_LOGIN_CODE` | Optional but recommended in Vercel | Manually create a strong passcode | Falls back to `AmeerGlobal1966`, which is convenient but weaker |
| `ADMIN_SESSION_SECRET` | Optional but recommended in Vercel | Manually create a long random secret | Falls back to a built-in secret, which is convenient but weaker |
| `RESEND_API_KEY` | Optional | Resend Dashboard -> API Keys | Order notification emails will not send |
| `ORDER_EMAIL_FROM` | Optional | Verified sender in Resend | Email sending will not send from a valid address |
| `ORDER_EMAIL_ADMIN_TO` | Optional | Your receiving email address | Admin order emails will not send |
| `KEEPALIVE_KEY` | Optional but recommended | Manually create a secret for manual deep keepalive checks | Deep keepalive endpoint falls back to a built-in key, which is convenient but weaker |
| `CRON_SECRET` | Optional but recommended | Manually create a Vercel cron secret | Automatic daily keepalive cannot be authenticated cleanly |

## Supabase Pause / Downtime Guidance

### What still works

- Public pages still load because they are static.
- Stripe-hosted checkout can still collect payment details on Stripe’s side if the user already reached Stripe.

### What fails or degrades

- Contact, reserve, and newsletter submissions cannot be stored reliably.
- Pending order creation during checkout can fail.
- Webhook order finalization can be delayed or fail until Supabase recovers.
- Reservation admin dashboard and diagnostics lose live data access.

### Important production note

This repo has JSON-file fallback code in some places for local runtime behavior, but that is **not** a safe production fallback on Vercel serverless. Do not rely on `data/*.json` as a real backup database in production.

### Recommended posture

1. Keep Supabase active on a plan that does not pause unexpectedly.
2. Treat Stripe webhooks as the source of truth for paid orders.
3. Add monitoring for Supabase availability and webhook failures.
4. Keep email notifications enabled so paid orders also reach an inbox.
5. If you need guaranteed lead capture during DB downtime, add a second backup destination such as email or a queue.

## Automated Keepalive

This repo now includes a low-cost keepalive path for Supabase Free:

1. Vercel cron configured in `vercel.json`
2. Authenticated endpoint: `GET /api/health?deep=1`
3. Secrets: `CRON_SECRET` for automatic cron traffic and `KEEPALIVE_KEY` for manual deep checks

What it does:

- Runs once per day on Vercel Hobby
- Calls the health endpoint
- Performs light reads against `contacts`, plus `orders` and `inventory` when those tables exist
- Returns non-200 if Supabase connectivity fails

Recommended setup:

1. Add `CRON_SECRET` in Vercel env vars.
2. Add `KEEPALIVE_KEY` in Vercel env vars.
3. Redeploy so the cron job appears in the Vercel project settings.

Fallback behavior:

- If `KEEPALIVE_KEY` is not set, the code defaults to `AmeerKeepAlive1966`
- The manual deep keepalive endpoint still works by calling `/api/health?deep=1` with the keepalive key
- This is convenient, but you should replace the fallback with a private secret later

## Stripe Live Cutover Checklist

The site should remain in Stripe `test` mode until admin, routing, and webhook flow are verified.

Before switching to live:

1. Replace `STRIPE_SECRET_KEY` with `sk_live_...`.
2. Replace `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` with `pk_live_...`.
3. Add mode-specific live price IDs in Vercel:
   - `STRIPE_PRICE_SINDHRI_LIVE`
   - `STRIPE_PRICE_CHAUNSA_LIVE`
   - later `STRIPE_PRICE_ANWAR_RATOL_LIVE`
4. Create or update the production webhook endpoint in Stripe:
   - `https://ameerglobal.ca/api/stripe-webhook`
5. Copy the live webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
6. Run one real low-value production payment test.
7. Confirm:
   - Stripe checkout succeeds
   - webhook is delivered successfully
   - Stripe metadata shows pickup vs delivery correctly
   - if local order syncing is enabled, one paid order row appears in Supabase
   - if local inventory syncing is enabled, inventory is reduced exactly once
   - reservation dashboard still shows reserve submissions
   - customer/admin email behavior matches env configuration

## Stripe Order Email Configuration

Order emails are already implemented in `api/_lib/email.js` and are triggered from `api/stripe-webhook.js` after a successful `checkout.session.completed` event.

Required env vars:

- `RESEND_API_KEY`
- `ORDER_EMAIL_FROM`
- `ORDER_EMAIL_ADMIN_TO`
- `STRIPE_WEBHOOK_SECRET`

Flow:

1. Stripe payment succeeds
2. Stripe webhook hits `/api/stripe-webhook`
3. Backend verifies signature
4. Backend finalizes paid order
5. Backend sends:
   - customer confirmation email
   - admin order notification email

If email env vars are missing:

- Orders can still be finalized
- Emails will simply not send

## Vercel Deployment Checklist

1. Confirm the domain `ameerglobal.ca` is attached to the same Vercel project that builds this GitHub repo and the correct production branch, expected `main`.
2. Confirm the production deployment uses the post-consolidation code with `9` functions, not the older `20`-function layout.
3. Confirm all required env vars exist in the Vercel project.
4. Redeploy the latest `main`.
5. Verify:
   - `GET /api/health` returns JSON
   - `GET /api/admin/session` returns JSON and not HTML/redirect text
   - `/admin/login/` loads
   - `/admin/` redirects to login when logged out
   - a Stripe test checkout completes successfully
   - the webhook finalizes the order once

## Operational Blocker to Keep in Mind

If `ameerglobal.ca` still serves old behavior after deploy, the most likely causes are:

1. The domain is attached to a different Vercel project.
2. The correct project is deploying a different Git branch.
3. The environment variables were set on preview but not production, or vice versa.
4. An older deployment is still serving production traffic.

Code changes inside this repo do not fix project/domain linkage by themselves. That must be verified in Vercel.
