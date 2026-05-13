const { json, readBody, normalizeText } = require('../_lib/common');
const { requireAdmin } = require('../_lib/admin-auth');
const { sendError, updateOrderStatus } = require('../_lib/admin-data');

module.exports = async function handler(req, res) {
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
};
