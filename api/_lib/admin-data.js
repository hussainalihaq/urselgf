const fs = require('node:fs/promises');
const path = require('node:path');
const { json } = require('./common');
const {
  ADMIN_LOGIN_CODE,
  ADMIN_SESSION_SECRET,
  DEFAULT_ADMIN_LOGIN_CODE,
  DEFAULT_ADMIN_SESSION_SECRET
} = require('./admin-auth');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CONTACTS_TABLE = process.env.SUPABASE_CONTACTS_TABLE || 'contacts';
const ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || 'orders';
const INVENTORY_TABLE = process.env.SUPABASE_INVENTORY_TABLE || 'inventory';

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function sb(endpoint, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return res;
}

async function readArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeOrder(row) {
  const orderType = (row.order_type || row.fulfillment || '').toLowerCase();
  const isDelivery = orderType.includes('delivery');
  const address = row.delivery_address || [row.address_line_1, row.address_line_2, row.city, row.postal_code].filter(Boolean).join(', ');
  const paymentStatus = row.payment_status || row.status || '';
  const fulfillmentStatus = row.fulfillment_status || (paymentStatus === 'paid' ? 'pending' : 'pending');

  return {
    id: row.id || row.order_number || '',
    stripe_session_id: row.stripe_session_id || '',
    stripe_payment_intent_id: row.stripe_payment_intent_id || row.payment_intent_id || '',
    customer_name: row.customer_name || '',
    customer_email: row.customer_email || '',
    customer_phone: row.customer_phone || row.phone || '',
    mango_type: row.mango_type || row.product || '',
    quantity: Number(row.quantity || 0),
    order_type: isDelivery ? 'Delivery' : (orderType ? 'Pickup' : ''),
    delivery_address: address || '',
    amount_total: Number(row.amount_total || 0),
    currency: String(row.currency || 'CAD').toUpperCase(),
    payment_status: paymentStatus,
    fulfillment_status: fulfillmentStatus,
    admin_note: row.admin_note || '',
    created_at: row.created_at || '',
    updated_at: row.updated_at || ''
  };
}

function normalizeInventory(row) {
  const remaining = Number(row.remaining_stock ?? row.stock_on_hand ?? 0);
  const sold = Number(row.sold_quantity ?? 0);
  const starting = Number(row.starting_stock ?? (remaining + sold));
  return {
    id: row.id || row.product || row.mango_type,
    mango_type: row.mango_type || row.product || '',
    fixed_size: row.fixed_size || '',
    fixed_price: Number(row.fixed_price || 0),
    starting_stock: starting,
    sold_quantity: sold,
    remaining_stock: remaining,
    low_stock_threshold: Number(row.low_stock_threshold || 10),
    updated_at: row.updated_at || ''
  };
}

function parseReserveMessage(message) {
  const out = {
    quantity: '',
    phone: '',
    company: '',
    city: '',
    country: '',
    delivery_window: '',
    notes: ''
  };

  for (const line of String(message || '').split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const label = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (label === 'quantity') out.quantity = value;
    if (label === 'phone') out.phone = value;
    if (label === 'company') out.company = value;
    if (label === 'city') out.city = value;
    if (label === 'country') out.country = value;
    if (label === 'delivery window') out.delivery_window = value;
    if (label === 'notes') out.notes = value;
  }

  return out;
}

function normalizeReservation(row) {
  const parsed = parseReserveMessage(row.message);
  const product = row.product || '';
  const cityCountry = [parsed.city, parsed.country].filter(Boolean).join(', ');

  return {
    id: row.id || '',
    customer_name: row.name || '',
    customer_email: row.email || '',
    customer_phone: parsed.phone || '',
    product,
    quantity: parsed.quantity || '',
    company: parsed.company || '',
    market: cityCountry,
    delivery_window: parsed.delivery_window || '',
    notes: parsed.notes || '',
    source: row.source || '',
    created_at: row.created_at || ''
  };
}

async function listReservations() {
  let rows;
  const reserveQuery =
    `?select=*` +
    `&or=(intent.eq.reserve,source.eq.reserve-page,subject.ilike.*Reserve%20Request*)` +
    `&order=created_at.desc&limit=500`;

  if (hasSupabase()) {
    try {
      const res = await sb(`/rest/v1/${CONTACTS_TABLE}${reserveQuery}`);
      if (!res.ok) throw new Error(await res.text());
      rows = await res.json();
    } catch {
      rows = [];
    }
  } else {
    rows = [];
  }

  return rows.map(normalizeReservation).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function listOrders() {
  let rows;
  if (hasSupabase()) {
    try {
      const res = await sb(`/rest/v1/${ORDERS_TABLE}?select=*&order=created_at.desc&limit=500`);
      if (!res.ok) throw new Error(await res.text());
      rows = await res.json();
    } catch {
      rows = await readArray(ORDERS_FILE);
    }
  } else {
    rows = await readArray(ORDERS_FILE);
  }
  return rows.map(normalizeOrder).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function listInventory() {
  let rows;
  if (hasSupabase()) {
    try {
      const res = await sb(`/rest/v1/${INVENTORY_TABLE}?select=*`);
      if (!res.ok) throw new Error(await res.text());
      rows = await res.json();
    } catch {
      rows = await readArray(INVENTORY_FILE);
    }
  } else {
    rows = await readArray(INVENTORY_FILE);
  }
  return rows.map(normalizeInventory).slice(0, 3);
}

async function updateOrderStatus(id, fulfillmentStatus, adminNote) {
  const now = new Date().toISOString();
  if (hasSupabase()) {
    let res = await sb(`/rest/v1/${ORDERS_TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ fulfillment_status: fulfillmentStatus, admin_note: adminNote, updated_at: now })
    });
    if (!res.ok) throw new Error(await res.text());
    let rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      res = await sb(`/rest/v1/${ORDERS_TABLE}?order_number=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ fulfillment_status: fulfillmentStatus, admin_note: adminNote, updated_at: now })
      });
      if (!res.ok) throw new Error(await res.text());
      rows = await res.json();
    }
    return rows[0] || null;
  }
  const rows = await readArray(ORDERS_FILE);
  const i = rows.findIndex((r) => String(r.id || r.order_number) === String(id));
  if (i === -1) return null;
  rows[i] = { ...rows[i], fulfillment_status: fulfillmentStatus, admin_note: adminNote, updated_at: now };
  await fs.writeFile(ORDERS_FILE, JSON.stringify(rows, null, 2));
  return rows[i];
}

