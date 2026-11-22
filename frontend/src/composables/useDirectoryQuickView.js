import { ref, onMounted, onUnmounted } from 'vue';

export function useDirectoryQuickView({ outsideSelector = '.directory-quick-view, .um-name-column', key = user => user.id } = {}) {
  const selectedUser = ref(null);
  let openTimer;
  let closeTimer;

  const keepOpen = () => clearTimeout(closeTimer);
  const close = () => {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    selectedUser.value = null;
  };
  const scheduleClose = () => {
    clearTimeout(openTimer);
    keepOpen();
    // Allow travel from the name to the drawer without making it sticky.
    closeTimer = setTimeout(close, 350);
  };
  const scheduleOpen = (user) => {
    clearTimeout(openTimer);
    keepOpen();
    if (!user || user.isOrphaned || user.isGuardian) return;
    if (selectedUser.value && key(selectedUser.value) === key(user)) return;
    openTimer = setTimeout(() => { selectedUser.value = user; }, 450);
  };
  const dismissOutside = (event) => {
    if (!event.target?.closest?.(outsideSelector)) close();
  };
  const dismissEscape = (event) => {
    if (event.key === 'Escape') close();
  };
  onMounted(() => {
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissEscape);
  });
  onUnmounted(() => {
    close();
    document.removeEventListener('pointerdown', dismissOutside, true);
    document.removeEventListener('keydown', dismissEscape);
  });
  return { selectedUser, scheduleOpen, cancelOpen: scheduleClose, keepOpen, scheduleClose, close };
}
