const { json } = require('./_lib/common');

const KEEPALIVE_KEY = process.env.KEEPALIVE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const CONTACTS_TABLE = process.env.SUPABASE_CONTACTS_TABLE || 'contacts';
const ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || 'orders';
const INVENTORY_TABLE = process.env.SUPABASE_INVENTORY_TABLE || 'inventory';
const SOURCE_VERSION = 'inventory-fallback-20260603';
const CONTACTS_SELECTS = ['id'];
const ORDERS_SELECTS = ['order_number', 'id', 'stripe_session_id'];
const INVENTORY_SELECTS = ['product', 'mango_type', 'id'];

function authHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };
}

async function pingTable(baseUrl, serviceRoleKey, table, selectCandidates) {
  let lastError = '';

  for (const column of selectCandidates) {
    const res = await fetch(`${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(column)}&limit=1`, {
      headers: authHeaders(serviceRoleKey)
    });

    if (res.ok) {
      await res.text();
      return;
    }

    lastError = await res.text();
  }

  throw new Error(lastError || `Keepalive probe failed for ${table}`);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabaseActive = Boolean(supabaseUrl && serviceRoleKey);
  const url = new URL(req.url || '', 'http://localhost');
  const authHeader = req.headers.authorization || '';
  const isVercelCronRequest = Boolean(CRON_SECRET) && authHeader === `Bearer ${CRON_SECRET}`;
  const wantsDeepPing = url.searchParams.get('deep') === '1' || isVercelCronRequest;

  if (wantsDeepPing) {
    const providedKey = req.headers['x-keepalive-key'] || url.searchParams.get('key') || '';
    if (!isVercelCronRequest && !KEEPALIVE_KEY) {
      json(res, 503, { ok: false, error: 'KEEPALIVE_KEY is not configured.' });
      return;
    }
    if (!isVercelCronRequest && providedKey !== KEEPALIVE_KEY) {
      json(res, 401, { ok: false, error: 'Unauthorized keepalive request.' });
      return;
    }

    if (!supabaseActive) {
      json(res, 503, {
      ok: false,
      service: 'ameerglobal-api',
      runtime: 'vercel-function',
      sourceVersion: SOURCE_VERSION,
      supabaseActive: false,
      keepalive: { ok: false, error: 'Supabase is not configured.' }
      });
      return;
    }

    const keepalive = {
      ok: true,
      contactsReachable: false,
      ordersReachable: false,
      inventoryReachable: false,
      error: ''
    };

    try {
      await pingTable(supabaseUrl, serviceRoleKey, CONTACTS_TABLE, CONTACTS_SELECTS);
      keepalive.contactsReachable = true;
      await pingTable(supabaseUrl, serviceRoleKey, ORDERS_TABLE, ORDERS_SELECTS);
      keepalive.ordersReachable = true;
      await pingTable(supabaseUrl, serviceRoleKey, INVENTORY_TABLE, INVENTORY_SELECTS);
      keepalive.inventoryReachable = true;
    } catch (error) {
      keepalive.ok = false;
      keepalive.error = String(error?.message || error || 'Keepalive failed');
    }

    json(res, keepalive.ok ? 200 : 503, {
      ok: keepalive.ok,
      service: 'ameerglobal-api',
      runtime: 'vercel-function',
      sourceVersion: SOURCE_VERSION,
      supabaseActive,
      keepalive
    });
    return;
  }

  json(res, 200, {
    ok: true,
    service: 'ameerglobal-api',
    runtime: 'vercel-function',
    sourceVersion: SOURCE_VERSION,
    supabaseActive,
    storageMode: supabaseActive ? 'supabase' : 'disabled',
    keepaliveConfigured: Boolean(KEEPALIVE_KEY || CRON_SECRET)
  });
};
