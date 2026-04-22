const {
  SUPABASE_NEWSLETTER_TABLE,
  createNewsletterRecord,
  json,
  newsletterExists,
  readBody,
  supabaseInsert
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
    const record = createNewsletterRecord(body);

    const exists = await newsletterExists(record.email);
    if (exists) {
      json(res, 200, { ok: true, message: 'Already subscribed.' });
      return;
    }

    await supabaseInsert(SUPABASE_NEWSLETTER_TABLE, {
      id: record.id,
      email: record.email,
      created_at: record.createdAt
    });

    json(res, 201, { ok: true, message: 'Subscribed successfully.' });
  } catch (error) {
    json(res, 400, { error: error.message || 'Invalid request' });
  }
};
