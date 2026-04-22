import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import api from '../services/api.js';
import { setPublicLocale } from '../i18n.js';

/**
 * Lightweight composable for public pages that need to read/write the
 * current locale and fetch dynamic-content translations (DB strings) from
 * the backend translations cache.
 */
export function useLocale() {
  const { t, locale } = useI18n();

  const isSpanish = computed(() => locale.value === 'es');

  function setLocale(next) {
    setPublicLocale(next);
  }

  /**
   * Fetch translated strings for a batch of records.
   *
   * @param {string} sourceType - allowed on the server side (e.g. 'company_event', 'organization', 'intake_link')
   * @param {number[]} ids
   * @param {string[]} fields
   * @returns {Promise<Record<string,string>>} keyed by `${id}:${field}`
   */
  async function fetchTranslations(sourceType, ids, fields) {
    if (locale.value !== 'es') return {};
    const idList = (Array.isArray(ids) ? ids : [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    const fieldList = (Array.isArray(fields) ? fields : [])
      .map((f) => String(f || '').trim())
      .filter(Boolean);
    if (!idList.length || !fieldList.length) return {};
    try {
      const resp = await api.get('/public/translations', {
        params: {
          sourceType,
          ids: idList.join(','),
          fields: fieldList.join(','),
          lang: 'es'
        }
      });
      return resp?.data?.translations || {};
    } catch {
      return {};
    }
  }

  function translatedFor(translations, id, field) {
    if (!translations) return '';
    const key = `${Number(id) || 0}:${String(field || '')}`;
    return translations[key] || '';
  }

  return {
    t,
    locale,
    isSpanish,
    setLocale,
    fetchTranslations,
    translatedFor
  };
}
