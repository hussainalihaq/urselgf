(() => {
  function init() {
    const toggle = document.getElementById("mobile-nav-toggle");
    const drawer = document.getElementById("mobile-nav-drawer");
    const overlay = document.getElementById("mobile-nav-overlay");
    const close = document.getElementById("mobile-nav-close");

    if (!toggle || !drawer || !overlay || !close) return;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    let lastActiveEl = null;

    const isOpen = () => !drawer.classList.contains("-translate-x-full");

    const setOpen = (open) => {
      if (open) {
        lastActiveEl = document.activeElement;
        overlay.classList.remove("hidden");
        // Next frame: fade in the overlay (prevents a flash on some browsers).
        requestAnimationFrame(() => overlay.classList.remove("opacity-0"));
        drawer.classList.remove("-translate-x-full");
        toggle.setAttribute("aria-expanded", "true");
        drawer.setAttribute("aria-hidden", "false");
        document.documentElement.classList.add("overflow-hidden");

        const firstFocusable = drawer.querySelector(focusableSelector);
        if (firstFocusable) firstFocusable.focus({ preventScroll: true });
        return;
      }

      overlay.classList.add("opacity-0");
      drawer.classList.add("-translate-x-full");
      toggle.setAttribute("aria-expanded", "false");
      drawer.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("overflow-hidden");

      // Wait for the overlay transition before hiding.
      window.setTimeout(() => {
        if (!isOpen()) overlay.classList.add("hidden");
      }, 220);

      if (lastActiveEl && typeof lastActiveEl.focus === "function") {
        lastActiveEl.focus({ preventScroll: true });
      }
    };

    toggle.addEventListener("click", () => setOpen(true));
    close.addEventListener("click", () => setOpen(false));
    overlay.addEventListener("click", () => setOpen(false));

    drawer.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (a) setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (!isOpen()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }

      if (e.key !== "Tab") return;

      // Lightweight focus trap for accessibility on mobile.
      const focusables = Array.from(drawer.querySelectorAll(focusableSelector)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.AmeerMobileNav = { init };
})();

