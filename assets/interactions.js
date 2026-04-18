(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveal on scroll for major blocks
  const candidates = [
    ...document.querySelectorAll('main section > div'),
    ...document.querySelectorAll('main section h2, main section h3'),
    ...document.querySelectorAll('.group')
  ];

  candidates.forEach((el) => el.classList.add('reveal'));

  if (!prefersReduced && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

    candidates.forEach((el) => observer.observe(el));
  } else {
    candidates.forEach((el) => el.classList.add('is-visible'));
  }

  // Scroll-linked hero motion (ship + media)
  if (!prefersReduced) {
    const heroImage = document.querySelector('.home-page main > section:first-of-type .hero-ship-video') ||
      document.querySelector('.home-page main > section:first-of-type .absolute.inset-0 img');
    const hero = document.querySelector('.home-page main > section:first-of-type');

    if (hero && heroImage) {
      let raf = null;

      const syncHero = () => {
        const rect = hero.getBoundingClientRect();
        const travel = Math.max(hero.offsetHeight * 0.95, window.innerHeight);
        const progressRaw = (window.innerHeight - rect.top) / (travel + window.innerHeight * 0.25);
        const progress = Math.max(0, Math.min(1, progressRaw));
        hero.style.setProperty('--ship-scroll', progress.toFixed(3));
        heroImage.style.transform = `scale(${1.06 + progress * 0.08}) translate3d(${-progress * 14}px, ${-progress * 10}px, 0)`;
        raf = null;
      };

      const onScroll = () => {
        if (raf === null) raf = window.requestAnimationFrame(syncHero);
      };

      syncHero();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
    }
  }
})();
