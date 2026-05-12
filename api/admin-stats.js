const { json } = require('./_lib/common');
const { getStats } = require('./_lib/orders');

const ADMIN_STATS_KEY = process.env.ADMIN_STATS_KEY || '';

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const key = req.headers['x-admin-key'] || '';
  if (!ADMIN_STATS_KEY || key !== ADMIN_STATS_KEY) {
    json(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    const stats = await getStats();
    json(res, 200, { ok: true, ...stats });
  } catch (error) {
    json(res, 500, { error: error.message || 'Unable to load stats.' });
  }
};
