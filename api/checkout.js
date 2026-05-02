const { insertContact, json, readBody } = require('./_lib/common');
const { buildCheckoutContactRecord, buildCheckoutResponse } = require('./_lib/checkout');

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
    await insertContact(checkout.contactRecord);

    json(res, 201, {
      ok: true,
      availability: {
        eligible: true,
        city: checkout.availability.city.label,
        region: checkout.availability.region,
        postalCode: checkout.availability.postalCode
      },
      billing: checkout.billing,
      payment: buildCheckoutResponse(
        checkout.paymentMethod,
        checkout.contactRecord.product,
        checkout.contactRecord.email
      ),
      submissionId: checkout.contactRecord.id
    });
  } catch (error) {
    json(res, 400, { error: error.message || 'Unable to continue checkout.' });
  }
};
