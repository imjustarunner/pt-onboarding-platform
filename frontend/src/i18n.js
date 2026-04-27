import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import es from './locales/es.json';

/**
 * Shared vue-i18n instance for public-facing pages. Static UI labels come
 * from these JSON bundles; dynamic DB content is translated server-side
 * through `/api/public/translations` and cached via the AI translation
 * service.
 */

function detectInitialLocale() {
  try {
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    if (urlLang === 'es' || urlLang === 'en') return urlLang;
  } catch { /* ignore */ }
  try {
    const stored = localStorage.getItem('publicLocale');
    if (stored === 'es' || stored === 'en') return stored;
  } catch { /* ignore */ }
  return 'en';
}

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: detectInitialLocale(),
  fallbackLocale: 'en',
  messages: { en, es }
});

export function setPublicLocale(locale) {
  const next = locale === 'es' ? 'es' : 'en';
  i18n.global.locale.value = next;
  try {
    localStorage.setItem('publicLocale', next);
  } catch { /* ignore */ }
  try {
    document.documentElement.setAttribute('lang', next);
  } catch { /* ignore */ }
}

try {
  document.documentElement.setAttribute('lang', i18n.global.locale.value);
} catch { /* ignore */ }
