const { json } = require('./_lib/common');

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

  json(res, 200, { ok: true, service: 'ameerglobal-api', runtime: 'vercel-function' });
};
