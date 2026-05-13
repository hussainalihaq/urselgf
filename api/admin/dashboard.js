const { json } = require('../_lib/common');
const { requireAdmin } = require('../_lib/admin-auth');
const { listInventory, listOrders, sendError } = require('../_lib/admin-data');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    const orders = await listOrders();
    const inventory = await listInventory();
    const paidOrders = orders.filter((o) => String(o.payment_status).toLowerCase() === 'paid');
    const pendingOrders = orders.filter((o) => String(o.fulfillment_status).toLowerCase() === 'pending').length;
    const fulfilledOrders = orders.filter((o) => String(o.fulfillment_status).toLowerCase() === 'fulfilled').length;
    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.amount_total || 0), 0);

    json(res, 200, {
      totalOrders: paidOrders.length,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      pendingOrders,
      fulfilledOrders,
      totalInventoryRemaining: inventory.reduce((sum, i) => sum + Number(i.remaining_stock || 0), 0),
      inventory,
      recentOrders: paidOrders.slice(0, 10)
    });
  } catch (error) {
    sendError(res, error);
  }
};
