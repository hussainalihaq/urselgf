const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 3000);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

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
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
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

const pageRoutes = {
  '/': 'index.html',
  '/home': 'index.html',
  '/products': 'products/index.html',
  '/about': 'ameer_global_about_network_refined/index.html',
  '/contact': 'ameer_global_contact/index.html'
};

async function serveFile(res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

async function handleApi(req, res, pathname) {
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
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

      if (!validateEmail(email)) {
        json(res, 400, { error: 'Valid email is required.' });
        return true;
      }

      const existing = await getRecords('newsletter.json');
      if (existing.some((item) => item.email === email)) {
        json(res, 200, { ok: true, message: 'Already subscribed.' });
        return true;
      }

      const record = {
        id: randomUUID(),
        email,
        createdAt: new Date().toISOString()
      };

      await appendRecord('newsletter.json', record);
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
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
      const message = typeof body.message === 'string' ? body.message.trim() : '';

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
        createdAt: new Date().toISOString()
      };

      await appendRecord('contacts.json', record);
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
      await serveFile(res, absolute);
      return;
    }

    const staticPath = sanitizePath(pathname);
    const absolutePath = path.join(ROOT, staticPath);

    if (absolutePath.startsWith(ROOT) && await fileExists(absolutePath)) {
      if (await isDirectory(absolutePath)) {
        await serveFile(res, path.join(absolutePath, 'index.html'));
        return;
      }

      await serveFile(res, absolutePath);
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
