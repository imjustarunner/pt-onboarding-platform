<template>
  <div
    class="public-translate-widget"
    role="region"
    aria-label="Page language"
  >
    <span class="public-translate-label notranslate" translate="no">Language</span>
    <div class="public-translate-buttons notranslate" translate="no">
      <button
        type="button"
        class="public-translate-btn"
        :class="{ active: !spanishActive }"
        :aria-pressed="!spanishActive ? 'true' : 'false'"
        @click="setEnglish"
      >
        English
      </button>
      <button
        type="button"
        class="public-translate-btn"
        :class="{ active: spanishActive }"
        :aria-pressed="spanishActive ? 'true' : 'false'"
        @click="setSpanish"
      >
        Español
      </button>
    </div>
    <!-- Hidden hook for Google Translate (required for cookie-based language to apply) -->
    <div id="google_translate_element" ref="translateHost" class="public-translate-gt-host" aria-hidden="true" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import {
  clearGoogleTranslateCookie,
  setGoogleTranslateCookieEnToEs,
  isGoogleTranslateSpanishActive
} from '../../utils/publicTranslateWidget.js';

const translateHost = ref(null);
const spanishActive = ref(false);

let scriptPromise = null;
/** Google only supports one TranslateElement per full page load. */
let translateElementInitialized = false;

function loadGoogleTranslateScript() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.translate?.TranslateElement) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  const cb = '__publicGoogleTranslateElementInit';
  scriptPromise = new Promise((resolve, reject) => {
    window[cb] = () => resolve();
    const s = document.createElement('script');
    s.src = `https://translate.google.com/translate_a/element.js?cb=${encodeURIComponent(cb)}`;
    s.async = true;
    s.onerror = () => reject(new Error('Google Translate script failed to load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

function initTranslateElement() {
  const el = translateHost.value;
  if (!el || !window.google?.translate?.TranslateElement) return;
  if (translateElementInitialized) return;
  translateElementInitialized = true;
  // eslint-disable-next-line no-new
  new window.google.translate.TranslateElement(
    {
      pageLanguage: 'en',
      includedLanguages: 'en,es',
      layout: window.google.translate.TranslateElement.InlineLayout.HORIZONTAL,
      autoDisplay: false
    },
    'google_translate_element'
  );
}

function syncSpanishFromCookie() {
  spanishActive.value = isGoogleTranslateSpanishActive();
}

function setEnglish() {
  if (!isGoogleTranslateSpanishActive()) return;
  clearGoogleTranslateCookie();
  window.location.reload();
}

function setSpanish() {
  if (isGoogleTranslateSpanishActive()) return;
  setGoogleTranslateCookieEnToEs();
  window.location.reload();
}

onMounted(async () => {
  syncSpanishFromCookie();
  try {
    await loadGoogleTranslateScript();
    initTranslateElement();
  } catch {
    /* script blocked or offline — buttons still toggle cookie + reload */
  }
});
</script>

<style scoped>
.public-translate-widget {
  position: fixed;
  z-index: 10050;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(15, 23, 42, 0.12);
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.12);
  font-size: 13px;
  max-width: calc(100vw - 24px);
}

.public-translate-label {
  font-weight: 600;
  color: #334155;
  margin-right: 2px;
}

.public-translate-buttons {
  display: inline-flex;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.15);
}

.public-translate-btn {
  margin: 0;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  background: #f1f5f9;
  color: #475569;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.public-translate-btn + .public-translate-btn {
  border-left: 1px solid rgba(15, 23, 42, 0.12);
}

.public-translate-btn:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.public-translate-btn.active {
  background: #2563eb;
  color: #fff;
}

.public-translate-gt-host {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  pointer-events: none;
}

@media (max-width: 480px) {
  .public-translate-widget {
    right: 8px;
    bottom: 8px;
    padding: 6px 8px;
    font-size: 12px;
  }
  .public-translate-btn {
    padding: 6px 10px;
    font-size: 12px;
  }
}
</style>

<style>
/* Hide Google Translate top iframe bar; we use EN / Español buttons instead */
body {
  top: 0 !important;
}

.goog-te-banner-frame,
iframe.goog-te-banner-frame {
  display: none !important;
  visibility: hidden !important;
  height: 0 !important;
  width: 0 !important;
}
</style>
