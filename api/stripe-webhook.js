const Stripe = require('stripe');
const { json } = require('./_lib/common');
const { decrementInventory, upsertPaidOrderFromSession } = require('./_lib/orders');
const { sendPaidOrderEmails } = require('./_lib/email');

const stripeKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = stripeKey ? new Stripe(stripeKey) : null;

function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  if (req.body && typeof req.body === 'object') return Promise.resolve(Buffer.from(JSON.stringify(req.body)));

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

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

  if (!stripe || !webhookSecret) {
    console.error('[stripe-webhook] Stripe webhook is not configured.');
    json(res, 200, { received: true, warning: 'Webhook not configured' });
    return;
  }

  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      console.error('[stripe-webhook] Missing stripe-signature header.');
      json(res, 200, { received: true, warning: 'Missing signature' });
      return;
    }

    const rawBody = await readRawBody(req);
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (sigError) {
      console.error('[stripe-webhook] Signature verification failed:', sigError.message);
      json(res, 200, { received: true, warning: 'Invalid signature' });
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
      const result = await upsertPaidOrderFromSession(session, lineItems.data || []);
      if (result.order && result.changed) {
        if (Array.isArray(result.cartItems) && result.cartItems.length) {
          for (const item of result.cartItems) {
            await decrementInventory(item.product, item.quantity);
          }
        } else {
          await decrementInventory(result.order.product, result.order.quantity);
        }
        try {
          await sendPaidOrderEmails(result.order);
        } catch (mailError) {
          console.error('[stripe-webhook] Email warning:', mailError?.message || mailError);
        }
      } else if (result.storageSkipped) {
        console.warn('[stripe-webhook] Orders table missing in Supabase. Payment completed in Stripe, but local order sync was skipped.');
      }
    }

    json(res, 200, { received: true });
  } catch (error) {
    console.error('[stripe-webhook] Error:', error?.message || error);
    // ALWAYS return 200 to Stripe to prevent webhook from being disabled
    json(res, 200, { received: true, warning: 'Internal processing error' });
  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
