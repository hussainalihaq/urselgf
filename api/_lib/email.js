const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ORDER_EMAIL_FROM = process.env.ORDER_EMAIL_FROM || '';
const ORDER_EMAIL_ADMIN_TO = process.env.ORDER_EMAIL_ADMIN_TO || '';

function normalizeOrderForEmail(order) {
  const fulfillment = String(order.fulfillment || order.order_type || '').toLowerCase();
  const address =
    order.delivery_address ||
    [order.address_line_1, order.address_line_2, order.city, order.postal_code].filter(Boolean).join(', ');

  return {
    orderNumber: order.order_number || order.id || 'Ameer Global order',
    product: order.product || order.mango_type || 'Ameer Global order',
    quantity: Number(order.quantity || 0),
    amountTotal: Number(order.amount_total || 0),
    currency: String(order.currency || 'CAD').toUpperCase(),
    fulfillment: fulfillment || 'pickup',
    customerName: order.customer_name || '',
    customerEmail: order.customer_email || '',
    phone: order.phone || order.customer_phone || '',
    address,
    city: order.city || '',
    postalCode: order.postal_code || ''
  };
}

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY || !ORDER_EMAIL_FROM || !to) return { sent: false, reason: 'missing-config' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: ORDER_EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend error (${response.status}): ${detail}`);
  }
  return { sent: true };
}

async function sendPaidOrderEmails(order) {
  const details = normalizeOrderForEmail(order);
  const customerSubject = `Order Confirmed: ${details.orderNumber}`;
  const adminSubject = `New Paid Order: ${details.orderNumber}`;

  const sharedBody = `
    <p><strong>Order:</strong> ${details.orderNumber}</p>
    <p><strong>Product:</strong> ${details.product}</p>
    <p><strong>Quantity:</strong> ${details.quantity}</p>
    <p><strong>Total:</strong> ${details.currency} ${details.amountTotal.toFixed(2)}</p>
    <p><strong>Fulfillment:</strong> ${details.fulfillment}</p>
    <p><strong>Name:</strong> ${details.customerName}</p>
    <p><strong>Email:</strong> ${details.customerEmail}</p>
    <p><strong>Phone:</strong> ${details.phone || 'N/A'}</p>
    <p><strong>Address:</strong> ${details.address || 'N/A'}</p>
    <p><strong>City:</strong> ${details.city || 'N/A'}</p>
    <p><strong>Postal Code:</strong> ${details.postalCode || 'N/A'}</p>
  `;

  const customerResult = await sendEmail({
    to: details.customerEmail,
    subject: customerSubject,
    html: `<h2>Thank you for your order</h2>${sharedBody}`
  });

  let adminResult = { sent: false, reason: 'missing-admin-to' };
  if (ORDER_EMAIL_ADMIN_TO) {
    adminResult = await sendEmail({
      to: ORDER_EMAIL_ADMIN_TO,
      subject: adminSubject,
      html: `<h2>New paid order received</h2>${sharedBody}`
    });
  }

  return { customerResult, adminResult };
}

module.exports = {
  sendPaidOrderEmails
};
