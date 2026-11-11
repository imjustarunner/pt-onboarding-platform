export function trapDialogKey(event, element, close) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
  if (event.key !== 'Tab' || !element) return;
  const controls = [...element.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => !el.hidden && el.getAttribute('aria-hidden') !== 'true');
  if (!controls.length) { event.preventDefault(); element.focus(); return; }
  if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === element)) { event.preventDefault(); controls.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
}
