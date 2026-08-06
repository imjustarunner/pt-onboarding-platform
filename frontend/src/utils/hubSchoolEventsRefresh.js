/** Notify caseload-hub calendar/list views to reload after a school event changes. */
export function notifyHubSchoolEventsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('hub-school-events-changed'));
}

export function onHubSchoolEventsChanged(handler) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('hub-school-events-changed', handler);
  return () => window.removeEventListener('hub-school-events-changed', handler);
}
