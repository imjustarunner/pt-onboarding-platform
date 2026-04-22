<template>
  <div
    class="public-translate-widget"
    role="region"
    aria-label="Page language"
  >
    <span class="public-translate-label notranslate" translate="no">{{ t('common.language') }}</span>
    <div class="public-translate-buttons notranslate" translate="no">
      <button
        type="button"
        class="public-translate-btn"
        :class="{ active: locale === 'en' }"
        :aria-pressed="locale === 'en' ? 'true' : 'false'"
        @click="choose('en')"
      >
        English
      </button>
      <button
        type="button"
        class="public-translate-btn"
        :class="{ active: locale === 'es' }"
        :aria-pressed="locale === 'es' ? 'true' : 'false'"
        @click="choose('es')"
      >
        Español
      </button>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '../../composables/useLocale.js';

const { t, locale, setLocale } = useLocale();

/**
 * On public pages we now use a proper i18n layer (static strings) plus an
 * AI-backed translation cache (dynamic DB strings) instead of Google
 * Translate. Changing the locale here updates vue-i18n and persists to
 * localStorage so subsequent page loads stay in the chosen language.
 */
function choose(next) {
  const target = next === 'es' ? 'es' : 'en';
  if (locale.value === target) return;
  setLocale(target);
}
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
