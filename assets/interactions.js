(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const initReveal = () => {
    const candidates = [
      ...document.querySelectorAll('main section > div'),
      ...document.querySelectorAll('main section h2, main section h3'),
      ...document.querySelectorAll('.group'),
      ...document.querySelectorAll('.reveal-on-scroll')
    ];
    const unique = Array.from(new Set(candidates));

    unique.forEach((el) => el.classList.add('reveal'));

    if (!prefersReduced && 'IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });

      unique.forEach((el) => observer.observe(el));
    } else {
      unique.forEach((el) => el.classList.add('is-visible'));
    }
  };

  const initSlideshow = () => {
    const slides = Array.from(document.querySelectorAll('.hero-slideshow .hero-slide'));
    const dots = Array.from(document.querySelectorAll('.hero-slideshow .hero-dot'));
    if (!slides.length) return;

    let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
    if (activeIndex < 0) activeIndex = 0;

    const setSlide = (nextIndex) => {
      activeIndex = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const active = index === activeIndex;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach((dot, index) => {
        dot.classList.toggle('is-active', index === activeIndex);
      });
    };

    let intervalId = null;
    const start = () => {
      if (prefersReduced || slides.length < 2) return;
      stop();
      intervalId = window.setInterval(() => setSlide(activeIndex + 1), 5800);
    };
    const stop = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        const target = Number(dot.dataset.slideTo || '0');
        setSlide(target);
        start();
      });
    });

    const hero = document.querySelector('.hero-slideshow');
    hero?.addEventListener('mouseenter', stop);
    hero?.addEventListener('mouseleave', start);
    setSlide(activeIndex);
    start();
  };

  const initFrontPopup = () => {
    const popup = document.getElementById('front-popup');
    if (!popup) return;
    const storageKey = 'ameer_popup_seen_v2';
    const seen = window.sessionStorage.getItem(storageKey) === '1';
    const closeButtons = popup.querySelectorAll('[data-popup-close]');

    const close = () => {
      popup.classList.remove('is-visible');
      popup.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('popup-open');
      window.sessionStorage.setItem(storageKey, '1');
    };
    const open = () => {
      popup.classList.add('is-visible');
      popup.setAttribute('aria-hidden', 'false');
      document.body.classList.add('popup-open');
    };

    closeButtons.forEach((button) => button.addEventListener('click', close));
    popup.addEventListener('click', (event) => {
      if (event.target === popup) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && popup.classList.contains('is-visible')) close();
    });

    if (!seen) {
      window.setTimeout(open, 420);
    }
  };

  const initHeroVideos = () => {
    const heroVideos = document.querySelectorAll('.home-page .hero-terminal-video');
    heroVideos.forEach((heroVideo) => {
      const tryPlay = () => {
        const playPromise = heroVideo.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      };

      heroVideo.muted = true;
      heroVideo.defaultMuted = true;
      heroVideo.playsInline = true;
      heroVideo.setAttribute('muted', '');
      heroVideo.setAttribute('playsinline', '');
      heroVideo.setAttribute('webkit-playsinline', '');
      heroVideo.preload = 'auto';

      heroVideo.addEventListener('canplay', tryPlay, { once: true });
      heroVideo.addEventListener('loadedmetadata', tryPlay, { once: true });
      tryPlay();
    });
  };

  initReveal();
  initSlideshow();
  initFrontPopup();
  initHeroVideos();
})();