async function updateInventoryItem(id, action, amount, remainingStock, lowStockThreshold) {
  const now = new Date().toISOString();
  const items = await listInventory();
  const current = items.find((x) => String(x.id) === String(id));
  if (!current) throw new Error('Inventory item not found');

  let nextRemaining = Number(current.remaining_stock || 0);
  const delta = Number(amount || 0);
  if (action === 'set') nextRemaining = Math.max(0, Number(remainingStock || 0));
  if (action === 'increase') nextRemaining = Math.max(0, nextRemaining + Math.abs(delta));
  if (action === 'decrease') nextRemaining = Math.max(0, nextRemaining - Math.abs(delta));

  const nextLow = Math.max(0, Number(lowStockThreshold ?? current.low_stock_threshold ?? 10));
  const nextSold = Math.max(0, Number(current.starting_stock) - nextRemaining);

  const patch = {
    remaining_stock: nextRemaining,
    low_stock_threshold: nextLow,
    sold_quantity: nextSold,
    updated_at: now,
    stock_on_hand: nextRemaining
  };

  if (hasSupabase()) {
    let res = await sb(`/rest/v1/${INVENTORY_TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error(await res.text());
    let rows = await res.json();
    if (!rows.length) {
      res = await sb(`/rest/v1/${INVENTORY_TABLE}?product=eq.${encodeURIComponent(current.mango_type)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error(await res.text());
      rows = await res.json();
    }
    return rows[0] || null;
  }

  const rows = await readArray(INVENTORY_FILE);
  const i = rows.findIndex((r) => String(r.id || r.product || r.mango_type) === String(id));
  if (i === -1) throw new Error('Inventory item not found');
  rows[i] = { ...rows[i], ...patch };
  await fs.writeFile(INVENTORY_FILE, JSON.stringify(rows, null, 2));
  return rows[i];
}

function healthFromError(err) {
  return String(err?.message || err || 'Unknown error');
}

async function diagnostics() {
  const out = {
    auth: {
      loginCodeConfigured: Boolean(ADMIN_LOGIN_CODE),
      sessionSecretConfigured: Boolean(ADMIN_SESSION_SECRET),
      usingFallbackLoginCode: ADMIN_LOGIN_CODE === DEFAULT_ADMIN_LOGIN_CODE && !process.env.ADMIN_LOGIN_CODE,
      usingFallbackSessionSecret:
        ADMIN_SESSION_SECRET === DEFAULT_ADMIN_SESSION_SECRET && !process.env.ADMIN_SESSION_SECRET
    },
    supabase: {
      configured: hasSupabase(),
      urlValid: SUPABASE_URL.startsWith('https://') && SUPABASE_URL.includes('.supabase.co'),
      contactsTableReachable: null,
      contactsTableError: '',
      ordersTableReachable: null,
      ordersTableError: '',
      inventoryTableReachable: null,
      inventoryTableError: ''
    },
    stripe: {
      configured: Boolean(process.env.STRIPE_SECRET_KEY),
      webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET)
    }
  };

  if (hasSupabase()) {
    try {
      const res = await sb(`/rest/v1/${CONTACTS_TABLE}?select=id&limit=1`);
      out.supabase.contactsTableReachable = res.ok;
      if (!res.ok) out.supabase.contactsTableError = await res.text();
    } catch (err) {
      out.supabase.contactsTableReachable = false;
      out.supabase.contactsTableError = healthFromError(err);
    }

    try {
      const res = await sb(`/rest/v1/${ORDERS_TABLE}?select=id&limit=1`);
      out.supabase.ordersTableReachable = res.ok;
      if (!res.ok) out.supabase.ordersTableError = await res.text();
    } catch (err) {
      out.supabase.ordersTableReachable = false;
      out.supabase.ordersTableError = healthFromError(err);
    }

    try {
      const res = await sb(`/rest/v1/${INVENTORY_TABLE}?select=id&limit=1`);
      out.supabase.inventoryTableReachable = res.ok;
      if (!res.ok) out.supabase.inventoryTableError = await res.text();
    } catch (err) {
      out.supabase.inventoryTableReachable = false;
      out.supabase.inventoryTableError = healthFromError(err);
    }
  }

  return out;
}

function sendError(res, error, status = 500) {
  json(res, status, { error: String(error?.message || error || 'Request failed') });
}

module.exports = {
  diagnostics,
  listInventory,
  listOrders,
  listReservations,
  sendError,
  updateInventoryItem,
  updateOrderStatus
};
