const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_CONTACTS_TABLE = process.env.SUPABASE_CONTACTS_TABLE || 'contacts';
const SUPABASE_NEWSLETTER_TABLE = process.env.SUPABASE_NEWSLETTER_TABLE || 'newsletter_subscribers';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const LONG_CACHE_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.mp4',
  '.woff2'
]);

const products = [
  {
    id: 'mango-chaunsa',
    name: 'Chaunsa Mango Premium Box',
    origin: 'Multan, Pakistan',
    unit: '5kg box',
    category: 'fresh-produce'
  },
  {
    id: 'mango-anwar-ratol',
    name: 'Anwar Ratol Mango Reserve',
    origin: 'Punjab, Pakistan',
    unit: '4kg box',
    category: 'fresh-produce'
  },
  {
    id: 'mango-sindhri',
    name: 'Sindhri Mango Estate Selection',
    origin: 'Sindh, Pakistan',
    unit: '6kg box',
    category: 'fresh-produce'
  }
];

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sanitizePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const normalized = path
    .normalize(decoded)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  return normalized;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function readBody(req) {
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
        const params = new URLSearchParams(raw);
        resolve(Object.fromEntries(params.entries()));
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        if (contentType.includes('json')) {
          reject(new Error('Invalid JSON payload'));
          return;
        }

        const params = new URLSearchParams(raw);
        resolve(Object.fromEntries(params.entries()));
      }
    });
    req.on('error', reject);
  });
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function appendRecord(filename, record) {
  const file = path.join(DATA_DIR, filename);
  const currentRaw = await fs.readFile(file, 'utf8');
  const current = JSON.parse(currentRaw);
  current.push(record);
  await fs.writeFile(file, JSON.stringify(current, null, 2));
}

async function getRecords(filename) {
  const file = path.join(DATA_DIR, filename);
  const currentRaw = await fs.readFile(file, 'utf8');
  return JSON.parse(currentRaw);
}

async function supabaseRequest(endpoint, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  return response;
}

async function supabaseNewsletterExists(email) {
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

const pageRoutes = {
  '/': 'index.html',
  '/home': 'index.html',
  '/home/': 'index.html',
  '/products': 'products/index.html',
  '/products/': 'products/index.html',
  '/about': 'ameer_global_about_network_refined/index.html',
  '/about/': 'ameer_global_about_network_refined/index.html',
  '/contact': 'ameer_global_contact/index.html',
  '/contact/': 'ameer_global_contact/index.html'
};

async function serveFile(req, res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const stat = await fs.stat(filePath);
    const etag = `W/\"${stat.size}-${Math.floor(stat.mtimeMs).toString(16)}\"`;
    const ifNoneMatch = req.headers['if-none-match'];

    if (ifNoneMatch && ifNoneMatch === etag) {
      res.writeHead(304, {
        ETag: etag
      });
      res.end();
      return;
    }

    const cacheControl = LONG_CACHE_EXTENSIONS.has(ext)
      ? 'public, max-age=31536000, immutable'
      : ext === '.html'
        ? 'public, max-age=0, must-revalidate'
        : 'public, max-age=300, must-revalidate';

    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': new Date(stat.mtimeMs).toUTCString()
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      Allow: 'GET,POST,OPTIONS',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    json(res, 200, { ok: true, service: 'ameerglobal-api', uptime: process.uptime() });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/products') {
    json(res, 200, { items: products });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/newsletter') {
    try {
      const body = await readBody(req);
      const email = normalizeText(body.email).toLowerCase();

      if (!validateEmail(email)) {
        json(res, 400, { error: 'Valid email is required.' });
        return true;
      }
      const record = {
        id: randomUUID(),
        email,
        createdAt: new Date().toISOString()
      };

      if (USE_SUPABASE) {
        const exists = await supabaseNewsletterExists(email);
        if (exists) {
          json(res, 200, { ok: true, message: 'Already subscribed.' });
          return true;
        }

        await supabaseInsert(SUPABASE_NEWSLETTER_TABLE, record);
      } else {
        const existing = await getRecords('newsletter.json');
        if (existing.some((item) => item.email === email)) {
          json(res, 200, { ok: true, message: 'Already subscribed.' });
          return true;
        }

        await appendRecord('newsletter.json', record);
      }

      json(res, 201, { ok: true, message: 'Subscribed successfully.' });
      return true;
    } catch (err) {
      json(res, 400, { error: err.message || 'Invalid request' });
      return true;
    }
  }

  if (req.method === 'POST' && pathname === '/api/contact') {
    try {
      const body = await readBody(req);
      const name = normalizeText(body.name);
      const email = normalizeText(body.email).toLowerCase();
      const subject = normalizeText(body.subject);
      const message = normalizeText(body.message);
      const source = normalizeText(body.source) || 'website';

      if (!name || name.length < 2) {
        json(res, 400, { error: 'Name must be at least 2 characters.' });
        return true;
      }

      if (!validateEmail(email)) {
        json(res, 400, { error: 'Valid email is required.' });
        return true;
      }

      if (!subject || subject.length < 3) {
        json(res, 400, { error: 'Subject must be at least 3 characters.' });
        return true;
      }

      if (!message || message.length < 10) {
        json(res, 400, { error: 'Message must be at least 10 characters.' });
        return true;
      }

      const record = {
        id: randomUUID(),
        name,
        email,
        subject,
        message,
        source,
        createdAt: new Date().toISOString()
      };

      if (USE_SUPABASE) {
        await supabaseInsert(SUPABASE_CONTACTS_TABLE, record);
      } else {
        await appendRecord('contacts.json', record);
      }

      json(res, 201, { ok: true, message: 'Inquiry sent successfully.' });
      return true;
    } catch (err) {
      json(res, 400, { error: err.message || 'Invalid request' });
      return true;
    }
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const requestUrl = new URL(req.url || '/', `http://${host}`);
    const pathname = requestUrl.pathname;

    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname);
      if (!handled) {
        json(res, 404, { error: 'API route not found' });
      }
      return;
    }

    if (pageRoutes[pathname]) {
      const absolute = path.join(ROOT, pageRoutes[pathname]);
      await serveFile(req, res, absolute);
      return;
    }

    const staticPath = sanitizePath(pathname);
    const absolutePath = path.join(ROOT, staticPath);

    if (absolutePath.startsWith(ROOT) && await fileExists(absolutePath)) {
      if (await isDirectory(absolutePath)) {
        await serveFile(req, res, path.join(absolutePath, 'index.html'));
        return;
      }

      await serveFile(req, res, absolutePath);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    json(res, 500, { error: 'Internal server error', detail: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Ameer Global server running on http://localhost:${PORT}`);
});
