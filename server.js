const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHmac, timingSafeEqual } = require('node:crypto');
const Stripe = require('stripe');
const {
  buildAvailabilityResponse,
  buildCheckoutContactRecord,
  buildCheckoutResponse
} = require('./api/_lib/checkout');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_CONTACTS_TABLE = process.env.SUPABASE_CONTACTS_TABLE || 'contacts';
const SUPABASE_NEWSLETTER_TABLE = process.env.SUPABASE_NEWSLETTER_TABLE || 'newsletter_subscribers';
const SUPABASE_ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || 'orders';
const SUPABASE_INVENTORY_TABLE = process.env.SUPABASE_INVENTORY_TABLE || 'inventory';
const SUPABASE_URL_VALID = /^https?:\/\//i.test(SUPABASE_URL);
const USE_SUPABASE = Boolean(SUPABASE_URL_VALID && SUPABASE_SERVICE_ROLE_KEY);
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'managingdirector@ameerglobal.ca').toLowerCase();
const ADMIN_LOGIN_CODE = process.env.ADMIN_LOGIN_CODE || '';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY || 'ameer-admin-dev-secret';
const ADMIN_SESSION_COOKIE = 'ag_admin_session_v2';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const LONG_CACHE_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.mp4',
  '.woff2'
]);

const products = [
  {
    id: 'mango-chaunsa',
    name: 'Chaunsa Mango Premium Box',
    origin: 'Multan, Pakistan',
    unit: '1.8 kg (4 lb approx) box',
    category: 'fresh-produce'
  },
  {
    id: 'mango-anwar-ratol',
    name: 'Anwar Ratol Mango Reserve',
    origin: 'Multan, Pakistan',
    unit: '1.8 kg (4 lb approx) box',
    category: 'fresh-produce'
  },
  {
    id: 'mango-sindhri',
    name: 'Sindhri Mango Estate Selection',
    origin: 'Multan, Pakistan',
    unit: '1.8 kg (4 lb approx) box',
    category: 'fresh-produce'
  }
];

const MANGO_INVENTORY_SEED = [
  { mango_type: 'Sindhri Mangoes', fixed_size: '1.8 kg (4 lb approx) box', fixed_price: 38 },
  { mango_type: 'Anwar Ratol Mangoes', fixed_size: '1.8 kg (4 lb approx) box', fixed_price: 45 },
  { mango_type: 'Chaunsa Mangoes', fixed_size: '1.8 kg (4 lb approx) box', fixed_price: 52 }
];

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sanitizePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const normalized = path
    .normalize(decoded)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  return normalized;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

      if (contentType === 'application/x-www-form-urlencoded') {
        const params = new URLSearchParams(raw);
        resolve(Object.fromEntries(params.entries()));
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        if (contentType.includes('json')) {
          reject(new Error('Invalid JSON payload'));
          return;
        }

        const params = new URLSearchParams(raw);
        resolve(Object.fromEntries(params.entries()));
      }
    });
    req.on('error', reject);
  });
}

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024 * 2) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const pairs = raw.split(';');
  const out = {};
  for (const pair of pairs) {
    const [k, ...rest] = pair.trim().split('=');
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join('=') || '');
  }
  return out;
}

function getUserAgentSignature(req) {
  return createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(String(req.headers['user-agent'] || 'unknown'))
    .digest('hex')
    .slice(0, 24);
}

function signAdminSession(email, expiresAt, uaSignature) {
  return createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(`${email}|${expiresAt}|${uaSignature}`)
    .digest('hex');
}

function createAdminSessionToken(email, req) {
  const expiresAt = Date.now() + 1000 * 60 * 60 * 2;
  const uaSignature = getUserAgentSignature(req);
  const signature = signAdminSession(email, String(expiresAt), uaSignature);
  return `${email}|${expiresAt}|${uaSignature}|${signature}`;
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function readAdminFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[ADMIN_SESSION_COOKIE];
  if (!token) return null;
  const [email, expiresAt, uaSignature, signature] = token.split('|');
  if (!email || !expiresAt || !uaSignature || !signature) return null;
  if (email.toLowerCase() !== ADMIN_EMAIL) return null;
  if (Date.now() > Number(expiresAt)) return null;
  const currentUaSignature = getUserAgentSignature(req);
  if (!safeEqual(uaSignature, currentUaSignature)) return null;
  const expected = signAdminSession(email.toLowerCase(), expiresAt, uaSignature);
  if (!safeEqual(signature, expected)) return null;
  return { email: email.toLowerCase(), expiresAt: Number(expiresAt) };
}

