import { inject, ref, unref } from 'vue';
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
  const intakeLocale = inject('intakeLocale', ref('en'));

  const tx = (text) => {
    const s = String(text || '');
    if (unref(intakeLocale) !== 'es') return s;
    return lookupStructuredIntakeTranslation(s, unref(intakeStringTranslations) || {});
  };

  const txFmt = (template, vars = {}) =>
    txFmtStructuredIntake(template, vars, unref(intakeStringTranslations) || {}, unref(intakeLocale));

  return { tx, txFmt, intakeLocale };
}
