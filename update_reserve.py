import re

with open('reserve/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Replace Product Card with Cart UI
product_card_pattern = re.compile(r'<!-- PRODUCT CARD -->.*?</div>\s*</div>', re.DOTALL)
cart_ui = '''<!-- CART -->
      <div class="lg:col-span-5">
        <div class="bg-white rounded-3xl shadow-[0_16px_48px_rgba(20,42,88,.08)] border border-[#203a7b]/6 sticky top-[120px] p-6">
          <h2 class="text-[1.8rem] text-[#142a53] mb-4" style="font-family:'DM Serif Display',serif">Your Reservation</h2>
          <div id="cart-items" class="space-y-4">
            <!-- Rendered by JS -->
          </div>
          <div class="pt-5 border-t border-[#203a7b]/8 mt-5">
            <p class="product-note !text-[0.85rem] !p-4">Tip: You can mix and match different mango varieties. No payment is required today.</p>
          </div>
        </div>
      </div>'''
html = product_card_pattern.sub(cart_ui, html, count=1)

# 2. Replace Summary Bar
summary_pattern = re.compile(r'<!-- SUMMARY BAR -->.*?</div>\s*</div>\s*</div>', re.DOTALL)
summary_ui = '''<!-- SUMMARY BAR -->
          <div class="rounded-2xl bg-gradient-to-r from-[#f8f9fc] to-[#edf3ff] border border-[#203a7b]/8 p-5 mt-2">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div class="text-[.65rem] font-bold uppercase tracking-[.16em] text-[#6e7b97]">Reservation Summary</div>
                <div class="text-[1rem] font-semibold text-[#182a59] mt-1" id="summary-line">0× Boxes Total</div>
              </div>
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-green-600 text-lg">check_circle</span>
                <span class="text-[.78rem] font-semibold text-green-700">$0 due today</span>
              </div>
            </div>
          </div>'''
html = summary_pattern.sub(summary_ui, html, count=1)

# 3. Replace Script
script_pattern = re.compile(r'<script>.*?</script>', re.DOTALL)
new_script = """<script>
  const productCatalog = {
    'Sindhri Mangoes': { unit: '2 kg box', origin: 'Multan, Pakistan', price: 38 },
    'Anwar Ratol Mangoes': { unit: '2 kg box', origin: 'Multan, Pakistan', price: 45 },
    'Chaunsa Mangoes': { unit: '2 kg box', origin: 'Multan, Pakistan', price: 52 },
    'Chaunsa Mango Premium Box': { unit: '2 kg box', origin: 'Multan, Pakistan', price: 52 },
    'Anwar Ratol Mango Reserve': { unit: '2 kg box', origin: 'Multan, Pakistan', price: 45 },
    'Sindhri Mango Estate Selection': { unit: '2 kg box', origin: 'Multan, Pakistan', price: 38 }
  };

  const params = new URLSearchParams(window.location.search);
  const passedProduct = params.get('product');
  const intent = params.get('intent') || 'reserve';
  
  let cart = [
    { product: 'Sindhri Mangoes', quantity: 0 },
    { product: 'Anwar Ratol Mangoes', quantity: 0 },
    { product: 'Chaunsa Mangoes', quantity: 0 }
  ];

  if (passedProduct) {
    const match = cart.find(c => passedProduct.toLowerCase().includes(c.product.toLowerCase().split(' ')[0]));
    if (match) match.quantity = 1;
    else cart[0].quantity = 1;
  } else {
    cart[0].quantity = 1;
  }

  const cartItemsEl = document.getElementById('cart-items');
  const summaryLine = document.getElementById('summary-line');
  const status = document.getElementById('reserve-status');
  const submitButton = document.getElementById('submit-reserve');

  function renderCart() {
    cartItemsEl.innerHTML = '';
    let totalQty = 0;
    cart.forEach((item, index) => {
      totalQty += item.quantity;
      const p = productCatalog[item.product];
      const itemEl = document.createElement('div');
      itemEl.className = 'flex items-center justify-between p-4 rounded-2xl border border-[#203a7b]/10 bg-[#f8f9fc] shadow-sm transition hover:shadow-md';
      itemEl.innerHTML = `
        <div>
          <div class="font-bold text-[#182a59] text-[1.1rem]" style="font-family:'DM Serif Display',serif">${item.product}</div>
          <div class="text-[.75rem] font-bold text-[#6e7b97] uppercase tracking-[0.1em] mt-1">${p.unit} &middot; CAD ${p.price.toFixed(2)}</div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" onclick="updateQty(${index}, -1)" class="w-[38px] h-[38px] flex items-center justify-center rounded-xl border-2 border-[#203a7b]/15 text-[#203a7b] font-bold bg-white hover:bg-[#edf3ff] hover:border-[#203a7b] transition-all">−</button>
          <span class="w-[32px] text-center font-bold text-[#182a59] text-[1.1rem]">${item.quantity}</span>
          <button type="button" onclick="updateQty(${index}, 1)" class="w-[38px] h-[38px] flex items-center justify-center rounded-xl border-2 border-[#203a7b]/15 text-[#203a7b] font-bold bg-white hover:bg-[#edf3ff] hover:border-[#203a7b] transition-all">+</button>
        </div>
      `;
      cartItemsEl.appendChild(itemEl);
    });
    
    summaryLine.textContent = `${totalQty}× Boxes Total`;
  }

  window.updateQty = function(index, delta) {
    cart[index].quantity = Math.max(0, Math.min(100, cart[index].quantity + delta));
    renderCart();
  };

  renderCart();

  document.getElementById('reserve-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const activeCart = cart.filter(c => c.quantity > 0);
    if (activeCart.length === 0) {
      status.textContent = 'Please add at least one box to your reservation.';
      status.style.color = '#a3392f';
      return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">progress_activity</span> Submitting...';
    status.textContent = 'Sending reserve request...';
    status.style.color = '#6e7b97';

    const itemLines = activeCart.map(i => ` - ${i.quantity}x ${i.product}`).join('\\n');
    const primaryProduct = activeCart.length === 1 ? activeCart[0].product : 'Multiple Products';
    const totalQty = activeCart.reduce((sum, i) => sum + i.quantity, 0);

    const payload = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      subject: `Reserve Request: ${primaryProduct}`,
      message: [
        `Products:`,
        itemLines,
        `Total Boxes: ${totalQty}`,
        '',
        `Phone: ${document.getElementById('phone').value.trim()}`,
        `Company: ${document.getElementById('company').value.trim() || 'N/A'}`,
        `City: ${document.getElementById('marketCity').value.trim()}`,
        `Country: ${document.getElementById('marketCountry').value.trim()}`,
        `Delivery window: ${document.getElementById('window').value.trim()}`,
        `Notes: ${document.getElementById('notes').value.trim()}`
      ].join('\\n'),
      source: 'reserve-page',
      product: primaryProduct,
      intent
    };

    try {
      const response = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      
      if (!response.ok) {
        status.textContent = result.error || 'Unable to submit reserve request.';
        status.style.color = '#a3392f';
        submitButton.disabled = false;
        submitButton.innerHTML = 'Reserve My Order <span class="material-symbols-outlined text-lg">arrow_forward</span>';
        return;
      }

      status.textContent = result.message || '✓ Reserve request sent successfully!';
      status.style.color = '#1f7a52';
      submitButton.disabled = false;
      submitButton.innerHTML = 'Reserve My Order <span class="material-symbols-outlined text-lg">arrow_forward</span>';
    } catch (error) {
      status.textContent = 'Network error. Please try again.';
      status.style.color = '#a3392f';
      submitButton.disabled = false;
      submitButton.innerHTML = 'Reserve My Order <span class="material-symbols-outlined text-lg">arrow_forward</span>';
    }
  });
</script>"""
html = script_pattern.sub(new_script, html, count=1)

with open('reserve/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
