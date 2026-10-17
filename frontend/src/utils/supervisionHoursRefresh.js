const eventName = 'supervision-hours-changed';
export function notifySupervisionHoursChanged(detail) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}
export function onSupervisionHoursChanged(handler) {
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
