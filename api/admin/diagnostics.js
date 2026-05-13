const { json } = require('../_lib/common');
const { requireAdmin } = require('../_lib/admin-auth');
const { diagnostics, sendError } = require('../_lib/admin-data');

module.exports = async function handler(req, res) {
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
};
