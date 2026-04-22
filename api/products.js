const { json } = require('./_lib/common');

const products = [
  {
    id: 'mango-chaunsa',
    name: 'Chaunsa Mango Premium Box',
    origin: 'Multan, Pakistan',
    unit: '5kg box',
    category: 'fresh-produce'
  },
  {
    id: 'mango-anwar-ratol',
    name: 'Anwar Ratol Mango Reserve',
    origin: 'Punjab, Pakistan',
    unit: '4kg box',
    category: 'fresh-produce'
  },
  {
    id: 'mango-sindhri',
    name: 'Sindhri Mango Estate Selection',
    origin: 'Sindh, Pakistan',
    unit: '6kg box',
    category: 'fresh-produce'
  }
];

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

  json(res, 200, { items: products });
};
