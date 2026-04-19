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

  // Hero video autoplay hardening for Safari/Chromium.
  const heroVideos = document.querySelectorAll('.home-page .hero-terminal-video');
  heroVideos.forEach((heroVideo) => {
    let started = false;
    let switched = false;
    let startupTimer = null;
    const fallbackSrc = heroVideo.dataset.fallbackSrc || '';

    const markPlaying = () => {
      if (started) return;
      started = true;
      heroVideo.classList.add('is-playing');
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
    };

    const tryPlay = () => {
      const playPromise = heroVideo.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => {
          if (heroVideo.currentTime > 0.04) markPlaying();
        }).catch(() => {});
      }
    };

    const switchToFallback = () => {
      if (switched || started || !fallbackSrc) return;
      switched = true;
      heroVideo.pause();
      heroVideo.src = fallbackSrc;
      heroVideo.load();
      tryPlay();
    };

    const armWatchdog = () => {
      if (startupTimer || started) return;
      startupTimer = window.setTimeout(() => {
        if (!started) switchToFallback();
      }, 2600);
    };

    heroVideo.muted = true;
    heroVideo.defaultMuted = true;
    heroVideo.playsInline = true;
    heroVideo.setAttribute('muted', '');
    heroVideo.setAttribute('playsinline', '');
    heroVideo.setAttribute('webkit-playsinline', '');
    heroVideo.preload = 'auto';

    heroVideo.addEventListener('canplay', () => {
      tryPlay();
      armWatchdog();
    }, { once: true });
    heroVideo.addEventListener('loadedmetadata', tryPlay, { once: true });
    heroVideo.addEventListener('playing', markPlaying);
    heroVideo.addEventListener('timeupdate', () => {
      if (heroVideo.currentTime > 0.06) markPlaying();
    });
    heroVideo.addEventListener('stalled', switchToFallback);
    heroVideo.addEventListener('error', switchToFallback);

    tryPlay();
    armWatchdog();

    // Some browsers block autoplay until first user gesture.
    const unlock = () => {
      tryPlay();
      armWatchdog();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('keydown', unlock);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tryPlay();
    });
  });
})();
