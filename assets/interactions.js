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
})();
