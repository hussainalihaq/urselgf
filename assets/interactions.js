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

  // Slight mouse parallax on hero image for premium feel
  if (!prefersReduced) {
    const heroImage = document.querySelector('main > section:first-of-type .absolute.inset-0 img');
    const hero = document.querySelector('main > section:first-of-type');

    if (hero && heroImage) {
      hero.addEventListener('mousemove', (e) => {
        const rect = hero.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        heroImage.style.transform = `scale(1.08) translate(${x * 14}px, ${y * 10}px)`;
      });

      hero.addEventListener('mouseleave', () => {
        heroImage.style.transform = 'scale(1.05) translate(0px, 0px)';
      });
    }
  }
})();
