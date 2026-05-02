const { createContactRecord, insertContact, json, readBody } = require('./_lib/common');

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
    const record = createContactRecord({
      name: body.name,
      email: body.email,
      subject: body.subject,
      message: body.message,
      source: body.source || 'reserve-page',
      product: body.product,
      intent: body.intent || 'reserve'
    });

    await insertContact(record);

    json(res, 201, {
      ok: true,
      message: 'Reserve request submitted successfully.',
      submissionId: record.id
    });
  } catch (error) {
    json(res, 400, { error: error.message || 'Unable to submit reserve request.' });
  }
};
