const { json, normalizeText, readBody } = require('../_lib/common');
const { requireAdmin } = require('../_lib/admin-auth');
const { sendError, updateInventoryItem } = require('../_lib/admin-data');

module.exports = async function handler(req, res) {
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
};
