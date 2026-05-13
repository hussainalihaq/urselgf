const { json } = require('../_lib/common');
const { requireAdmin } = require('../_lib/admin-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (!requireAdmin(req, res)) return;
  json(res, 200, {
    pages: ['/admin/login/', '/admin/', '/admin/orders/', '/admin/inventory/'],
    apis: [
      '/api/admin/session',
      '/api/admin/login',
      '/api/admin/logout',
      '/api/admin/dashboard',
      '/api/admin/orders',
      '/api/admin/orders-update',
      '/api/admin/inventory',
      '/api/admin/inventory-update',
      '/api/admin/diagnostics'
    ]
  });
};
