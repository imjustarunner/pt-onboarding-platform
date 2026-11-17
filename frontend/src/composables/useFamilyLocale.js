import { computed, inject, onBeforeUnmount, provide, ref, shallowRef, unref, watch } from 'vue';
import spanish from '../locales/family.es.json';

export const familyLocaleKey = Symbol('familyLocale');
const normalize = value => String(value || '').toLowerCase().startsWith('es') ? 'es' : 'en';
// The account-security toolbar is outside the family view's injection tree.
// Share presentation language only while that person's family view is mounted.
const activeLocales = shallowRef(new Map());
let languageBeforeFamilyViews;
export function useActiveFamilyLocale(userId) {
  return computed(() => {
    const active = [...activeLocales.value.values()].at(-1);
    return active?.userId && String(active.userId) === String(unref(userId)) ? active.locale : 'en';
  });
}

export function familyTranslator(locale) {
  return (text, values = {}) => {
    const translated = unref(locale) === 'es' ? spanish[text] || text : text;
    return String(translated ?? '').replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
  };
}

export function provideFamilyLocale({ userId, enrollmentLocale, requestedLocale }) {
  const choice = ref(null);
  if (!activeLocales.value.size) languageBeforeFamilyViews = document.documentElement.lang;
  const storageKey = computed(() => `familyPortalLanguage:${unref(userId)}`);
  watch(userId, id => {
    choice.value = null;
    if (!id) return;
    const explicit=unref(requestedLocale);
    if(['en','es'].includes(explicit)){choice.value=explicit;try{localStorage.setItem(storageKey.value,explicit);}catch{}return;}
    try {
      const saved = localStorage.getItem(storageKey.value);
      if (['en', 'es'].includes(saved)) choice.value = saved;
    } catch { /* Language selection also works without browser storage. */ }
  }, { immediate: true });
  watch(()=>unref(requestedLocale),value=>{if(!['en','es'].includes(value))return;choice.value=value;if(unref(userId)){try{localStorage.setItem(storageKey.value,value);}catch{}}});
  const locale = computed(() => choice.value || normalize(unref(enrollmentLocale)));
  const owner = Symbol('familyView');
  watch([() => unref(userId), locale], ([id, value]) => {
    activeLocales.value = new Map(activeLocales.value).set(owner, {userId: id, locale: value});
    if ([...activeLocales.value.keys()].at(-1) === owner) document.documentElement.lang = value;
  }, {immediate: true});
  onBeforeUnmount(() => {
    const remaining = new Map(activeLocales.value); remaining.delete(owner); activeLocales.value = remaining;
    document.documentElement.lang = [...remaining.values()].at(-1)?.locale ?? languageBeforeFamilyViews ?? 'en';
    if (!remaining.size) languageBeforeFamilyViews = undefined;
  });
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
