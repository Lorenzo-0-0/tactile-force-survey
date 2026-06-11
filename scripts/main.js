/* Bootstraps Lenis smooth scroll, KaTeX rendering, nav scroll state, scroll-spy. */

(function () {

  // --- KaTeX rendering ------------------------------------------------
  function renderKatex() {
    if (typeof katex === 'undefined') return;
    document.querySelectorAll('[data-katex]').forEach((el) => {
      try { katex.render(el.dataset.katex, el, { throwOnError: false }); }
      catch (e) { console.warn('KaTeX inline error', e); }
    });
    document.querySelectorAll('[data-katex-display]').forEach((el) => {
      try { katex.render(el.dataset.katexDisplay, el, { throwOnError: false, displayMode: true }); }
      catch (e) { console.warn('KaTeX display error', e); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderKatex);
  } else {
    renderKatex();
  }
  window.addEventListener('load', renderKatex);

  // --- Lenis smooth scroll -------------------------------------------
  function initLenis() {
    if (typeof Lenis === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({
      lerp: 0.08,
      wheelMultiplier: 1.0,
      smoothWheel: true,
    });
    window.__lenis = lenis;
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        lenis.scrollTo(target, { offset: -64, duration: 1.2 });
      });
    });
  }
  window.addEventListener('load', initLenis);

  // --- Nav: add .is-scrolled once past hero -------------------------
  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.section--hero');
  if (nav && hero) {
    const threshold = () => hero.offsetHeight - 80;
    function syncNav() {
      nav.classList.toggle('is-scrolled', window.scrollY > threshold());
    }
    window.addEventListener('scroll', syncNav, { passive: true });
    window.addEventListener('resize', syncNav);
    syncNav();
  }

  // --- Scroll-spy: highlight current section in nav ------------------
  const navLinks = document.querySelectorAll('.nav__link');
  const sections = [...navLinks].map((a) => {
    const id = a.getAttribute('href').slice(1);
    return { link: a, el: document.getElementById(id) };
  }).filter((p) => p.el);

  if ('IntersectionObserver' in window && sections.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const match = sections.find((s) => s.el === entry.target);
        if (!match) return;
        if (entry.isIntersecting) {
          navLinks.forEach((l) => l.classList.remove('is-active'));
          match.link.classList.add('is-active');
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
    sections.forEach((s) => io.observe(s.el));
  }

})();
