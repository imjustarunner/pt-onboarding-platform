import { ref, onMounted, onUnmounted } from 'vue';

/**
 * Reactive prefers-reduced-motion media query for activity animations.
 */
export function usePrefersReducedMotion() {
  const prefersReducedMotion = ref(false);
  let mql = null;

  function update() {
    prefersReducedMotion.value = !!(mql && mql.matches);
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    update();
    if (mql.addEventListener) mql.addEventListener('change', update);
    else if (mql.addListener) mql.addListener(update);
  });

  onUnmounted(() => {
    if (!mql) return;
    if (mql.removeEventListener) mql.removeEventListener('change', update);
    else if (mql.removeListener) mql.removeListener(update);
  });

  return { prefersReducedMotion };
}
