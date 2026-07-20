const { json, normalizeText, readBody } = require('../_lib/common');
const { clearSessionCookie, getSession, login, requireAdmin } = require('../_lib/admin-auth');
const {
  diagnostics,
  listInventory,
  listOrders,
  listReservations,
  listInquiries,
  sendError,
  summarizePaidOrders,
  updateInventoryItem,
  updateOrderStatus
} = require('../_lib/admin-data');

function resolveRoute(req) {
  const param = req.query?.route;
  if (Array.isArray(param) && param.length) return param.join('/');
  if (typeof param === 'string' && param) return param;

  const url = new URL(req.url || '', 'http://localhost');
  return url.pathname
    .replace(/^\/api\/admin\/?/, '')
    .replace(/\/+$/, '');
}

function routeNotFound(res) {
  json(res, 404, { error: 'Admin endpoint not found' });
}

async function handleSession(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const session = getSession(req);
  if (!session.ok) {
    json(res, 200, { authenticated: false });
    return;
  }

  json(res, 200, { authenticated: true, email: session.email, expiresAt: session.exp });
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    await login(req, res);
  } catch (error) {
    json(res, 400, { error: error.message || 'Invalid login request.' });
  }
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  res.setHeader('Set-Cookie', clearSessionCookie());
  json(res, 200, { ok: true, authenticated: false });
}

async function handleDashboard(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    const [reservations, inquiries, inventory, orders] = await Promise.all([
      listReservations(),
      listInquiries(),
      listInventory(),
      listOrders()
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const countsByProduct = {};

    for (const item of reservations) {
      const key = item.product || 'Unknown';
      countsByProduct[key] = (countsByProduct[key] || 0) + 1;
    }

    json(res, 200, {
      totalReservations: reservations.length,
      todayReservations: reservations.filter((row) => String(row.created_at || '').slice(0, 10) === today).length,
      totalInquiries: inquiries.length,
      uniqueProducts: Object.keys(countsByProduct).length,
      productCounts: Object.entries(countsByProduct).map(([product, count]) => ({ product, count })),
      checkoutSummary: summarizePaidOrders(orders, inventory),
      recentReservations: reservations.slice(0, 25),
      recentInquiries: inquiries.slice(0, 25)
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleOrders(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    const orders = await listOrders();
    json(res, 200, { orders: orders.filter((order) => String(order.payment_status).toLowerCase() === 'paid') });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleOrdersUpdate(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    const body = await readBody(req);
    const id = normalizeText(body.id);
    const status = normalizeText(body.fulfillment_status).toLowerCase();
    const note = normalizeText(body.admin_note);

    if (!id) {
      json(res, 400, { error: 'Order id is required' });
      return;
    }
    if (!['pending', 'fulfilled', 'cancelled'].includes(status)) {
      json(res, 400, { error: 'Invalid fulfillment status' });
      return;
    }

    const row = await updateOrderStatus(id, status, note);
    if (!row) {
      json(res, 404, { error: 'Order not found' });
      return;
    }

    json(res, 200, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleInventory(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    json(res, 200, { inventory: await listInventory() });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleInventoryUpdate(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    const body = await readBody(req);
    const id = normalizeText(body.id);
    const action = normalizeText(body.action).toLowerCase();

    if (!id) {
      json(res, 400, { error: 'Inventory id is required' });
      return;
    }
    if (!['set', 'increase', 'decrease'].includes(action)) {
      json(res, 400, { error: 'Invalid action' });
      return;
    }

    await updateInventoryItem(id, action, body.amount, body.remaining_stock, body.low_stock_threshold);
    json(res, 200, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleDiagnostics(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    json(res, 200, await diagnostics());
  } catch (error) {
    sendError(res, error);
  }
}

function handleLinks(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  json(res, 200, {
    pages: ['/admin/login/', '/admin/'],
    apis: [
      '/api/admin/session',
      '/api/admin/login',
      '/api/admin/logout',
      '/api/admin/dashboard',
      '/api/admin/diagnostics'
    ]
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const route = resolveRoute(req);

  switch (route) {
    case 'session':
      await handleSession(req, res);
      return;
    case 'login':
      await handleLogin(req, res);
      return;
    case 'logout':
      await handleLogout(req, res);
      return;
    case 'dashboard':
      await handleDashboard(req, res);
      return;
    case 'orders':
      await handleOrders(req, res);
      return;
    case 'orders-update':
      await handleOrdersUpdate(req, res);
      return;
    case 'inventory':
      await handleInventory(req, res);
      return;
    case 'inventory-update':
      await handleInventoryUpdate(req, res);
      return;
    case 'diagnostics':
      await handleDiagnostics(req, res);
      return;
    case 'links':
      handleLinks(req, res);
      return;
    default:
      routeNotFound(res);
  }
};
