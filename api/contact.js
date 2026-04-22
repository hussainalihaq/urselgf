const {
  createContactRecord,
  insertContact,
  json,
  readBody
} = require('./_lib/common');

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
    const record = createContactRecord(body);
    await insertContact(record);

    json(res, 201, { ok: true, message: 'Inquiry sent successfully.' });
  } catch (error) {
    json(res, 400, { error: error.message || 'Invalid request' });
  }
};
