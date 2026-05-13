const { insertContact, json, readBody } = require('./_lib/common');
const { buildCheckoutContactRecord, buildCheckoutResponse } = require('./_lib/checkout');
const { createPendingOrder, generateOrderNumber } = require('./_lib/orders');
const Stripe = require('stripe');

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

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
    const checkout = buildCheckoutContactRecord(body);
    const orderNumber = await generateOrderNumber();
    let contactStored = true;
    try {
      await insertContact(checkout.contactRecord);
    } catch (insertError) {
      contactStored = false;
      console.error('[checkout] Contact insert warning:', insertError?.message || insertError);
    }

    let paymentResponse = buildCheckoutResponse(
      checkout.paymentMethod,
      checkout.contactRecord.product,
      checkout.contactRecord.email
    );

    if (checkout.paymentMethod === 'stripe' && stripe) {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host || 'ameerglobal.ca';
      const baseUrl = `${protocol}://${host}`;

      const lineItems = [
        {
          price_data: {
            currency: checkout.billing.currency.toLowerCase(),
            product_data: {
              name: checkout.contactRecord.product,
            },
            unit_amount: Math.round(checkout.billing.unitPriceCad * 100),
          },
          quantity: checkout.billing.quantity,
        }
      ];

      if (checkout.billing.shippingCad > 0) {
        lineItems.push({
          price_data: {
            currency: checkout.billing.currency.toLowerCase(),
            product_data: {
              name: 'Delivery Fee',
            },
            unit_amount: Math.round(checkout.billing.shippingCad * 100),
          },
          quantity: 1,
        });
      }

      if (checkout.billing.hstCad > 0) {
        lineItems.push({
          price_data: {
            currency: checkout.billing.currency.toLowerCase(),
            product_data: {
              name: 'HST (13%)',
            },
            unit_amount: Math.round(checkout.billing.hstCad * 100),
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: checkout.contactRecord.email,
        line_items: lineItems,
        mode: 'payment',
        success_url: `${baseUrl}/checkout/success.html`,
        cancel_url: `${baseUrl}/checkout/`,
        metadata: {
          orderNumber,
          submissionId: checkout.contactRecord.id,
          product: checkout.contactRecord.product,
          quantity: String(checkout.billing.quantity),
          customerEmail: checkout.contactRecord.email,
          customerName: body.name || '',
          phone: body.phone || '',
          fulfillment: body.fulfillment || '',
          orderType: body.fulfillment || '',
          city: checkout.availability.city ? checkout.availability.city.label : '',
          postalCode: checkout.availability.postalCode || '',
          addressLine1: body.addressLine1 || '',
          addressLine2: body.addressLine2 || ''
        },
        payment_intent_data: {
          metadata: {
            orderNumber,
            submissionId: checkout.contactRecord.id,
            product: checkout.contactRecord.product,
            quantity: String(checkout.billing.quantity),
            customerEmail: checkout.contactRecord.email,
            customerName: body.name || '',
            phone: body.phone || '',
            fulfillment: body.fulfillment || '',
            orderType: body.fulfillment || '',
            city: checkout.availability.city ? checkout.availability.city.label : '',
            postalCode: checkout.availability.postalCode || '',
            addressLine1: body.addressLine1 || '',
            addressLine2: body.addressLine2 || ''
          }
        }
      });

      paymentResponse = {
        method: checkout.paymentMethod,
        label: paymentResponse.label,
        status: 'redirect',
        url: session.url,
        message: `Redirecting to secure payment for ${checkout.contactRecord.product}.`
      };

      try {
        await createPendingOrder({
          orderNumber,
          submissionId: checkout.contactRecord.id,
          stripeSessionId: session.id,
          customerName: body.name || '',
          customerEmail: checkout.contactRecord.email,
          phone: body.phone || '',
          product: checkout.contactRecord.product,
          quantity: checkout.billing.quantity,
          fulfillment: body.fulfillment || 'pickup',
          city: checkout.availability.city ? checkout.availability.city.label : '',
          postalCode: checkout.availability.postalCode || '',
          addressLine1: body.addressLine1 || '',
          addressLine2: body.addressLine2 || '',
          amountTotal: checkout.billing.totalCad,
          currency: checkout.billing.currency
        });
      } catch (orderError) {
        console.error('[checkout] Pending order create warning:', orderError?.message || orderError);
      }
    }

    json(res, 201, {
      ok: true,
      contactStored,
      availability: {
        eligible: true,
        city: checkout.availability.city ? checkout.availability.city.label : '',
        region: checkout.availability.region || '',
        postalCode: checkout.availability.postalCode || ''
      },
      billing: checkout.billing,
      orderNumber,
      payment: paymentResponse,
      submissionId: checkout.contactRecord.id
    });
  } catch (error) {
    const errMsg = error.message || 'Unable to continue checkout.';
    const errType = error.type || error.constructor?.name || 'Unknown';
    console.error('[checkout] Error:', errType, errMsg);
    
    // If Stripe key is missing, provide a clear message
    if (!stripe) {
      json(res, 500, { error: 'Payment system is not configured. Contact the site administrator.' });
      return;
    }
    
    json(res, 400, { error: errMsg });
  }
};
