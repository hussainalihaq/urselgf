const { json } = require('../_lib/common');
const { getSession } = require('../_lib/admin-auth');

module.exports = async function handler(req, res) {
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
};
