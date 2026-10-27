import { computed, inject, onBeforeUnmount, provide, ref, unref, watch } from 'vue';
import spanish from '../locales/family.es.json';

export const familyLocaleKey = Symbol('familyLocale');
const normalize = value => String(value || '').toLowerCase().startsWith('es') ? 'es' : 'en';

export function familyTranslator(locale) {
  return (text, values = {}) => {
    const translated = unref(locale) === 'es' ? spanish[text] || text : text;
    return String(translated ?? '').replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
  };
}

export function provideFamilyLocale({ userId, enrollmentLocale }) {
  const choice = ref(null);
  const storageKey = computed(() => `familyPortalLanguage:${unref(userId)}`);
  watch(userId, id => {
    choice.value = null;
    if (!id) return;
    try {
      const saved = localStorage.getItem(storageKey.value);
      if (['en', 'es'].includes(saved)) choice.value = saved;
    } catch { /* Language selection also works without browser storage. */ }
  }, { immediate: true });
  const locale = computed(() => choice.value || normalize(unref(enrollmentLocale)));
  const previousLanguage = document.documentElement.lang;
  watch(locale, value => { document.documentElement.lang = value; }, { immediate: true });
  onBeforeUnmount(() => { document.documentElement.lang = previousLanguage; });
  function setLocale(value) {
    choice.value = normalize(value);
    if (unref(userId)) {
      try { localStorage.setItem(storageKey.value, choice.value); } catch { /* Optional persistence. */ }
    }
  }
  const context = { locale, ft: familyTranslator(locale), setLocale };
  provide(familyLocaleKey, context);
  return context;
}

export function useFamilyLocale() {
  return inject(familyLocaleKey, { locale: ref('en'), ft: familyTranslator('en') });
}
