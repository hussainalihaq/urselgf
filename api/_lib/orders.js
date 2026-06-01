const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const INVENTORY_FILE = path.join(DATA_DIR, 'inventory.json');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ORDERS_TABLE = process.env.SUPABASE_ORDERS_TABLE || 'orders';
const SUPABASE_INVENTORY_TABLE = process.env.SUPABASE_INVENTORY_TABLE || 'inventory';
const IS_VERCEL = Boolean(process.env.VERCEL);

function hasSupabase() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function ensurePersistentOrderStorage() {
  if (IS_VERCEL && !hasSupabase()) {
    throw new Error('Supabase must be configured on Vercel before accepting live orders.');
  }
}

function isMissingSupabaseTableError(detail, tableName) {
  const text = String(detail || '');
  if (!text) return false;
  return (
    text.includes('PGRST205') ||
    text.includes(`Could not find the table 'public.${tableName}'`) ||
    text.includes(`Could not find the table "${tableName}"`) ||
    /schema cache/i.test(text)
  );
}

function isSchemaMismatchError(detail, fieldName) {
  const text = String(detail || '');
  if (!text) return false;
  return (
    /column .* does not exist/i.test(text) ||
    /schema cache/i.test(text) ||
    (fieldName ? text.includes(fieldName) : false)
  );
}

