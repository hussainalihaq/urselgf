const { json, readBody } = require('./_lib/common');
const { buildAvailabilityResponse } = require('./_lib/checkout');

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
    const body = await readBody(req);
    const result = buildAvailabilityResponse(body);
    json(res, result.ok ? 200 : 400, result);
  } catch (error) {
    json(res, 400, { error: error.message || 'Unable to check availability.' });
  }
};
