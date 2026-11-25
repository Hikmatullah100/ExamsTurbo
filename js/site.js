(() => {
  const byId = (id) => document.getElementById(id);
  const drawer = byId("cartDrawer");
  const backdrop = byId("drawerBackdrop");

  function closeCart() {
    if (!drawer || !backdrop) return;
    drawer.classList.remove("open");
    backdrop.classList.remove("show");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  function openCart() {
    if (!drawer || !backdrop) return;
    drawer.classList.add("open");
    backdrop.classList.add("show");
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  byId("openCart")?.addEventListener("click", openCart);
  byId("closeCart")?.addEventListener("click", closeCart);
  backdrop?.addEventListener("click", closeCart);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCart();
  });

  byId("newsletterForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = byId("newsletterEmail");
    const message = byId("newsletterMessage");
    if (!email.checkValidity()) {
      email.reportValidity();
      return;
    }
    message.style.color = "#ff9a2e";
    try {
      if (!window.submitNewsletter) throw new Error("Newsletter service not ready");
      const result = await window.submitNewsletter(email.value);
      message.textContent =
        result === "already" ? "You are already subscribed." : "Thanks! You are subscribed.";
      email.value = "";
    } catch (error) {
      console.error("Newsletter failed:", error);
      message.textContent = "Sorry, subscription failed. Please try again.";
    }
  });

  byId("homeSearchForm")?.addEventListener("submit", (event) => {
    const input = byId("homeSearch");
    if (input.value.trim()) return;
    event.preventDefault();
    input.focus();
  });

  const year = byId("currentYear");
  if (year) year.textContent = new Date().getFullYear();

  const homeVendorCount = byId("homeVendorCount");
  const showVendorCount = () => {
    if (homeVendorCount && Array.isArray(window.VENDORS)) {
      homeVendorCount.textContent = window.VENDORS.length;
    }
  };
  showVendorCount();
  window.dataReady?.then(showVendorCount);

  window.showSiteToast = (message) => {
    const toast = byId("siteToast");
    const label = byId("toastMessage");
    if (!toast || !label || !window.bootstrap) return;
    label.textContent = message;
    bootstrap.Toast.getOrCreateInstance(toast, { delay: 2200 }).show();
  };
})();
