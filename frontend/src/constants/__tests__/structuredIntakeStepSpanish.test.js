import { describe, it, expect } from 'vitest';
import { lookupStructuredIntakeTranslation } from '../structuredIntakeStepSpanish.js';

describe('lookupStructuredIntakeTranslation', () => {
  it('translates school packet chrome without a live-translate map', () => {
    expect(lookupStructuredIntakeTranslation('ESIGN Act Disclosure'))
      .toBe('Divulgación de la Ley ESIGN');
    expect(lookupStructuredIntakeTranslation('About You')).toBe('Sobre usted');
    expect(lookupStructuredIntakeTranslation('Communication preferences'))
      .toBe('Preferencias de comunicación');
  });

  it('translates identity verification insurance step copy', () => {
    expect(lookupStructuredIntakeTranslation('Identity verification'))
      .toBe('Verificación de identidad');
    expect(lookupStructuredIntakeTranslation('Thank you for your submission.'))
      .toBe('Gracias por su envío.');
    expect(lookupStructuredIntakeTranslation('Skip identity verification for now'))
      .toBe('Omitir la verificación de identidad por ahora');
  });
});
