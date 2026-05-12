const Stripe = require('stripe');
const { json } = require('./_lib/common');
const { decrementInventory, markOrderPaidBySessionId } = require('./_lib/orders');
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
    json(res, 500, { error: 'Stripe webhook is not configured.' });
    return;
  }

  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      json(res, 400, { error: 'Missing stripe-signature header.' });
      return;
    }

    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const order = await markOrderPaidBySessionId(session.id, session.payment_intent || '');
      if (order) {
        await decrementInventory(order.product, order.quantity);
        try {
          await sendPaidOrderEmails(order);
        } catch (mailError) {
          console.error('[stripe-webhook] Email warning:', mailError?.message || mailError);
        }
      }
    }

    json(res, 200, { received: true });
  } catch (error) {
    console.error('[stripe-webhook] Error:', error?.message || error);
    json(res, 400, { error: `Webhook error: ${error.message || 'invalid payload'}` });
  }
};
