import { inject, ref, unref } from 'vue';
import {useFamilyLocale} from './useFamilyLocale';
import {
  lookupStructuredIntakeTranslation,
  txFmtStructuredIntake
} from '../constants/structuredIntakeStepSpanish.js';

/**
 * Shared translation helper for structured intake steps (insurance, waivers, communications).
 * Uses curated Spanish first, then API batch map from PublicIntakeSigningView.
 */
export function useIntakeStepTx() {
  const intakeStringTranslations = inject('intakeStringTranslations', ref({}));
  const family=useFamilyLocale();
  const intakeLocale = inject('intakeLocale', family.locale);

  const tx = (text) => {
    const s = String(text || '');
    if (unref(intakeLocale) !== 'es') return s;
    const translated=lookupStructuredIntakeTranslation(s, unref(intakeStringTranslations) || {});
    return translated===s?family.ft(s):translated;
  };

  const txFmt = (template, vars = {}) =>
    txFmtStructuredIntake(template, vars, unref(intakeStringTranslations) || {}, unref(intakeLocale));

  return { tx, txFmt, intakeLocale };
}
