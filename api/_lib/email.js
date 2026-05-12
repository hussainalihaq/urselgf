const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ORDER_EMAIL_FROM = process.env.ORDER_EMAIL_FROM || '';
const ORDER_EMAIL_ADMIN_TO = process.env.ORDER_EMAIL_ADMIN_TO || '';

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
  const customerSubject = `Order Confirmed: ${order.order_number}`;
  const adminSubject = `New Paid Order: ${order.order_number}`;

  const sharedBody = `
    <p><strong>Order:</strong> ${order.order_number}</p>
    <p><strong>Product:</strong> ${order.product}</p>
    <p><strong>Quantity:</strong> ${order.quantity}</p>
    <p><strong>Total:</strong> ${order.currency} ${Number(order.amount_total || 0).toFixed(2)}</p>
    <p><strong>Fulfillment:</strong> ${order.fulfillment}</p>
    <p><strong>Name:</strong> ${order.customer_name}</p>
    <p><strong>Email:</strong> ${order.customer_email}</p>
    <p><strong>Phone:</strong> ${order.phone || 'N/A'}</p>
    <p><strong>Address:</strong> ${order.address_line_1 || 'N/A'} ${order.address_line_2 || ''}</p>
    <p><strong>City:</strong> ${order.city || 'N/A'}</p>
    <p><strong>Postal Code:</strong> ${order.postal_code || 'N/A'}</p>
  `;

  const customerResult = await sendEmail({
    to: order.customer_email,
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
