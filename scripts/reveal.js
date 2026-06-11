/* IntersectionObserver-driven reveal for [data-reveal] and char-split for [data-split]. */

(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- char split for hero title --------------------------------------
  document.querySelectorAll('[data-split]').forEach((el) => {
    const text = el.textContent.trim();
    el.textContent = '';
    [...text].forEach((ch, i) => {
      const span = document.createElement('span');
      span.className = 'char';
      span.style.setProperty('--i', i);
      span.textContent = ch === ' ' ? ' ' : ch;
      el.appendChild(span);
    });
  });

  // --- reveal observer ------------------------------------------------
  const targets = document.querySelectorAll('[data-reveal], [data-split]');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

  targets.forEach((el) => io.observe(el));

  // --- count-up for stat numbers -------------------------------------
  const countNodes = document.querySelectorAll('[data-count-to]');
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const node = entry.target;
      const target = parseFloat(node.dataset.countTo);
      const decimals = parseInt(node.dataset.countDecimals || '0', 10);
      const duration = 1400;
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const val = target * eased;
        node.textContent = val.toFixed(decimals);
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      countIO.unobserve(node);
    });
  }, { threshold: 0.4 });

  countNodes.forEach((n) => countIO.observe(n));
})();
