import { nextTick, onBeforeUnmount, onMounted } from 'vue';
let openDialogs = 0, previousOverflow = '';
export function useModalFocus(element, close) {
  let previousFocus;
  function keys(event) {
    if (!element.value?.contains(document.activeElement)) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close?.(); }
    if (event.key !== 'Tab') return;
    const nodes = [...element.value.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node => !node.closest('[hidden]') && node.getAttribute('aria-hidden') !== 'true');
    if (!nodes.length) { event.preventDefault(); element.value.focus(); return; }
    const first=nodes[0], last=nodes[nodes.length-1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  onMounted(async () => {
    previousFocus = document.activeElement;
    if (openDialogs++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    document.addEventListener('keydown',keys);
    await nextTick(); element.value?.querySelector('button:not(:disabled)')?.focus();
  });
  onBeforeUnmount(() => { document.removeEventListener('keydown',keys); if (--openDialogs === 0) document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); });
}
