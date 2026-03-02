export const isStandalonePwa = () => {
  if (typeof window === 'undefined') return false;
  const mediaStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = typeof window.navigator !== 'undefined' && window.navigator.standalone === true;
  return Boolean(mediaStandalone || iosStandalone);
};

export const isLikelyMobileViewport = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
};
