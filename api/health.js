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

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseActive = Boolean(supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY);
  json(res, 200, {
    ok: true,
    service: 'ameerglobal-api',
    runtime: 'vercel-function',
    supabaseActive,
    storageMode: supabaseActive ? 'supabase' : 'disabled'
  });
};
