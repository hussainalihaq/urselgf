import re

with open('checkout/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Replace Product Card with Cart UI
product_card_pattern = re.compile(r'<!-- PRODUCT CARD -->.*?</div>\s*</div>', re.DOTALL)
cart_ui = '''<!-- CART -->
      <div class="lg:col-span-5">
        <div class="bg-white rounded-3xl shadow-[0_16px_48px_rgba(20,42,88,.08)] border border-[#203a7b]/6 sticky top-[120px] p-6">
          <h2 class="text-[1.8rem] text-[#142a53] mb-4" style="font-family:'DM Serif Display',serif">Your Cart</h2>
          <div id="cart-items" class="space-y-4">
            <!-- Rendered by JS -->
          </div>
          <div class="pt-5 border-t border-[#203a7b]/8 mt-5">
            <p class="product-note !text-[0.85rem] !p-4">Tip: You can mix and match different mango varieties. Shipping is flat rate across the GTA!</p>
          </div>
        </div>
      </div>'''
html = product_card_pattern.sub(cart_ui, html, count=1)

# 2. Replace Order Summary
summary_pattern = re.compile(r'<!-- ORDER SUMMARY -->.*?</section>', re.DOTALL)
summary_ui = '''<!-- ORDER SUMMARY -->
            <section class="rounded-3xl border border-[#19489f]/12 bg-[#f7faff] p-6 shadow-sm">
              <div class="flex items-center justify-between gap-3 border-b border-[#19489f]/10 pb-4">
                <h3 class="text-[1.2rem] font-semibold text-[#17325f]">Order Summary</h3>
                <span class="rounded-full bg-white border border-[#19489f]/10 px-3 py-1.5 text-[.66rem] font-bold uppercase tracking-[.14em] text-[#305fbf]">CAD</span>
              </div>
              <div class="mt-4 space-y-3 text-[1rem] text-[#51668c]">
                <div class="flex items-center justify-between"><span>Subtotal (<span id="bill-qty">0</span> boxes)</span><strong id="bill-subtotal" class="money text-[#17325f]">$0.00</strong></div>
                <div id="bill-shipping-row" class="flex items-center justify-between hidden"><span>Shipping (GTA)</span><strong id="bill-shipping" class="money text-[#17325f]">$15.00</strong></div>
                <div class="flex items-center justify-between"><span>HST (13%)</span><strong id="bill-hst" class="money text-[#17325f]">$0.00</strong></div>
                <div class="mt-4 border-t border-[#19489f]/12 pt-4 flex items-center justify-between"><span class="font-bold text-[#17325f]">Total</span><strong id="bill-total" class="money text-[1.4rem] text-[#1f4ea5]">$0.00</strong></div>
              </div>
            </section>'''
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

    const currencyFormatter = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 2 });
    const params = new URLSearchParams(window.location.search);
    
    // Default cart items
    let cart = [
      { product: 'Sindhri Mangoes', quantity: 0 },
      { product: 'Anwar Ratol Mangoes', quantity: 0 },
      { product: 'Chaunsa Mangoes', quantity: 0 }
    ];

    const passedProduct = params.get('product');
    if (passedProduct) {
      const match = cart.find(c => passedProduct.toLowerCase().includes(c.product.toLowerCase().split(' ')[0]));
      if (match) match.quantity = 1;
      else cart[0].quantity = 1;
    } else {
      cart[0].quantity = 1;
    }

    // DOM Elements
    const cartItemsEl = document.getElementById('cart-items');
    const billQty = document.getElementById('bill-qty');
    const billSubtotal = document.getElementById('bill-subtotal');
    const billHst = document.getElementById('bill-hst');
    const billTotal = document.getElementById('bill-total');
    const checkoutStatus = document.getElementById('checkout-status');
    const btnPickup = document.getElementById('btn-toggle-pickup');
    const btnDelivery = document.getElementById('btn-toggle-delivery');
    const pickupSection = document.getElementById('pickup-section');
    const deliverySection = document.getElementById('delivery-section');
    
    let fulfillment = 'pickup';

    function renderCart() {
      cartItemsEl.innerHTML = '';
      cart.forEach((item, index) => {
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
      renderBilling();
    }

    window.updateQty = function(index, delta) {
      cart[index].quantity = Math.max(0, Math.min(100, cart[index].quantity + delta));
      renderCart();
    };

    function renderBilling() {
      let totalQty = 0;
      let subtotal = 0;
      cart.forEach(item => {
        totalQty += item.quantity;
        subtotal += item.quantity * productCatalog[item.product].price;
      });

      const shipping = fulfillment === 'delivery' ? 15.00 : 0;
      const preTax = subtotal + shipping;
      const hst = Number((preTax * 0.13).toFixed(2));
      const total = Number((preTax + hst).toFixed(2));

      billQty.textContent = String(totalQty);
      billSubtotal.textContent = currencyFormatter.format(subtotal);

      const billShippingRow = document.getElementById('bill-shipping-row');
      if (shipping > 0) {
        billShippingRow.classList.remove('hidden');
        document.getElementById('bill-shipping').textContent = currencyFormatter.format(shipping);
      } else {
        billShippingRow.classList.add('hidden');
      }

      billHst.textContent = currencyFormatter.format(hst);
      billTotal.textContent = currencyFormatter.format(total);
    }

    function setFulfillment(method) {
      fulfillment = method;
      if (method === 'pickup') {
        pickupSection.classList.remove('hidden');
        deliverySection.classList.add('hidden');
        btnPickup.classList.add('border-[#203a7b]', 'bg-[#edf3ff]', 'text-[#203a7b]');
        btnPickup.classList.remove('border-[#19489f]/15', 'bg-white', 'text-[#8b9cbd]');
        btnDelivery.classList.remove('border-[#203a7b]', 'bg-[#edf3ff]', 'text-[#203a7b]');
        btnDelivery.classList.add('border-[#19489f]/15', 'bg-white', 'text-[#8b9cbd]');
      } else {
        pickupSection.classList.add('hidden');
        deliverySection.classList.remove('hidden');
        btnDelivery.classList.add('border-[#203a7b]', 'bg-[#edf3ff]', 'text-[#203a7b]');
        btnDelivery.classList.remove('border-[#19489f]/15', 'bg-white', 'text-[#8b9cbd]');
        btnPickup.classList.remove('border-[#203a7b]', 'bg-[#edf3ff]', 'text-[#203a7b]');
        btnPickup.classList.add('border-[#19489f]/15', 'bg-white', 'text-[#8b9cbd]');
      }
      renderBilling();
    }

    btnPickup.addEventListener('click', () => setFulfillment('pickup'));
    btnDelivery.addEventListener('click', () => setFulfillment('delivery'));

    const passedFulfillment = params.get('fulfillment');
    const passedCity = (params.get('city') || '').trim();
    if (passedFulfillment === 'delivery') setFulfillment('delivery');
    else setFulfillment('pickup');

    if (passedCity) {
      const citySelect = document.getElementById('city');
      const options = Array.from(citySelect.options).map(o => o.value.toLowerCase());
      const idx = options.indexOf(passedCity.toLowerCase());
      if (idx >= 0) citySelect.selectedIndex = idx;
    }

    document.getElementById('checkout-form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();

      if (!name || !email || !phone) {
        checkoutStatus.textContent = 'Please fill out your Name, Email, and Phone.';
        checkoutStatus.style.color = '#a3392f';
        return;
      }

      const address1 = document.getElementById('address1').value.trim();
      const city = document.getElementById('city').value.trim();
      const postal = document.getElementById('postal').value.trim();
      const address2 = document.getElementById('address2').value.trim();

      if (fulfillment === 'delivery') {
        if (!address1 || !city || !postal) {
          checkoutStatus.textContent = 'Please fill out your complete delivery address.';
          checkoutStatus.style.color = '#a3392f';
          return;
        }
      }
      
      const activeCart = cart.filter(c => c.quantity > 0);
      if (activeCart.length === 0) {
        checkoutStatus.textContent = 'Please add at least one box to your cart.';
        checkoutStatus.style.color = '#a3392f';
        return;
      }

      const btn = document.getElementById('complete-order');
      btn.disabled = true;
      btn.textContent = 'Processing...';
      checkoutStatus.textContent = 'Submitting checkout securely...';
      checkoutStatus.style.color = '#1f4ea5';

      const payload = {
        cart: activeCart,
        fulfillment,
        name,
        email,
        phone,
        addressLine1: address1,
        addressLine2: address2,
        city,
        postalCode: postal,
        paymentMethod: 'stripe',
        notes: ''
      };

      try {
        const endpoint = '/api/checkout';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        const raw = await response.text();
        let result = {};
        try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }

        if (!response.ok) {
          checkoutStatus.textContent = result.error || `Checkout failed (${response.status}).`;
          checkoutStatus.style.color = '#a3392f';
          btn.disabled = false;
          btn.textContent = 'Pay via Stripe →';
          return;
        }

        if (result.payment && result.payment.status === 'redirect' && result.payment.url) {
          checkoutStatus.textContent = 'Redirecting to Stripe...';
          window.location.href = result.payment.url;
          return;
        }

        checkoutStatus.textContent = result.payment ? result.payment.message : 'Order received.';
        btn.disabled = false;
        btn.textContent = 'Pay via Stripe →';
      } catch (error) {
        checkoutStatus.textContent = `Network error: ${error.message}`;
        checkoutStatus.style.color = '#a3392f';
        btn.disabled = false;
        btn.textContent = 'Pay via Stripe →';
      }
    });

    renderCart();
  </script>"""
html = script_pattern.sub(new_script, html, count=1)

with open('checkout/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
