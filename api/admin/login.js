const { json } = require('../_lib/common');
const { login } = require('../_lib/admin-auth');

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
  try {
    await login(req, res);
  } catch (error) {
    json(res, 400, { error: error.message || 'Invalid login request.' });
  }
};
