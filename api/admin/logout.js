const { json } = require('../_lib/common');
const { clearSessionCookie } = require('../_lib/admin-auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  json(res, 200, { ok: true, authenticated: false });
};
