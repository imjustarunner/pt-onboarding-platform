import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

/** Expand within the app so body-teleported appointment dialogs remain visible. */
export function useScheduleFullscreen(root) {
  const native = ref(false), expanded = ref(false);
  const active = computed(() => native.value || expanded.value);
  let returnFocus, previousOverflow = '';
  let appRoot, appWasInert = false;
  function sync() { native.value = !!(document.fullscreenElement && root.value && document.fullscreenElement.contains(root.value)); }
  function leaveFallback() {
    if (!expanded.value) return;
    expanded.value = false;
    document.body.style.overflow = previousOverflow;
    if (appRoot) { appRoot.inert = appWasInert; appRoot = null; }
  }
  async function toggle() {
    if (active.value) {
      if (native.value) await document.exitFullscreen();
      leaveFallback();
      await nextTick();
      returnFocus?.focus?.();
      return;
    }
    returnFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    expanded.value = true;
    await nextTick();
    // The expanded root is teleported outside the app. Keep keyboard focus out of the covered page.
    const app = document.getElementById('app');
    if (app && root.value && !app.contains(root.value)) { appRoot = app; appWasInert = app.inert; app.inert = true; }
    root.value?.querySelector('[data-tour="my-schedule-fullscreen"]')?.focus();
  }
  function escape(event) {
    if (event.key === 'Escape' && expanded.value) { leaveFallback(); void nextTick(() => returnFocus?.focus?.()); }
  }
  onMounted(() => { sync(); document.addEventListener('fullscreenchange', sync); document.addEventListener('keydown', escape); });
  onBeforeUnmount(() => {
    leaveFallback();
    document.removeEventListener('fullscreenchange', sync);
    document.removeEventListener('keydown', escape);
  });
  return { fullscreenActive: active, fullscreenFallback: expanded, toggleFullscreen: toggle };
}
