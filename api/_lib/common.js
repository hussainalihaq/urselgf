const { randomUUID } = require('node:crypto');

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_CONTACTS_TABLE = process.env.SUPABASE_CONTACTS_TABLE || 'contacts';
const SUPABASE_NEWSLETTER_TABLE = process.env.SUPABASE_NEWSLETTER_TABLE || 'newsletter_subscribers';

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIntent(value) {
  const intent = normalizeText(value).toLowerCase();
  const allowed = new Set(['buy', 'reserve', 'inquiry', 'service', 'other']);
  return allowed.has(intent) ? intent : 'inquiry';
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }
  return true;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }

      const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (contentType === 'application/x-www-form-urlencoded') {
        resolve(Object.fromEntries(new URLSearchParams(raw).entries()));
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        if (contentType.includes('json')) {
          reject(new Error('Invalid JSON payload'));
          return;
        }
        resolve(Object.fromEntries(new URLSearchParams(raw).entries()));
      }
    });

    req.on('error', reject);
  });
}

async function supabaseRequest(endpoint, options = {}) {
  if (!requireSupabase()) {
    return { ok: true, text: async () => '[]', json: async () => [] };
  }

  return fetch(`${SUPABASE_URL}${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

async function supabaseInsert(table, record) {
  const response = await supabaseRequest(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(record)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${detail}`);
  }
}

async function newsletterExists(email) {
  const query = `?select=id&email=eq.${encodeURIComponent(email)}&limit=1`;
  const response = await supabaseRequest(`/rest/v1/${SUPABASE_NEWSLETTER_TABLE}${query}`, {
    method: 'GET'
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase newsletter lookup failed (${response.status}): ${detail}`);
  }

  const rows = await response.json();
  return rows.length > 0;
}

async function insertContact(record) {
  if (!requireSupabase()) {
    console.log('[insertContact] Supabase not configured, skipping DB insert. Record ID:', record.id);
    return;
  }

  const payload = {
    id: record.id,
    name: record.name,
    email: record.email,
    subject: record.subject,
    message: record.message,
    source: record.source,
    product: record.product,
    intent: record.intent,
    created_at: record.createdAt
  };

  try {
    await supabaseInsert(SUPABASE_CONTACTS_TABLE, payload);
  } catch (error) {
    const message = String(error?.message || '');
    const missingColumns =
      /column .* does not exist|schema cache/i.test(message) &&
      /product|intent/i.test(message);

    if (!missingColumns) throw error;

    await supabaseInsert(SUPABASE_CONTACTS_TABLE, {
      id: record.id,
      name: record.name,
      email: record.email,
      subject: record.subject,
      message: record.message,
      source: record.source,
      created_at: record.createdAt
    });
  }
}

function createContactRecord(body) {
  const name = normalizeText(body.name);
  const email = normalizeText(body.email).toLowerCase();
  const subject = normalizeText(body.subject);
  const message = normalizeText(body.message);
  const source = normalizeText(body.source) || 'website';
  const product = normalizeText(body.product);
  const intent = normalizeIntent(body.intent);

  if (!name || name.length < 2) throw new Error('Name must be at least 2 characters.');
  if (!validateEmail(email)) throw new Error('Valid email is required.');
  if (!subject || subject.length < 3) throw new Error('Subject must be at least 3 characters.');
  if (!message || message.length < 10) throw new Error('Message must be at least 10 characters.');

  return {
    id: randomUUID(),
    name,
    email,
    subject,
    message,
    source,
    product,
    intent,
    createdAt: new Date().toISOString()
  };
}

function createNewsletterRecord(body) {
  const email = normalizeText(body.email).toLowerCase();
  if (!validateEmail(email)) throw new Error('Valid email is required.');

  return {
    id: randomUUID(),
    email,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  SUPABASE_NEWSLETTER_TABLE,
  createContactRecord,
  createNewsletterRecord,
  insertContact,
  json,
  normalizeText,
  newsletterExists,
  readBody,
  supabaseInsert
};
