const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || 'orders';
const SUPABASE_INVENTORY_TABLE = process.env.SUPABASE_INVENTORY_TABLE || 'inventory';

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function todayStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeJsonArray(filePath, rows) {
  await fs.writeFile(filePath, JSON.stringify(rows, null, 2));
}

async function supabaseRequest(endpoint, options = {}) {
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

function nextOrderNumberFromRows(rows, stamp) {
  const prefix = `AMG-${stamp}-`;
  const todays = rows
    .map((row) => String(row.order_number || ''))
    .filter((v) => v.startsWith(prefix))
    .map((v) => Number.parseInt(v.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const maxSeq = todays.length ? Math.max(...todays) : 0;
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

async function generateOrderNumber() {
  const stamp = todayStamp();
  if (hasSupabase()) {
    const response = await supabaseRequest(
      `/rest/v1/${SUPABASE_ORDERS_TABLE}?select=order_number&order=created_at.desc&limit=500`
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase order number lookup failed (${response.status}): ${detail}`);
    }
    const rows = await response.json();
    return nextOrderNumberFromRows(rows, stamp);
  }
  const rows = await readJsonArray(ORDERS_FILE);
  return nextOrderNumberFromRows(rows, stamp);
}

async function createPendingOrder(order) {
  const now = new Date().toISOString();
  const record = {
    order_number: order.orderNumber,
    submission_id: order.submissionId,
    stripe_session_id: order.stripeSessionId || '',
    payment_intent_id: '',
    customer_name: order.customerName || '',
    customer_email: order.customerEmail || '',
    phone: order.phone || '',
    product: order.product || '',
    quantity: Number(order.quantity || 1),
    fulfillment: order.fulfillment || 'pickup',
    city: order.city || '',
    postal_code: order.postalCode || '',
    address_line_1: order.addressLine1 || '',
    address_line_2: order.addressLine2 || '',
    amount_total: Number(order.amountTotal || 0),
    currency: (order.currency || 'CAD').toUpperCase(),
    status: 'pending_payment',
    created_at: now,
    updated_at: now
  };

  if (hasSupabase()) {
    const response = await supabaseRequest(`/rest/v1/${SUPABASE_ORDERS_TABLE}`, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(record)
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase order insert failed (${response.status}): ${detail}`);
    }
    return record;
  }

  const rows = await readJsonArray(ORDERS_FILE);
  rows.push(record);
  await writeJsonArray(ORDERS_FILE, rows);
  return record;
}

async function getOrderBySessionId(sessionId) {
  if (hasSupabase()) {
    const response = await supabaseRequest(
      `/rest/v1/${SUPABASE_ORDERS_TABLE}?select=*&stripe_session_id=eq.${encodeURIComponent(sessionId)}&limit=1`
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase order lookup failed (${response.status}): ${detail}`);
    }
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  const rows = await readJsonArray(ORDERS_FILE);
  return rows.find((row) => row.stripe_session_id === sessionId) || null;
}

async function markOrderPaidBySessionId(sessionId, paymentIntentId) {
  const now = new Date().toISOString();
  if (hasSupabase()) {
    const response = await supabaseRequest(
      `/rest/v1/${SUPABASE_ORDERS_TABLE}?stripe_session_id=eq.${encodeURIComponent(sessionId)}&status=eq.pending_payment`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          status: 'paid',
          payment_intent_id: paymentIntentId || '',
          updated_at: now
        })
      }
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase order update failed (${response.status}): ${detail}`);
    }
    const updated = await response.json();
    if (Array.isArray(updated) && updated.length) {
      return { order: updated[0], changed: true };
    }
    const existing = await getOrderBySessionId(sessionId);
    return { order: existing, changed: false };
  }

  const rows = await readJsonArray(ORDERS_FILE);
  const index = rows.findIndex((row) => row.stripe_session_id === sessionId);
  if (index === -1) return { order: null, changed: false };
  if (rows[index].status === 'paid') {
    return { order: rows[index], changed: false };
  }
  rows[index] = {
    ...rows[index],
    status: 'paid',
    payment_intent_id: paymentIntentId || rows[index].payment_intent_id || '',
    updated_at: now
  };
  await writeJsonArray(ORDERS_FILE, rows);
  return { order: rows[index], changed: true };
}

async function upsertPaidOrderFromSession(session, lineItems = []) {
  const existing = await getOrderBySessionId(session.id);
  if (existing) {
    if (existing.status === 'paid') return { order: existing, changed: false };
    return markOrderPaidBySessionId(session.id, session.payment_intent || '');
  }

  const metadata = session.metadata || {};
  const primaryItem = Array.isArray(lineItems) ? lineItems[0] : null;
  const quantity = Number.parseInt(String(metadata.quantity || primaryItem?.quantity || 1), 10) || 1;
  const product =
    metadata.product ||
    primaryItem?.description ||
    primaryItem?.price?.product_details?.name ||
    'Ameer Global order';
  const now = new Date().toISOString();
  const record = {
    order_number: metadata.orderNumber || (await generateOrderNumber()),
    submission_id: metadata.submissionId || '',
    stripe_session_id: session.id,
    payment_intent_id: session.payment_intent || '',
    customer_name: metadata.customerName || session.customer_details?.name || '',
    customer_email: metadata.customerEmail || session.customer_details?.email || session.customer_email || '',
    phone: metadata.phone || session.customer_details?.phone || '',
    product,
    quantity,
    fulfillment: metadata.fulfillment || metadata.orderType || 'pickup',
    city: metadata.city || '',
    postal_code: metadata.postalCode || '',
    address_line_1: metadata.addressLine1 || '',
    address_line_2: metadata.addressLine2 || '',
    amount_total: Number(session.amount_total || 0) / 100,
    currency: String(session.currency || 'cad').toUpperCase(),
    status: 'paid',
    created_at: now,
    updated_at: now
  };

  if (hasSupabase()) {
    const response = await supabaseRequest(`/rest/v1/${SUPABASE_ORDERS_TABLE}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(record)
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase paid order insert failed (${response.status}): ${detail}`);
    }
    const rows = await response.json();
    return { order: Array.isArray(rows) && rows.length ? rows[0] : record, changed: true };
  }

  const rows = await readJsonArray(ORDERS_FILE);
  rows.push(record);
  await writeJsonArray(ORDERS_FILE, rows);
  return { order: record, changed: true };
}

async function decrementInventory(product, quantity) {
  const qty = Number(quantity || 0);
  if (!product || !Number.isFinite(qty) || qty <= 0) return;

  if (hasSupabase()) {
    const getRes = await supabaseRequest(
      `/rest/v1/${SUPABASE_INVENTORY_TABLE}?select=product,stock_on_hand&product=eq.${encodeURIComponent(product)}&limit=1`,
      { method: 'GET' }
    );
    if (!getRes.ok) return;
    const rows = await getRes.json();
    const existing = rows[0];
    if (!existing) return;
    const next = Math.max(0, Number(existing.stock_on_hand || 0) - qty);
    await supabaseRequest(
      `/rest/v1/${SUPABASE_INVENTORY_TABLE}?product=eq.${encodeURIComponent(product)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ stock_on_hand: next, updated_at: new Date().toISOString() })
      }
    );
    return;
  }

  const rows = await readJsonArray(INVENTORY_FILE);
  const index = rows.findIndex((row) => row.product === product);
  if (index === -1) return;
  const next = Math.max(0, Number(rows[index].stock_on_hand || 0) - qty);
  rows[index] = {
    ...rows[index],
    stock_on_hand: next,
    updated_at: new Date().toISOString()
  };
  await writeJsonArray(INVENTORY_FILE, rows);
}

async function getStats() {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const orders = hasSupabase()
    ? await (async () => {
        const res = await supabaseRequest(`/rest/v1/${SUPABASE_ORDERS_TABLE}?select=*`);
        if (!res.ok) return [];
        const rows = await res.json();
        return Array.isArray(rows) ? rows : [];
      })()
    : await readJsonArray(ORDERS_FILE);

  const inventory = hasSupabase()
    ? await (async () => {
        const res = await supabaseRequest(`/rest/v1/${SUPABASE_INVENTORY_TABLE}?select=*`);
        if (!res.ok) return [];
        const rows = await res.json();
        return Array.isArray(rows) ? rows : [];
      })()
    : await readJsonArray(INVENTORY_FILE);

  const paid = orders.filter((o) => o.status === 'paid');
  const paidToday = paid.filter((o) => new Date(o.created_at) >= dayStart).length;
  const paidThisWeek = paid.filter((o) => new Date(o.created_at) >= weekStart).length;
  const totalRevenueCad = paid.reduce((sum, o) => sum + Number(o.amount_total || 0), 0);

  const unitsByProduct = {};
  for (const o of paid) {
    const key = o.product || 'Unknown';
    unitsByProduct[key] = (unitsByProduct[key] || 0) + Number(o.quantity || 0);
  }

  return {
    totalOrders: orders.length,
    paidOrders: paid.length,
    paidToday,
    paidThisWeek,
    totalRevenueCad: Number(totalRevenueCad.toFixed(2)),
    unitsByProduct,
    inventory
  };
}

module.exports = {
  createPendingOrder,
  decrementInventory,
  generateOrderNumber,
  getOrderBySessionId,
  getStats,
  markOrderPaidBySessionId,
  upsertPaidOrderFromSession
};
