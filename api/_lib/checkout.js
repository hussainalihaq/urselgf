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
  stripe: 'Stripe Checkout'
};

const PRODUCT_PRICES_CAD = {  'Chaunsa Mangoes': 29.99,
  'Chaunsa Mango Premium Box': 32,
  'Anwar Ratol Mango Reserve': 32,
  'Sindhri Mango Estate Selection': 32,
  'Himalayan Salt': 29,
  'EcoWare Naturals': 24,
  'De-Icing Salt': 32
};

const FULFILLMENT_PROFILES = [
  {
    maxQuantity: 3,
    code: 'priority',
    label: 'Priority Local Dispatch',
    leadTime: 'Same-day confirmation',
    detail: 'Best for smaller household or gift orders inside our GTA route.'
  },
  {
    maxQuantity: 10,
    code: 'scheduled',
    label: 'Scheduled Delivery Route',
    leadTime: '1 business day review',
    detail: 'Handled through the next GTA delivery cycle with route planning.'
  },
  {
    maxQuantity: 25,
    code: 'trade',
    label: 'Trade Desk Coordination',
    leadTime: '1-2 business days review',
    detail: 'Larger volumes are still eligible, but we stage delivery timing manually.'
  },
  {
    maxQuantity: 500,
    code: 'bulk',
    label: 'Bulk Allocation Review',
    leadTime: 'Custom follow-up required',
    detail: 'High-volume requests are screened for inventory staging and delivery windows.'
  }
];

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

function resolveUnitPrice(product) {
  return PRODUCT_PRICES_CAD[product] || 30;
}

function buildBilling(cart, fulfillment) {
  let subtotalCad = 0;
  let totalQuantity = 0;
  
  if (!Array.isArray(cart) || cart.length === 0) {
    cart = [{ product: 'Ameer Global order', quantity: 1 }];
  }

  const items = cart.map(item => {
    const q = normalizeQuantity(item.quantity) || 1;
    const price = resolveUnitPrice(item.product);
    subtotalCad += q * price;
    totalQuantity += q;
    return {
      product: item.product,
      quantity: q,
      unitPriceCad: price,
      lineTotalCad: q * price
    };
  });

  const shippingCad = fulfillment === 'delivery' && totalQuantity > 0 && totalQuantity < 5 ? 6 : 0;
  const preTaxCad = subtotalCad + shippingCad;
  const hstRate = 0;
  const hstCad = Number((preTaxCad * hstRate).toFixed(2));
  const totalCad = Number((preTaxCad + hstCad).toFixed(2));

  return {
    currency: 'CAD',
    items,
    quantity: totalQuantity,
    subtotalCad,
    shippingCad,
    hstRate,
    hstCad,
    totalCad
  };
}

function getFulfillmentProfile(quantityValue) {
  const quantity = normalizeQuantity(quantityValue) || 1;
  return FULFILLMENT_PROFILES.find((profile) => quantity <= profile.maxQuantity) || FULFILLMENT_PROFILES[FULFILLMENT_PROFILES.length - 1];
}

