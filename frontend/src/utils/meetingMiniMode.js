export const meetingViewportKey = Symbol('meetingViewport');

// This is an in-app view of the existing session, available on touch screens too.
export function canUseMeetingMiniMode() {
  return typeof window !== 'undefined';
}
