// Presentation only: these slides never contact a clinical or messaging service.
export function initializeFeatureRotation(root) {
  const slides = [...root.querySelectorAll('.feature-rotation-slide')];
  if (slides.length < 2) return;
  const selectors = [...root.querySelectorAll('[data-feature-index]')];
  const toggle = root.querySelector('[data-rotation-toggle]');
  const status = root.querySelector('[data-rotation-status]');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let rotating = !motion.matches;
  let hovering = false;
  let timer;

  function schedule() {
    window.clearTimeout(timer);
    toggle.textContent = rotating ? 'Pause rotation' : 'Start rotation';
    if (rotating && !hovering && !document.hidden) {
      timer = window.setTimeout(() => show(current + 1), 8000);
    }
  }

  function show(index, manual = false) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => { slide.hidden = i !== current; });
    selectors.forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
    if (manual) {
      rotating = false;
      status.textContent = slides[current].getAttribute('aria-label');
    }
    schedule();
  }

  root.querySelectorAll('[data-rotation-controls]').forEach(control => { control.hidden = false; });
  selectors.forEach((button, i) => button.addEventListener('click', () => show(i, true)));
  root.querySelector('[data-rotation-previous]').addEventListener('click', () => show(current - 1, true));
  root.querySelector('[data-rotation-next]').addEventListener('click', () => show(current + 1, true));
  toggle.addEventListener('click', () => { rotating = !rotating; schedule(); });
  root.addEventListener('mouseenter', () => { hovering = true; schedule(); });
  root.addEventListener('mouseleave', () => { hovering = false; schedule(); });
  root.addEventListener('focusin', event => {
    if (event.target !== toggle) { rotating = false; schedule(); }
  });
  root.querySelector('.feature-rotation-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1);
    show(next, true);
    selectors[current].focus();
  });
  motion.addEventListener('change', () => { if (motion.matches) { rotating = false; schedule(); } });
  document.addEventListener('visibilitychange', schedule);
  schedule();
}