function setAdminSessionCookie(req, res, email) {
  const token = createAdminSessionToken(email.toLowerCase(), req);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200${secure}`
  );
}

function clearAdminSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIntent(value) {
  const intent = normalizeText(value).toLowerCase();
  const allowed = new Set(['buy', 'reserve', 'inquiry', 'service', 'other']);
  return allowed.has(intent) ? intent : '';
}

async function appendRecord(filename, record) {
  const file = path.join(DATA_DIR, filename);
  const currentRaw = await fs.readFile(file, 'utf8');
  const current = JSON.parse(currentRaw);
  current.push(record);
  await fs.writeFile(file, JSON.stringify(current, null, 2));
}

async function getRecords(filename) {
  const file = path.join(DATA_DIR, filename);
  const currentRaw = await fs.readFile(file, 'utf8');
  return JSON.parse(currentRaw);
}

async function supabaseRequest(endpoint, options = {}) {
  if (!USE_SUPABASE) {
    throw new Error('Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  return response;
}

async function supabaseNewsletterExists(email) {
  const query = `?select=id&email=eq.${encodeURIComponent(email)}&limit=1`;
  const response = await supabaseRequest(`/rest/v1/${SUPABASE_NEWSLETTER_TABLE}${query}`, {
    method: 'GET'
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase newsletter lookup failed (${response.status}): ${detail}`);
  }

  const rows = await response.json();
  return rows.length > 0;
}

async function supabaseInsert(table, record) {
  const response = await supabaseRequest(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${detail}`);
  }
}

async function supabaseSelect(table, query) {
  const response = await supabaseRequest(`/rest/v1/${table}${query}`, {
    method: 'GET'
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${detail}`);
  }
  return response.json();
}

async function supabaseUpdate(table, query, payload) {
  const response = await supabaseRequest(`/rest/v1/${table}${query}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase update failed (${response.status}): ${detail}`);
  }
  return response.json();
}

