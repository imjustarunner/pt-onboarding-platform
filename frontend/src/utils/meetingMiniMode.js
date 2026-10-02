// Mini mode is a desktop feature; tablets and phones keep the session on screen.
export function canUseMeetingMiniMode() {
  if (typeof window === 'undefined') return false;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    && !(typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua))
    && window.innerWidth > 1024
    && !window.matchMedia?.('(pointer: coarse)').matches;
}
