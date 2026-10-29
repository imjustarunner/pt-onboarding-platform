import { nextTick, onBeforeUnmount, ref, shallowRef } from 'vue';

// Move the existing workspace so its publisher, admission heartbeat and tools
// stay connected. Browsers without Document PiP use a floating in-page window.
export function useSessionMiniWindow() {
  const mini = ref(false);
  const miniTarget = shallowRef(null);
  const miniBusy = ref(false);
  let pipWindow = null;
  let disposed = false;
  let generation = 0;

  async function closeMini() {
    generation += 1;
    const previous = pipWindow;
    const previousTarget = miniTarget.value;
    pipWindow = null;
    mini.value = false;
    await nextTick();
    if (miniTarget.value === previousTarget) miniTarget.value = null;
    if (previous && !previous.closed) previous.close();
  }

  async function openMini() {
    if (mini.value || miniBusy.value || disposed) return;
    const request = ++generation;
    miniBusy.value = true;
    try {
      if (window.documentPictureInPicture?.requestWindow) {
        const opened = await window.documentPictureInPicture.requestWindow({ width: 460, height: 460 });
        if (disposed || request !== generation) { opened.close(); return; }
        pipWindow = opened;
        opened.document.title = 'Session mini view';
        for (const sheet of document.styleSheets) {
          try {
            const style = opened.document.createElement('style');
            style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
            opened.document.head.append(style);
          } catch {
            if (!sheet.href) continue;
            const link = opened.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheet.href;
            opened.document.head.append(link);
          }
        }
        opened.document.body.style.margin = '0';
        miniTarget.value = opened.document.body;
        opened.addEventListener('pagehide', () => {
          if (pipWindow !== opened) return;
          pipWindow = null;
          void closeMini();
        }, { once: true });
      }
      mini.value = true;
    } catch {
      // The session remains usable if browser policy prevents a PiP window.
      if (!disposed && request === generation) mini.value = true;
    } finally {
      miniBusy.value = false;
    }
  }

  onBeforeUnmount(() => { disposed = true; void closeMini(); });
  return { mini, miniTarget, miniBusy, openMini, closeMini };
}