async function ensureInventorySeed() {
  if (!USE_SUPABASE) return;
  try {
    const rows = await supabaseSelect(
      SUPABASE_INVENTORY_TABLE,
      '?select=id,mango_type,fixed_size,fixed_price,starting_stock,sold_quantity,remaining_stock,low_stock_threshold'
    );

    for (const seed of MANGO_INVENTORY_SEED) {
      const exists = rows.find((r) => String(r.mango_type || '').toLowerCase() === seed.mango_type.toLowerCase());
      if (exists) continue;
      await supabaseInsert(SUPABASE_INVENTORY_TABLE, {
        id: randomUUID(),
        mango_type: seed.mango_type,
        fixed_size: seed.fixed_size,
        fixed_price: seed.fixed_price,
        starting_stock: 0,
        sold_quantity: 0,
        remaining_stock: 0,
        low_stock_threshold: 10,
        updated_at: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[admin] inventory seed skipped:', error.message);
  }
}

async function insertContactRecord(record) {
  if (!USE_SUPABASE) {
    await appendRecord('contacts.json', record);
    return;
  }

  const supabaseRecord = {
    id: record.id,
    name: record.name,
    email: record.email,
    subject: record.subject,
    message: record.message,
    source: record.source,
    product: record.product,
    intent: record.intent,
    created_at: record.createdAt
  };

  try {
    await supabaseInsert(SUPABASE_CONTACTS_TABLE, supabaseRecord);
  } catch (error) {
    const message = String(error?.message || '');
    const missingOrderColumns =
      /column .* does not exist|schema cache/i.test(message) &&
      /product|intent/i.test(message);

    if (!missingOrderColumns) throw error;

    const legacyRecord = {
      id: record.id,
      name: record.name,
      email: record.email,
      subject: record.subject,
      message: record.message,
      source: record.source,
      created_at: record.createdAt
    };

    await supabaseInsert(SUPABASE_CONTACTS_TABLE, legacyRecord);
  }
}

function encodeFilter(value) {
  return encodeURIComponent(String(value));
}

async function getOrders(limit) {
  const limitPart = limit ? `&limit=${Number(limit)}` : '';
  return supabaseSelect(
    SUPABASE_ORDERS_TABLE,
    `?select=*&order=created_at.desc${limitPart}`
  );
}

async function getInventory() {
  return supabaseSelect(
    SUPABASE_INVENTORY_TABLE,
    '?select=*&order=mango_type.asc'
  );
}

async function upsertOrderFromStripeSession(session) {
  const sessionId = session.id;
  const existing = await supabaseSelect(
    SUPABASE_ORDERS_TABLE,
    `?select=id,stripe_session_id&stripe_session_id=eq.${encodeFilter(sessionId)}&limit=1`
  );
  if (existing.length > 0) return { duplicate: true };

  const metadata = session.metadata || {};
  const mangoType = normalizeText(metadata.mango_type) || 'Mango Type 1';
  const quantity = Number.parseInt(metadata.quantity || '1', 10) || 1;
  const orderType = normalizeText(metadata.order_type).toLowerCase() === 'delivery' ? 'Delivery' : 'Pickup';
  const deliveryAddress = normalizeText(metadata.delivery_address);
  const createdAt = new Date().toISOString();

  await supabaseInsert(SUPABASE_ORDERS_TABLE, {
    id: randomUUID(),
    stripe_session_id: session.id,
    stripe_payment_intent_id: normalizeText(session.payment_intent),
    customer_name: normalizeText(metadata.customer_name) || normalizeText(session.customer_details?.name),
    customer_email: normalizeText(metadata.customer_email) || normalizeText(session.customer_details?.email),
    customer_phone: normalizeText(metadata.customer_phone) || normalizeText(session.customer_details?.phone),
    mango_type: mangoType,
    quantity,
    order_type: orderType,
    delivery_address: orderType === 'Delivery' ? deliveryAddress : '',
    amount_total: Number(session.amount_total || 0) / 100,
    currency: String(session.currency || 'cad').toUpperCase(),
    payment_status: 'paid',
    fulfillment_status: 'pending',
    admin_note: '',
    created_at: createdAt,
    updated_at: createdAt
  });

  const invRows = await supabaseSelect(
    SUPABASE_INVENTORY_TABLE,
    `?select=*&mango_type=eq.${encodeFilter(mangoType)}&limit=1`
  );
  if (invRows.length > 0) {
    const row = invRows[0];
    const soldQuantity = Number(row.sold_quantity || 0) + quantity;
    const remainingStock = Number(row.remaining_stock || 0) - quantity;
    await supabaseUpdate(
      SUPABASE_INVENTORY_TABLE,
      `?id=eq.${encodeFilter(row.id)}`,
      {
        sold_quantity: soldQuantity,
        remaining_stock: remainingStock,
        updated_at: new Date().toISOString()
      }
    );
  }

  return { duplicate: false };
}

const pageRoutes = {
  '/': 'index.html',
  '/home': 'index.html',
  '/home/': 'index.html',
  '/checkout': 'checkout/index.html',
  '/checkout/': 'checkout/index.html',
  '/reserve': 'reserve/index.html',
  '/reserve/': 'reserve/index.html',
  '/products': 'products/index.html',
  '/products/': 'products/index.html',
  '/admin/login': 'admin/login/index.html',
  '/admin/login/': 'admin/login/index.html',
  '/admin': 'admin/index.html',
  '/admin/': 'admin/index.html',
  '/admin/orders': 'admin/orders/index.html',
  '/admin/orders/': 'admin/orders/index.html',
  '/admin/inventory': 'admin/inventory/index.html',
  '/admin/inventory/': 'admin/inventory/index.html',
  '/about': 'ameer_global_about_network_refined/index.html',
  '/about/': 'ameer_global_about_network_refined/index.html',
  '/contact': 'ameer_global_contact/index.html',
  '/contact/': 'ameer_global_contact/index.html'
};

async function serveFile(req, res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const stat = await fs.stat(filePath);
    const etag = `W/\"${stat.size}-${Math.floor(stat.mtimeMs).toString(16)}\"`;
    const ifNoneMatch = req.headers['if-none-match'];

    if (ifNoneMatch && ifNoneMatch === etag) {
      res.writeHead(304, {
        ETag: etag
      });
      res.end();
      return;
    }

    const cacheControl = LONG_CACHE_EXTENSIONS.has(ext)
      ? 'public, max-age=31536000, immutable'
      : ext === '.html'
        ? 'public, max-age=0, must-revalidate'
        : 'public, max-age=300, must-revalidate';

    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': new Date(stat.mtimeMs).toUTCString()
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      Allow: 'GET,POST,OPTIONS',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      service: 'ameerglobal-api',
      uptime: process.uptime(),
      supabaseActive: USE_SUPABASE,
      supabaseUrlValid: SUPABASE_URL_VALID,
      storageMode: USE_SUPABASE ? 'supabase' : 'local-json'
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/admin/diagnostics') {
    try {
      const admin = readAdminFromRequest(req);
      if (!admin) {
        json(res, 401, { error: 'Unauthorized' });
        return true;
      }

      const diagnostics = {
        adminEmail: ADMIN_EMAIL,
        baseUrl: BASE_URL,
        auth: {
          loginCodeConfigured: Boolean(ADMIN_LOGIN_CODE),
          sessionSecretConfigured: Boolean(ADMIN_SESSION_SECRET)
        },
        supabase: {
          configured: USE_SUPABASE,
          urlValid: SUPABASE_URL_VALID,
          hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
          ordersTable: SUPABASE_ORDERS_TABLE,
          inventoryTable: SUPABASE_INVENTORY_TABLE
        },
        stripe: {
          configured: Boolean(stripe),
          webhookSecretConfigured: Boolean(STRIPE_WEBHOOK_SECRET)
        }
      };

      if (USE_SUPABASE) {
        try {
          await supabaseSelect(SUPABASE_ORDERS_TABLE, '?select=id&limit=1');
          diagnostics.supabase.ordersTableReachable = true;
        } catch (err) {
          diagnostics.supabase.ordersTableReachable = false;
          diagnostics.supabase.ordersTableError = err.message;
        }

        try {
          await supabaseSelect(SUPABASE_INVENTORY_TABLE, '?select=id&limit=1');
          diagnostics.supabase.inventoryTableReachable = true;
        } catch (err) {
          diagnostics.supabase.inventoryTableReachable = false;
          diagnostics.supabase.inventoryTableError = err.message;
        }
      }

      json(res, 200, diagnostics);
      return true;
    } catch (err) {
      json(res, 500, { error: err.message || 'Unable to load diagnostics.' });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/admin/links') {
    const admin = readAdminFromRequest(req);
    if (!admin) {
      json(res, 401, { error: 'Unauthorized' });
      return true;
    }
    json(res, 200, {
      pages: ['/admin/login/', '/admin/', '/admin/orders/', '/admin/inventory/'],
      apis: [
        '/api/admin/session',
        '/api/admin/dashboard',
        '/api/admin/orders',
        '/api/admin/orders-update',
        '/api/admin/inventory',
        '/api/admin/inventory-update',
        '/api/admin/diagnostics',
        '/api/admin/logout',
        '/api/stripe/webhook'
      ]
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/products') {
    json(res, 200, { items: products });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/admin/session') {
    const admin = readAdminFromRequest(req);
    json(res, 200, {
      authenticated: Boolean(admin),
      email: admin ? admin.email : null,
      expiresAt: admin ? admin.expiresAt : null
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    try {
      const body = await readBody(req);
      const email = normalizeText(body.email).toLowerCase();
      const code = normalizeText(body.code);
      if (email !== ADMIN_EMAIL) {
        json(res, 403, { error: 'Access denied for this email.' });
        return true;
      }
      if (!ADMIN_LOGIN_CODE) {
        json(res, 500, { error: 'Admin login code is not configured on server.' });
        return true;
      }
      if (code !== ADMIN_LOGIN_CODE) {
        json(res, 403, { error: 'Invalid admin passcode.' });
        return true;
      }
      setAdminSessionCookie(req, res, email);
      json(res, 200, { ok: true, email });
      return true;
    } catch (err) {
      json(res, 400, { error: err.message || 'Invalid login request.' });
      return true;
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    clearAdminSessionCookie(res);
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'POST' && (pathname === '/api/stripe/webhook' || pathname === '/api/stripe-webhook')) {
    try {
      if (!stripe || !STRIPE_WEBHOOK_SECRET) {
        json(res, 500, { error: 'Stripe webhook is not configured.' });
        return true;
      }
      const rawBody = await readRawBody(req);
      const signature = req.headers['stripe-signature'];
      if (!signature) {
        json(res, 400, { error: 'Missing Stripe signature.' });
        return true;
      }

      const event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        if (USE_SUPABASE) {
          await upsertOrderFromStripeSession(session);
        }
      }
      json(res, 200, { received: true });
      return true;
    } catch (err) {
      json(res, 400, { error: `Webhook error: ${err.message}` });
      return true;
    }
  }

  if (req.method === 'POST' && pathname === '/api/newsletter') {
    try {
      const body = await readBody(req);
      const email = normalizeText(body.email).toLowerCase();

      if (!validateEmail(email)) {
        json(res, 400, { error: 'Valid email is required.' });
        return true;
      }
      const record = {
        id: randomUUID(),
        email,
        createdAt: new Date().toISOString()
      };

      if (USE_SUPABASE) {
        const exists = await supabaseNewsletterExists(email);
        if (exists) {
          json(res, 200, { ok: true, message: 'Already subscribed.' });
          return true;
        }

        await supabaseInsert(SUPABASE_NEWSLETTER_TABLE, {
          id: record.id,
          email: record.email,
          created_at: record.createdAt
        });
      } else {
        const existing = await getRecords('newsletter.json');
        if (existing.some((item) => item.email === email)) {
          json(res, 200, { ok: true, message: 'Already subscribed.' });
          return true;
        }

        await appendRecord('newsletter.json', record);
      }

      json(res, 201, { ok: true, message: 'Subscribed successfully.' });
      return true;
    } catch (err) {
      json(res, 400, { error: err.message || 'Invalid request' });
      return true;
    }
  }

  if (req.method === 'POST' && pathname === '/api/contact') {
    try {
      const body = await readBody(req);
      const name = normalizeText(body.name);
      const email = normalizeText(body.email).toLowerCase();
      const subject = normalizeText(body.subject);
      const message = normalizeText(body.message);
      const source = normalizeText(body.source) || 'website';
      const product = normalizeText(body.product);
      const intent = normalizeIntent(body.intent);

      if (!name || name.length < 2) {
        json(res, 400, { error: 'Name must be at least 2 characters.' });
        return true;
      }

      if (!validateEmail(email)) {
        json(res, 400, { error: 'Valid email is required.' });
        return true;
      }

      if (!subject || subject.length < 3) {
        json(res, 400, { error: 'Subject must be at least 3 characters.' });
        return true;
      }

      if (!message || message.length < 10) {
        json(res, 400, { error: 'Message must be at least 10 characters.' });
        return true;
      }

      const record = {
        id: randomUUID(),
        name,
        email,
        subject,
        message,
        source,
        product,
        intent,
        createdAt: new Date().toISOString()
      };

      await insertContactRecord(record);

      json(res, 201, { ok: true, message: 'Inquiry sent successfully.' });
      return true;
    } catch (err) {
      json(res, 400, { error: err.message || 'Invalid request' });
      return true;
    }
  }

  if (req.method === 'POST' && (pathname === '/api/reserve' || pathname === '/api/reserve/')) {
    try {
      const body = await readBody(req);
      const name = normalizeText(body.name);
      const email = normalizeText(body.email).toLowerCase();
      const subject = normalizeText(body.subject);
      const message = normalizeText(body.message);
      const source = normalizeText(body.source) || 'reserve-page';
      const product = normalizeText(body.product);
      const intent = 'reserve';

      if (!name || name.length < 2) {
        json(res, 400, { error: 'Name must be at least 2 characters.' });
        return true;
      }

      if (!validateEmail(email)) {
        json(res, 400, { error: 'Valid email is required.' });
        return true;
      }

      if (!subject || subject.length < 3) {
        json(res, 400, { error: 'Subject must be at least 3 characters.' });
        return true;
      }

      if (!message || message.length < 10) {
        json(res, 400, { error: 'Message must be at least 10 characters.' });
        return true;
      }

      const record = {
        id: randomUUID(),
        name,
        email,
        subject,
        message,
        source,
        product,
        intent,
        createdAt: new Date().toISOString()
      };

      await insertContactRecord(record);

      json(res, 201, { ok: true, message: 'Reserve request submitted successfully.', submissionId: record.id });
      return true;
    } catch (err) {
      json(res, 400, { error: err.message || 'Invalid request' });
      return true;
    }
  }

  if (req.method === 'POST' && pathname === '/api/availability') {
    try {
      const body = await readBody(req);
      const result = buildAvailabilityResponse(body);
      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (err) {
      json(res, 400, { error: err.message || 'Unable to check availability.' });
      return true;
    }
  }

  if (req.method === 'POST' && (pathname === '/api/checkout' || pathname === '/api/checkout/')) {
    try {
      if (!stripe) {
        json(res, 500, { error: 'Stripe is not configured on the server.' });
        return true;
      }
      const body = await readBody(req);
      const checkout = buildCheckoutContactRecord(body);
      await insertContactRecord(checkout.contactRecord);
      const metadata = {
        mango_type: checkout.contactRecord.product,
        quantity: String(checkout.quantity),
        order_type: normalizeText(body.fulfillment).toLowerCase() === 'delivery' ? 'Delivery' : 'Pickup',
        customer_name: checkout.contactRecord.name,
        customer_email: checkout.contactRecord.email,
        customer_phone: normalizeText(body.phone)
      };

      if (metadata.order_type === 'Delivery') {
        metadata.delivery_address = [
          normalizeText(body.addressLine1),
          normalizeText(body.addressLine2),
          normalizeText(body.city),
          normalizeText(body.postalCode)
        ]
          .filter(Boolean)
          .join(', ');
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        success_url: `${BASE_URL}/checkout/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${BASE_URL}/checkout/`,
        customer_email: checkout.contactRecord.email,
        line_items: [
          {
            price_data: {
              currency: 'cad',
              product_data: {
                name: checkout.contactRecord.product
              },
              unit_amount: Math.round(checkout.billing.unitPriceCad * 100)
            },
            quantity: checkout.billing.quantity
          }
        ],
        metadata,
        payment_intent_data: {
          metadata
        }
      });

      json(res, 201, {
        ok: true,
        availability: {
          eligible: true,
          city: checkout.availability.city.label,
          region: checkout.availability.region,
          postalCode: checkout.availability.postalCode
        },
        billing: checkout.billing,
        payment: { method: 'stripe', label: 'Stripe Checkout', status: 'redirect', url: session.url },
        submissionId: checkout.contactRecord.id
      });
      return true;
    } catch (err) {
      json(res, 400, { error: err.message || 'Unable to continue checkout.' });
      return true;
    }
  }

  if (pathname.startsWith('/api/admin/')) {
    const admin = readAdminFromRequest(req);
    if (!admin) {
      json(res, 401, { error: 'Unauthorized' });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/admin/dashboard') {
    try {
      if (!USE_SUPABASE) {
        json(res, 400, { error: 'Supabase is required for admin dashboard.' });
        return true;
      }

      await ensureInventorySeed();
      const [orders, inventory] = await Promise.all([getOrders(), getInventory()]);
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum, row) => sum + Number(row.amount_total || 0), 0);
      const pendingOrders = orders.filter((row) => String(row.fulfillment_status || '').toLowerCase() === 'pending').length;
      const fulfilledOrders = orders.filter((row) => String(row.fulfillment_status || '').toLowerCase() === 'fulfilled').length;
      const totalInventoryRemaining = inventory.reduce((sum, row) => sum + Number(row.remaining_stock || 0), 0);

      json(res, 200, {
        totalOrders,
        totalRevenue,
        pendingOrders,
        fulfilledOrders,
        totalInventoryRemaining,
        inventory,
        recentOrders: orders.slice(0, 10)
      });
      return true;
    } catch (err) {
      json(res, 500, { error: err.message || 'Unable to load dashboard.' });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/admin/orders') {
    try {
      if (!USE_SUPABASE) {
        json(res, 400, { error: 'Supabase is required for admin orders.' });
        return true;
      }
      const orders = await getOrders();
      json(res, 200, { orders });
      return true;
    } catch (err) {
      json(res, 500, { error: err.message || 'Unable to load orders.' });
      return true;
    }
  }

  if (req.method === 'POST' && (pathname === '/api/admin/orders/update' || pathname === '/api/admin/orders-update')) {
    try {
      if (!USE_SUPABASE) {
        json(res, 400, { error: 'Supabase is required for admin orders.' });
        return true;
      }
      const body = await readBody(req);
      const id = normalizeText(body.id);
      if (!id) {
        json(res, 400, { error: 'Order id is required.' });
        return true;
      }
      const updates = { updated_at: new Date().toISOString() };
      const allowedStatuses = new Set(['pending', 'fulfilled', 'cancelled']);
      const nextStatus = normalizeText(body.fulfillment_status).toLowerCase();
      if (allowedStatuses.has(nextStatus)) updates.fulfillment_status = nextStatus;
      if (typeof body.admin_note === 'string') updates.admin_note = body.admin_note.trim();
      const rows = await supabaseUpdate(SUPABASE_ORDERS_TABLE, `?id=eq.${encodeFilter(id)}`, updates);
      json(res, 200, { ok: true, order: rows[0] || null });
      return true;
    } catch (err) {
      json(res, 500, { error: err.message || 'Unable to update order.' });
      return true;
    }
  }

  if (req.method === 'GET' && pathname === '/api/admin/inventory') {
    try {
      if (!USE_SUPABASE) {
        json(res, 400, { error: 'Supabase is required for admin inventory.' });
        return true;
      }
      await ensureInventorySeed();
      const inventory = await getInventory();
      json(res, 200, { inventory });
      return true;
    } catch (err) {
      json(res, 500, { error: err.message || 'Unable to load inventory.' });
      return true;
    }
  }

  if (req.method === 'POST' && (pathname === '/api/admin/inventory/update' || pathname === '/api/admin/inventory-update')) {
    try {
      if (!USE_SUPABASE) {
        json(res, 400, { error: 'Supabase is required for admin inventory.' });
        return true;
      }
      const body = await readBody(req);
      const id = normalizeText(body.id);
      if (!id) {
        json(res, 400, { error: 'Inventory id is required.' });
        return true;
      }
      const rows = await supabaseSelect(SUPABASE_INVENTORY_TABLE, `?select=*&id=eq.${encodeFilter(id)}&limit=1`);
      if (rows.length === 0) {
        json(res, 404, { error: 'Inventory item not found.' });
        return true;
      }
      const row = rows[0];
      const action = normalizeText(body.action).toLowerCase();
      const amount = Number.parseInt(body.amount, 10) || 0;
      let remaining = Number(row.remaining_stock || 0);
      let sold = Number(row.sold_quantity || 0);
      let starting = Number(row.starting_stock || 0);
      let lowStock = Number(row.low_stock_threshold || 10);

      if (action === 'set' && Number.isFinite(Number(body.remaining_stock))) {
        remaining = Number(body.remaining_stock);
      } else if (action === 'increase' && amount > 0) {
        remaining += amount;
        starting += amount;
      } else if (action === 'decrease' && amount > 0) {
        remaining -= amount;
      }

      if (Number.isFinite(Number(body.low_stock_threshold))) {
        lowStock = Number(body.low_stock_threshold);
      }

      if (remaining < 0) remaining = 0;
      if (sold < 0) sold = 0;
      if (starting < 0) starting = 0;

      const updated = await supabaseUpdate(
        SUPABASE_INVENTORY_TABLE,
        `?id=eq.${encodeFilter(id)}`,
        {
          starting_stock: starting,
          sold_quantity: sold,
          remaining_stock: remaining,
          low_stock_threshold: lowStock,
          updated_at: new Date().toISOString()
        }
      );

      json(res, 200, { ok: true, inventory: updated[0] || null });
      return true;
    } catch (err) {
      json(res, 500, { error: err.message || 'Unable to update inventory.' });
      return true;
    }
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const requestUrl = new URL(req.url || '/', `http://${host}`);
    const pathname = requestUrl.pathname;
    const adminSession = readAdminFromRequest(req);

    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname);
      if (!handled) {
        json(res, 404, { error: 'API route not found' });
      }
      return;
    }

    if (pathname === '/admin/login' || pathname === '/admin/login/') {
      if (adminSession) {
        res.writeHead(302, { Location: '/admin/' });
        res.end();
        return;
      }
    } else if (pathname.startsWith('/admin')) {
      if (!adminSession) {
        res.writeHead(302, { Location: '/admin/login/' });
        res.end();
        return;
      }
    }

    if (pageRoutes[pathname]) {
      const absolute = path.join(ROOT, pageRoutes[pathname]);
      await serveFile(req, res, absolute);
      return;
    }

    const staticPath = sanitizePath(pathname);
    const absolutePath = path.join(ROOT, staticPath);

    if (absolutePath.startsWith(ROOT) && await fileExists(absolutePath)) {
      if (await isDirectory(absolutePath)) {
        await serveFile(req, res, path.join(absolutePath, 'index.html'));
        return;
      }

      await serveFile(req, res, absolutePath);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    json(res, 500, { error: 'Internal server error', detail: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Ameer Global server running on http://localhost:${PORT}`);
  ensureInventorySeed().catch((err) => {
    console.error('[admin] inventory seed error:', err.message);
  });
});
