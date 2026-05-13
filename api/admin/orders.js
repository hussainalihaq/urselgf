const { json } = require('../_lib/common');
const { requireAdmin } = require('../_lib/admin-auth');
const { listOrders, sendError } = require('../_lib/admin-data');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    const orders = await listOrders();
    json(res, 200, { orders: orders.filter((o) => String(o.payment_status).toLowerCase() === 'paid') });
  } catch (error) {
    sendError(res, error);
  }
};
