const { json } = require('../_lib/common');
const { requireAdmin } = require('../_lib/admin-auth');
const { listInventory, sendError } = require('../_lib/admin-data');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;

  try {
    const inventory = await listInventory();
    json(res, 200, { inventory });
  } catch (error) {
    sendError(res, error);
  }
};
