const { createContactRecord, normalizeText } = require('./common');

const STRIPE_PAYMENT_LINK_URL = normalizeText(process.env.STRIPE_PAYMENT_LINK_URL);

const GTA_CITIES = [
  { key: 'toronto', label: 'Toronto', region: 'Toronto', aliases: ['toronto', 'north york', 'scarborough', 'etobicoke', 'east york', 'york'] },
  { key: 'mississauga', label: 'Mississauga', region: 'Peel', aliases: ['mississauga'] },
  { key: 'brampton', label: 'Brampton', region: 'Peel', aliases: ['brampton'] },
  { key: 'caledon', label: 'Caledon', region: 'Peel', aliases: ['caledon'] },
  { key: 'vaughan', label: 'Vaughan', region: 'York', aliases: ['vaughan', 'thornhill'] },
  { key: 'markham', label: 'Markham', region: 'York', aliases: ['markham', 'unionville'] },
  { key: 'richmond-hill', label: 'Richmond Hill', region: 'York', aliases: ['richmond hill', 'richmond-hill'] },
  { key: 'oakville', label: 'Oakville', region: 'Halton', aliases: ['oakville'] },
  { key: 'milton', label: 'Milton', region: 'Halton', aliases: ['milton'] },
  { key: 'burlington', label: 'Burlington', region: 'Halton', aliases: ['burlington'] },
  { key: 'halton-hills', label: 'Halton Hills', region: 'Halton', aliases: ['halton hills', 'halton-hills', 'georgetown', 'acton'] },
  { key: 'pickering', label: 'Pickering', region: 'Durham', aliases: ['pickering'] },
  { key: 'ajax', label: 'Ajax', region: 'Durham', aliases: ['ajax'] },
  { key: 'whitby', label: 'Whitby', region: 'Durham', aliases: ['whitby'] },
  { key: 'oshawa', label: 'Oshawa', region: 'Durham', aliases: ['oshawa'] }
];

const PAYMENT_METHOD_LABELS = {
  stripe: 'Stripe Checkout',
  interac: 'Interac e-Transfer',
  invoice: 'Trade Invoice'
};

function normalizePostalCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, '');
}

function normalizePhone(value) {
  return normalizeText(value).replace(/[^\d+()\-\s]/g, '');
}

function normalizeQuantity(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 500 ? parsed : 0;
}

function findCity(value) {
  const city = normalizeText(value).toLowerCase();
  if (!city) return null;
  return GTA_CITIES.find((entry) => entry.aliases.includes(city)) || null;
}

function validatePostalCode(postalCode) {
  return /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postalCode);
}

function isGtaPostalCode(postalCode) {
  return /^[ML]\d[A-Z]\d[A-Z]\d$/.test(postalCode);
}

function resolvePaymentMethod(value) {
  const method = normalizeText(value).toLowerCase();
  return Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_LABELS, method) ? method : '';
}

function getAvailability(cityValue, postalCodeValue) {
  const city = findCity(cityValue);
  const postalCode = normalizePostalCode(postalCodeValue);
  const hasValidPostal = validatePostalCode(postalCode);
  const eligible = Boolean(city && hasValidPostal && isGtaPostalCode(postalCode));

  return {
    city,
    postalCode,
    eligible,
    hasValidPostal,
    region: city ? city.region : ''
  };
}

function buildCheckoutContactRecord(body) {
  const product = normalizeText(body.product) || 'Ameer Global order';
  const quantity = normalizeQuantity(body.quantity);
  const paymentMethod = resolvePaymentMethod(body.paymentMethod);
  const phone = normalizePhone(body.phone);
  const addressLine1 = normalizeText(body.addressLine1);
  const addressLine2 = normalizeText(body.addressLine2);
  const notes = normalizeText(body.notes);
  const availability = getAvailability(body.city, body.postalCode);

  if (!quantity) throw new Error('Quantity must be at least 1.');
  if (!phone || phone.length < 7) throw new Error('Phone number is required.');
  if (!addressLine1 || addressLine1.length < 5) throw new Error('Street address is required.');
  if (!paymentMethod) throw new Error('Select a payment method.');
  if (!availability.city) throw new Error('Choose a GTA delivery city.');
  if (!availability.hasValidPostal) throw new Error('Enter a valid Canadian postal code.');
  if (!availability.eligible) throw new Error('Orders are currently available only within the Greater Toronto Area.');

  const paymentLabel = PAYMENT_METHOD_LABELS[paymentMethod];
  const subject = `CHECKOUT REQUEST: ${product}`;
  const messageLines = [
    'New checkout request from the GTA order page.',
    '',
    `Product: ${product}`,
    `Quantity: ${quantity}`,
    `Delivery city: ${availability.city.label}`,
    `Region: ${availability.region}`,
    `Postal code: ${availability.postalCode}`,
    `Address line 1: ${addressLine1}`,
    `Address line 2: ${addressLine2 || 'N/A'}`,
    `Phone: ${phone}`,
    `Payment method: ${paymentLabel}`,
    `Stripe redirect configured: ${STRIPE_PAYMENT_LINK_URL ? 'Yes' : 'No'}`,
    `Additional notes: ${notes || 'N/A'}`
  ];

  const contactRecord = createContactRecord({
    name: body.name,
    email: body.email,
    subject,
    message: messageLines.join('\n'),
    source: 'checkout-page',
    product,
    intent: 'buy'
  });

  return {
    availability,
    contactRecord,
    paymentMethod,
    quantity
  };
}

function buildCheckoutResponse(paymentMethod, product, email) {
  const paymentLabel = PAYMENT_METHOD_LABELS[paymentMethod];

  if (paymentMethod === 'stripe' && STRIPE_PAYMENT_LINK_URL) {
    const url = new URL(STRIPE_PAYMENT_LINK_URL);
    if (email) url.searchParams.set('prefilled_email', email);
    return {
      method: paymentMethod,
      label: paymentLabel,
      status: 'redirect',
      url: url.toString(),
      message: `Redirecting to secure ${paymentLabel.toLowerCase()} for ${product}.`
    };
  }

  if (paymentMethod === 'stripe') {
    return {
      method: paymentMethod,
      label: paymentLabel,
      status: 'pending',
      url: '',
      message: 'Stripe handoff is ready in code but the live payment link is not configured yet.'
    };
  }

  return {
    method: paymentMethod,
    label: paymentLabel,
    status: 'manual',
    url: '',
    message: `${paymentLabel} selected. Our GTA order desk will confirm the next payment step.`
  };
}

module.exports = {
  GTA_CITIES,
  PAYMENT_METHOD_LABELS,
  buildCheckoutContactRecord,
  buildCheckoutResponse,
  getAvailability,
  normalizePostalCode,
  resolvePaymentMethod
};
