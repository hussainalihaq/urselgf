module.exports = async function handler(req, res) {
  const hasStripeKey = Boolean(process.env.STRIPE_SECRET_KEY);
  const keyPrefix = hasStripeKey ? process.env.STRIPE_SECRET_KEY.substring(0, 7) + '...' : 'NOT SET';
  
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: 'ok',
    stripe_key_set: hasStripeKey,
    stripe_key_prefix: keyPrefix,
    node_version: process.version
  }));
};