function fallbackOrderNumber(stamp) {
  const suffix = `${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
  return `AMG-${stamp}-${suffix}`;
}

function parseCartItems(cartJson) {
  try {
    const parsed = JSON.parse(String(cartJson || '[]'));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        product: String(item.p || item.product || '').trim(),
        quantity: Number.parseInt(String(item.q || item.quantity || 0), 10) || 0
      }))
      .filter((item) => item.product && item.quantity > 0);
  } catch {
    return [];
  }
}

function buildFriendlyCart(cartItems) {
  return cartItems.map((item) => `${item.quantity}x ${item.product}`).join(', ');
}

function buildOrderRecordFromSession(session, lineItems = []) {
  const metadata = session.metadata || {};
  const cartItems = parseCartItems(metadata.cart_json);
  const primaryItem = Array.isArray(lineItems) ? lineItems[0] : null;
  const quantity = Number.parseInt(String(metadata.quantity || primaryItem?.quantity || 1), 10) || 1;
  const friendlyCart =
    String(metadata.mango_type || '').trim() ||
    buildFriendlyCart(cartItems) ||
    metadata.product ||
    primaryItem?.description ||
    primaryItem?.price?.product_details?.name ||
    'Ameer Global order';
  const now = new Date().toISOString();

  return {
    record: {
      order_number: metadata.orderNumber || '',
      submission_id: metadata.submissionId || '',
      stripe_session_id: session.id,
      payment_intent_id: session.payment_intent || '',
      customer_name: metadata.customerName || session.customer_details?.name || '',
      customer_email: metadata.customerEmail || session.customer_details?.email || session.customer_email || '',
      phone: metadata.phone || session.customer_details?.phone || '',
      product: friendlyCart,
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
    },
    cartItems
  };
}

function buildLegacyOrderRecord(record) {
  const isDelivery = String(record.fulfillment || '').toLowerCase() === 'delivery';
  const address = isDelivery
    ? [record.address_line_1, record.address_line_2, record.city, record.postal_code].filter(Boolean).join(', ')
    : '';

  return {
    id: record.order_number || record.submission_id || record.stripe_session_id,
    stripe_session_id: record.stripe_session_id,
    stripe_payment_intent_id: record.payment_intent_id || '',
    customer_name: record.customer_name,
    customer_email: record.customer_email,
    customer_phone: record.phone || '',
    mango_type: record.product,
    quantity: record.quantity,
    order_type: isDelivery ? 'Delivery' : 'Pickup',
    delivery_address: address,
    amount_total: record.amount_total,
    currency: record.currency,
    payment_status: record.status === 'paid' ? 'paid' : 'pending_payment',
    fulfillment_status: 'pending',
    admin_note: '',
    created_at: record.created_at,
    updated_at: record.updated_at
  };
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
  ensurePersistentOrderStorage();
  const stamp = todayStamp();
  if (hasSupabase()) {
    try {
      const response = await supabaseRequest(
        `/rest/v1/${SUPABASE_ORDERS_TABLE}?select=order_number&order=created_at.desc&limit=500`
      );
      if (!response.ok) {
        const detail = await response.text();
        if (isMissingSupabaseTableError(detail, SUPABASE_ORDERS_TABLE)) {
          return fallbackOrderNumber(stamp);
        }
        if (isSchemaMismatchError(detail, 'order_number')) {
          return fallbackOrderNumber(stamp);
        }
        if (response.status >= 500) {
          return fallbackOrderNumber(stamp);
        }
        return fallbackOrderNumber(stamp);
      }
      const rows = await response.json();
      return nextOrderNumberFromRows(rows, stamp);
    } catch {
      return fallbackOrderNumber(stamp);
    }
  }
  const rows = await readJsonArray(ORDERS_FILE);
  return nextOrderNumberFromRows(rows, stamp);
}

async function createPendingOrder(order) {
  ensurePersistentOrderStorage();
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
    let response = await supabaseRequest(`/rest/v1/${SUPABASE_ORDERS_TABLE}`, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(record)
    });
    if (!response.ok) {
      const detail = await response.text();
      if (isMissingSupabaseTableError(detail, SUPABASE_ORDERS_TABLE)) {
        return { ...record, storage_skipped: 'missing_orders_table' };
      }
      if (isSchemaMismatchError(detail, 'order_number') || isSchemaMismatchError(detail, 'payment_intent_id')) {
        response = await supabaseRequest(`/rest/v1/${SUPABASE_ORDERS_TABLE}`, {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(buildLegacyOrderRecord(record))
        });
        if (!response.ok) {
          const legacyDetail = await response.text();
          throw new Error(`Supabase legacy order insert failed (${response.status}): ${legacyDetail}`);
        }
        return { ...record, storage_schema: 'legacy_orders' };
      }
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
  ensurePersistentOrderStorage();
  if (hasSupabase()) {
    let response = await supabaseRequest(
      `/rest/v1/${SUPABASE_ORDERS_TABLE}?select=*&stripe_session_id=eq.${encodeURIComponent(sessionId)}&limit=1`
    );
    if (!response.ok) {
      const detail = await response.text();
      if (isMissingSupabaseTableError(detail, SUPABASE_ORDERS_TABLE)) {
        return null;
      }
      if (isSchemaMismatchError(detail, 'stripe_session_id')) {
        return null;
      }
      throw new Error(`Supabase order lookup failed (${response.status}): ${detail}`);
    }
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  const rows = await readJsonArray(ORDERS_FILE);
  return rows.find((row) => row.stripe_session_id === sessionId) || null;
}

async function markOrderPaidBySessionId(sessionId, paymentIntentId) {
  ensurePersistentOrderStorage();
  const now = new Date().toISOString();
  if (hasSupabase()) {
    let response = await supabaseRequest(
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
      if (isMissingSupabaseTableError(detail, SUPABASE_ORDERS_TABLE)) {
        return { order: null, changed: false, storageSkipped: true };
      }
      if (isSchemaMismatchError(detail, 'status') || isSchemaMismatchError(detail, 'payment_intent_id')) {
        response = await supabaseRequest(
          `/rest/v1/${SUPABASE_ORDERS_TABLE}?stripe_session_id=eq.${encodeURIComponent(sessionId)}&payment_status=eq.pending_payment`,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              payment_status: 'paid',
              stripe_payment_intent_id: paymentIntentId || '',
              updated_at: now
            })
          }
        );
        if (!response.ok) {
          const legacyDetail = await response.text();
          throw new Error(`Supabase legacy order update failed (${response.status}): ${legacyDetail}`);
        }
      } else {
        throw new Error(`Supabase order update failed (${response.status}): ${detail}`);
      }
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
  ensurePersistentOrderStorage();
  const cartItems = parseCartItems(session?.metadata?.cart_json);
  const existing = await getOrderBySessionId(session.id);
  if (existing) {
    if (existing.status === 'paid') return { order: existing, changed: false, cartItems };
    const marked = await markOrderPaidBySessionId(session.id, session.payment_intent || '');
    return { ...marked, cartItems };
  }

  const built = buildOrderRecordFromSession(session, lineItems);
  const record = built.record;
  if (!record.order_number) {
    record.order_number = await generateOrderNumber();
  }

  if (hasSupabase()) {
    let response = await supabaseRequest(`/rest/v1/${SUPABASE_ORDERS_TABLE}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(record)
    });
    if (!response.ok) {
      const detail = await response.text();
      if (isMissingSupabaseTableError(detail, SUPABASE_ORDERS_TABLE)) {
        return { order: record, changed: false, storageSkipped: true, cartItems: built.cartItems };
      }
      if (isSchemaMismatchError(detail, 'order_number') || isSchemaMismatchError(detail, 'payment_intent_id')) {
        response = await supabaseRequest(`/rest/v1/${SUPABASE_ORDERS_TABLE}`, {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(buildLegacyOrderRecord(record))
        });
        if (!response.ok) {
          const legacyDetail = await response.text();
          throw new Error(`Supabase legacy paid order insert failed (${response.status}): ${legacyDetail}`);
        }
        const legacyRows = await response.json();
        return { order: Array.isArray(legacyRows) && legacyRows.length ? legacyRows[0] : buildLegacyOrderRecord(record), changed: true, cartItems: built.cartItems };
      }
      throw new Error(`Supabase paid order insert failed (${response.status}): ${detail}`);
    }
    const rows = await response.json();
    return { order: Array.isArray(rows) && rows.length ? rows[0] : record, changed: true, cartItems: built.cartItems };
  }

  const rows = await readJsonArray(ORDERS_FILE);
  rows.push(record);
  await writeJsonArray(ORDERS_FILE, rows);
  return { order: record, changed: true, cartItems: built.cartItems };
}

