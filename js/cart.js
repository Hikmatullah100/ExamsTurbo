// Cart state + PayPal checkout.
// Price kabhi browser se nahi jati: server (Edge Function) database se price nikalta hai.
(() => {
  /* ====== SETTINGS ======
     PayPal Developer Dashboard se "Client ID" yahan paste karein (Sandbox test ke liye, phir Live).
     Client ID public hoti hai, par Client SECRET kabhi yahan mat likhna. */
  const PAYPAL_CLIENT_ID = "";

  const STORAGE_KEY = "certivault_cart_v1";
  let cart = [];
  try {
    cart = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    cart = [];
  }

  let lastOrder = null; // payment ke baad "Thank you" dikhane ke liye
  let buttonsRendered = false;

  const money = (value) => "$" + Number(value).toFixed(2);
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  const count = () => cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = () =>
    cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function render() {
    const countEl = document.getElementById("cartCount");
    const drawerCount = document.getElementById("drawerCount");
    const itemsEl = document.getElementById("cartItems");
    const emptyEl = document.getElementById("cartEmpty");
    const checkout = document.getElementById("checkoutPanel");
    const subtotalEl = document.getElementById("cartSubtotal");
    if (!countEl || !itemsEl) return;
    countEl.textContent = count();
    drawerCount.textContent = `(${count()})`;
    subtotalEl.textContent = money(subtotal());
    itemsEl.innerHTML = "";
    emptyEl.classList.toggle("d-none", cart.length > 0);
    checkout.classList.toggle("d-none", cart.length === 0);

    // khali cart: ya "Your cart is empty" ya payment ke baad "Thank you"
    const h3 = emptyEl.querySelector("h3");
    const p = emptyEl.querySelector("p");
    if (h3 && p) {
      if (!emptyEl.dataset.h3) {
        emptyEl.dataset.h3 = h3.textContent;
        emptyEl.dataset.p = p.textContent;
      }
      h3.textContent = lastOrder ? "Thank you for your order!" : emptyEl.dataset.h3;
      p.textContent = lastOrder
        ? `Order ${lastOrder.number} is confirmed. We will email your study material to ${lastOrder.email}.`
        : emptyEl.dataset.p;
    }

    cart.forEach((item) => {
      const row = document.createElement("div");
      row.className = "cart-line";
      row.innerHTML = `
        <div><h4>${escapeHTML(item.name)}</h4><p>${escapeHTML(item.vendor)}${item.code ? ` · ${escapeHTML(item.code)}` : ""}</p>
          <div class="cart-line-controls">
            <button class="qty-btn" data-action="decrease" data-id="${escapeHTML(item.id)}" aria-label="Decrease quantity">−</button>
            <span class="qty-value">${item.quantity}</span>
            <button class="qty-btn" data-action="increase" data-id="${escapeHTML(item.id)}" aria-label="Increase quantity">+</button>
            <button class="remove-item" data-action="remove" data-id="${escapeHTML(item.id)}">Remove</button>
          </div>
        </div><div class="cart-line-price">${money(item.price * item.quantity)}</div>`;
      itemsEl.appendChild(row);
    });
  }
  function escapeHTML(value) {
    return String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  }
  function add(product, vendor) {
    lastOrder = null;
    const existing = cart.find((item) => item.id === product.id);
    if (existing) existing.quantity += 1;
    else
      cart.push({
        id: product.id,
        name: product.name,
        vendor,
        code: product.code || "",
        price: Number(product.price),
        quantity: 1,
      });
    save();
    render();
    window.showSiteToast?.(`${product.name} added to your cart`);
  }
  function update(id, action) {
    const item = cart.find((entry) => entry.id === id);
    if (!item) return;
    if (action === "increase") item.quantity += 1;
    if (action === "decrease") item.quantity -= 1;
    if (action === "remove" || item.quantity <= 0)
      cart = cart.filter((entry) => entry.id !== id);
    save();
    render();
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button) update(button.dataset.id, button.dataset.action);
  });

  /* ================= PayPal checkout ================= */
  const msg = (text, ok = false) => {
    const el = document.getElementById("checkoutMessage");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = ok ? "#4ade80" : "#fbbf24";
  };

  function loadSdk() {
    if (window.paypal) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(PAYPAL_CLIENT_ID)}&currency=USD&intent=capture&components=buttons`;
      s.onload = resolve;
      s.onerror = () => reject(new Error("PayPal could not be loaded."));
      document.head.appendChild(s);
    });
  }

  async function callFn(name, body) {
    const sb = window.supabaseClient;
    if (!sb) throw new Error("Checkout is not ready yet. Please refresh and try again.");
    const { data, error } = await sb.functions.invoke(name, { body });
    if (error) {
      let detail = "";
      try {
        detail = (await error.context.json()).error;
      } catch {
        /* ignore */
      }
      throw new Error(detail || "Something went wrong. Please try again.");
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  const emailValue = () => (document.getElementById("checkoutEmail")?.value || "").trim();
  const emailOk = () => {
    const el = document.getElementById("checkoutEmail");
    return !!el && el.checkValidity() && emailValue().length > 0;
  };

  async function renderPayPalButtons() {
    if (buttonsRendered) return;
    const form = document.getElementById("checkoutForm");
    if (!form) return;

    // purana demo button / text hatao
    form.querySelector('button[type="submit"]')?.setAttribute("hidden", "");
    const note = form.querySelector("small");
    if (note) note.textContent = "Secure payment by PayPal. Your study material is sent to the email above.";

    let box = document.getElementById("paypalButtons");
    if (!box) {
      box = document.createElement("div");
      box.id = "paypalButtons";
      box.style.marginTop = "12px";
      form.insertBefore(box, note || null);
    }

    if (!PAYPAL_CLIENT_ID) {
      box.innerHTML = '<p style="color:#fbbf24;margin:0">Online payment is not available yet. Please check back soon.</p>';
      return;
    }
    try {
      await loadSdk();
    } catch (e) {
      box.textContent = e.message;
      return;
    }
    buttonsRendered = true;
    window.paypal
      .Buttons({
        style: { layout: "vertical", shape: "rect", label: "pay" },
        onClick: (_d, actions) => {
          if (!cart.length) return actions.reject();
          if (!emailOk()) {
            document.getElementById("checkoutEmail")?.reportValidity();
            msg("Enter a valid email address for delivery.");
            return actions.reject();
          }
          msg("");
          return actions.resolve();
        },
        createOrder: async () => {
          const data = await callFn("create-paypal-order", {
            email: emailValue(),
            items: cart.map((i) => ({ exam_id: i.id, quantity: i.quantity })),
          });
          return data.paypal_order_id;
        },
        onApprove: async (data) => {
          msg("Confirming your payment...", true);
          const res = await callFn("capture-paypal-order", { paypal_order_id: data.orderID });
          lastOrder = { number: res.order_number, email: emailValue() };
          cart = [];
          save();
          render();
          msg("");
          window.showSiteToast?.("Payment received. Thank you!");
        },
        onCancel: () => msg("Payment was cancelled. You were not charged."),
        onError: (err) => msg(err?.message || "Payment failed. You were not charged."),
      })
      .render("#paypalButtons");
  }

  // checkout form Enter dabane par page reload na ho
  document.getElementById("checkoutForm")?.addEventListener("submit", (e) => e.preventDefault());

  // cart drawer khulne par buttons render karo (container visible hona chahiye)
  document.getElementById("openCart")?.addEventListener("click", () => {
    setTimeout(() => {
      if (cart.length) renderPayPalButtons();
    }, 350);
  });
  const origAdd = add;

  window.CertiCart = {
    add: (...args) => {
      origAdd(...args);
      setTimeout(() => {
        if (cart.length) renderPayPalButtons();
      }, 350);
    },
    render,
    count,
    subtotal,
  };
  render();
  if (cart.length) setTimeout(renderPayPalButtons, 600);
})();