function getAvailability(cityValue, postalCodeValue, fulfillment) {
  if (fulfillment === 'pickup') {
    return {
      city: { label: 'North York', key: 'north-york', region: 'Toronto' },
      postalCode: 'N/A',
      eligible: true,
      hasValidPostal: true,
      region: 'Toronto'
    };
  }

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

function buildAvailabilityResponse(body) {
  const fulfillment = normalizeText(body.fulfillment) || 'pickup';
  const availability = getAvailability(body.city, body.postalCode, fulfillment);
  
  let cart = [];
  if (Array.isArray(body.cart) && body.cart.length > 0) {
    cart = body.cart;
  } else {
    cart = [{ product: normalizeText(body.product) || 'Ameer Global order', quantity: body.quantity }];
  }
  
  const billing = buildBilling(cart, fulfillment);
  const profile = getFulfillmentProfile(billing.quantity);

  if (fulfillment === 'delivery') {
    if (!availability.city) {
      return {
        ok: false,
        eligible: false,
        reason: 'Choose a GTA delivery city.',
        postalCode: availability.postalCode
      };
    }

    if (!availability.hasValidPostal) {
      return {
        ok: false,
        eligible: false,
        reason: 'Enter a valid Canadian postal code.',
        city: availability.city.label,
        region: availability.region,
        postalCode: availability.postalCode
      };
    }

    if (!availability.eligible) {
      return {
        ok: false,
        eligible: false,
        reason: 'This postal code falls outside our active Greater Toronto Area order window.',
        city: availability.city.label,
        region: availability.region,
        postalCode: availability.postalCode
      };
    }
  }

  return {
    ok: true,
    eligible: true,
    city: availability.city ? availability.city.label : 'North York',
    cityKey: availability.city ? availability.city.key : 'north-york',
    region: availability.region,
    postalCode: availability.postalCode,
    quantity: billing.quantity,
    cart: billing.items,
    product: billing.items.map(i => i.product).join(', '),
    profile,
    billing
  };
}

function buildCheckoutContactRecord(body) {
  let cart = [];
  if (Array.isArray(body.cart) && body.cart.length > 0) {
    cart = body.cart;
  } else {
    cart = [{ product: normalizeText(body.product) || 'Ameer Global order', quantity: body.quantity }];
  }

  const paymentMethod = resolvePaymentMethod(body.paymentMethod);
  const fulfillment = normalizeText(body.fulfillment) || 'pickup';
  const phone = normalizePhone(body.phone);
  const addressLine1 = normalizeText(body.addressLine1);
  const addressLine2 = normalizeText(body.addressLine2);
  const notes = normalizeText(body.notes);
  const availability = getAvailability(body.city, body.postalCode, fulfillment);
  const billing = buildBilling(cart, fulfillment);

  if (!billing.quantity) throw new Error('Quantity must be at least 1.');
  if (!phone || phone.length < 7) throw new Error('Phone number is required.');
  if (!paymentMethod) throw new Error('Stripe payment is required for checkout.');
  
  if (fulfillment === 'delivery') {
    if (!addressLine1 || addressLine1.length < 5) throw new Error('Street address is required for delivery.');
    if (!availability.city) throw new Error('Choose a GTA delivery city.');
    if (!availability.hasValidPostal) throw new Error('Enter a valid Canadian postal code.');
    if (!availability.eligible) throw new Error('Orders are currently available only within the Greater Toronto Area.');
  }

  const paymentLabel = PAYMENT_METHOD_LABELS[paymentMethod];
  const primaryProduct = billing.items.length === 1 ? billing.items[0].product : 'Multiple Products';
  const subject = `CHECKOUT REQUEST: ${primaryProduct} (${fulfillment.toUpperCase()})`;
  
  const fulfillmentDetails = fulfillment === 'pickup' 
    ? 'Fulfillment: LOCAL PICKUP\nLocation: Ameer Global Distribution Center, 103 Laura Rd, North York, ON M3N 1Z8'
    : `Fulfillment: DELIVERY\nDelivery city: ${availability.city ? availability.city.label : 'Unknown'}\nRegion: ${availability.region}\nPostal code: ${availability.postalCode}\nAddress line 1: ${addressLine1}\nAddress line 2: ${addressLine2 || 'N/A'}`;

  const itemLines = billing.items.map(i => ` - ${i.quantity}x ${i.product} (CAD ${i.unitPriceCad.toFixed(2)} ea)`);

  const messageLines = [
    'New checkout request from the GTA order page.',
    '',
    `Products:`,
    ...itemLines,
    `Total Boxes: ${billing.quantity}`,
    fulfillmentDetails,
    '',
    `Currency: ${billing.currency}`,
    `Subtotal: CAD ${billing.subtotalCad.toFixed(2)}`,
    `Shipping: CAD ${billing.shippingCad.toFixed(2)}`,
    `Estimated total: CAD ${billing.totalCad.toFixed(2)}`,
    '',
    `Customer Name: ${normalizeText(body.name)}`,
    `Email: ${normalizeText(body.email)}`,
    `Phone: ${phone}`,
    `Payment method: ${paymentLabel}`,
    `Additional notes: ${notes || 'N/A'}`
  ];

  const contactRecord = createContactRecord({
    name: body.name,
    email: body.email,
    subject,
    message: messageLines.join('\n'),
    source: 'checkout-page',
    product: primaryProduct,
    intent: 'buy'
  });

  return {
    availability,
    billing,
    contactRecord,
    paymentMethod,
    quantity: billing.quantity
  };
}

function buildCheckoutResponse(paymentMethod, product, email) {
  const paymentLabel = PAYMENT_METHOD_LABELS[paymentMethod];

  if (paymentMethod !== 'stripe') {
    throw new Error('Unsupported payment method.');
  }

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
      message: 'Your order was received. Secure Stripe payment details will be sent shortly.'
    };
  }

  throw new Error('Unable to prepare payment response.');
}

module.exports = {
  GTA_CITIES,
  PRODUCT_PRICES_CAD,
  PAYMENT_METHOD_LABELS,
  buildAvailabilityResponse,
  buildBilling,
  buildCheckoutContactRecord,
  buildCheckoutResponse,
  getAvailability,
  getFulfillmentProfile,
  normalizePostalCode,
  resolvePaymentMethod
};