async function decrementInventory(product, quantity) {
  ensurePersistentOrderStorage();
  const qty = Number(quantity || 0);
  if (!product || !Number.isFinite(qty) || qty <= 0) return;

  if (hasSupabase()) {
    let getRes = await supabaseRequest(
      `/rest/v1/${SUPABASE_INVENTORY_TABLE}?select=product,stock_on_hand&product=eq.${encodeURIComponent(product)}&limit=1`,
      { method: 'GET' }
    );
    if (!getRes.ok) {
      const detail = await getRes.text();
      if (isMissingSupabaseTableError(detail, SUPABASE_INVENTORY_TABLE)) return;
      if (!isSchemaMismatchError(detail, 'product') && !isSchemaMismatchError(detail, 'stock_on_hand')) return;
      getRes = await supabaseRequest(
        `/rest/v1/${SUPABASE_INVENTORY_TABLE}?select=id,mango_type,remaining_stock,sold_quantity&mango_type=eq.${encodeURIComponent(product)}&limit=1`,
        { method: 'GET' }
      );
      if (!getRes.ok) return;
    }
    const rows = await getRes.json();
    const existing = rows[0];
    if (!existing) return;
    if (Object.prototype.hasOwnProperty.call(existing, 'stock_on_hand')) {
      const next = Math.max(0, Number(existing.stock_on_hand || 0) - qty);
      await supabaseRequest(
        `/rest/v1/${SUPABASE_INVENTORY_TABLE}?product=eq.${encodeURIComponent(product)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ stock_on_hand: next, updated_at: new Date().toISOString() })
        }
      );
    } else {
      const remaining = Math.max(0, Number(existing.remaining_stock || 0) - qty);
      const sold = Math.max(0, Number(existing.sold_quantity || 0) + qty);
      await supabaseRequest(
        `/rest/v1/${SUPABASE_INVENTORY_TABLE}?mango_type=eq.${encodeURIComponent(product)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            remaining_stock: remaining,
            sold_quantity: sold,
            stock_on_hand: remaining,
            updated_at: new Date().toISOString()
          })
        }
      );
    }
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
  parseCartItems,
  upsertPaidOrderFromSession
};
