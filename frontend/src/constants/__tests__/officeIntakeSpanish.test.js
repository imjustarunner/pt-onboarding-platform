import { describe, expect, it } from 'vitest';
import { buildCounselingSelfEnSteps } from '../../../../backend/src/data/counselingIntakeSelfEn.js';
import { buildCounselingDependentEnSteps } from '../../../../backend/src/data/counselingIntakeDependentEn.js';
import { buildCounselingCoupleEnSteps } from '../../../../backend/src/data/counselingIntakeCoupleEn.js';
import { buildCounselingFamilyEnSteps } from '../../../../backend/src/data/counselingIntakeFamilyEn.js';
import { buildPhq9FieldsEs, buildGad7FieldsEs, buildPsc17FieldsEs, SPANISH_SCREEN_SOURCES } from '../../../../backend/src/data/validatedClinicalScreens.es.js';
import { OFFICE_SCREEN_FIELDS_ES, OFFICE_SCREEN_SOURCES_ES } from '../officeClinicalSpanish.js';
import { hasStructuredIntakeTranslation, lookupStructuredIntakeTranslation, txFmtStructuredIntake } from '../structuredIntakeStepSpanish.js';

describe('deterministic office Spanish copy', () => {
  it.each([
    ['self', buildCounselingSelfEnSteps], ['dependent', buildCounselingDependentEnSteps],
    ['couple', buildCounselingCoupleEnSteps], ['family', buildCounselingFamilyEnSteps]
  ])('covers every non-instrument %s schema display string without an API response', (_, build) => {
    const missing = new Set();
    const check = text => { if (text && !/^\d+$/.test(text) && !hasStructuredIntakeTranslation(text)) missing.add(text); };
    for (const step of build()) {
      for (const prop of ['label', 'helperText', 'whyWeAsk']) check(step[prop]);
      for (const field of step.fields || []) {
        if (field.instrument) continue;
        for (const prop of ['label', 'helperText', 'placeholder', 'section']) check(field[prop]);
        for (const option of field.options || []) check(option.label);
      }
    }
    expect([...missing]).toEqual([]);
  });
  it('uses authored copy before a failed or untranslated API fallback and keeps custom copy', () => {
    expect(lookupStructuredIntakeTranslation('What is the main reason you are looking for therapy?', {})).toBe('¿Cuál es el motivo principal por el que busca terapia?');
    expect(lookupStructuredIntakeTranslation('Required', { Required: 'Required' })).toBe('Obligatorio');
    expect(lookupStructuredIntakeTranslation('  SAVE & CONTINUE  ')).toBe('Guardar y continuar');
    expect(lookupStructuredIntakeTranslation('Tenant custom text', { 'Tenant custom text': 'Texto personalizado' })).toBe('Texto personalizado');
    expect(txFmtStructuredIntake('About {memberName}', { memberName: 'DEMO Example' }, {}, 'es')).toBe('Sobre DEMO Example');
    expect(txFmtStructuredIntake('About {memberName}', { memberName: 'DEMO Example' }, {}, 'en')).toBe('About DEMO Example');
  });
  it('preserves published Spanish PHQ-9, GAD-7, and PSC-17 wording, scoring values and source attribution', () => {
    expect(OFFICE_SCREEN_SOURCES_ES).toEqual(SPANISH_SCREEN_SOURCES);
    for (const field of [...buildPhq9FieldsEs(), ...buildGad7FieldsEs(), ...buildPsc17FieldsEs()]) {
      expect(OFFICE_SCREEN_FIELDS_ES[field.key]).toEqual({ label: field.label, helperText: field.helperText, options: field.options, instrument: field.instrument, instrumentLocale: field.instrumentLocale, instrumentSource: field.instrumentSource });
    }
  });
});


describe('final1110 communication and authorization wording', () => {
  it('translates both authorization recovery errors deterministically', () => {
    expect(lookupStructuredIntakeTranslation('Please agree to and sign the insurance and payment authorization before completing enrollment.')).toBe('Acepte y firme la autorización de seguro y pago antes de completar la inscripción.');
    expect(lookupStructuredIntakeTranslation('Please confirm coverage for every listed client.')).toBe('Confirme la cobertura de cada cliente indicado.');
  });
  it('translates office communication copy while preserving the agency name and STOP rules', () => {
    const email = 'QA Agency offers optional account emails about appointments, schedule changes, secure-message alerts, forms and signatures, enrollment follow-ups, billing and required insurance cards. Medicaid cards are not requested. Choose all optional account emails, scheduling only, or essential messages only. This choice does not include marketing, enroll another adult, or affect your care. Requested login, password recovery and essential security messages are separate.';
    const sms = 'QA Agency offers optional text messages for appointment reminders, schedule changes, cancellations and links to sign in or join a scheduled session. Choose Yes or No below. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Choosing No does not affect care or enrollment. This choice does not authorize marketing or enroll other contacts. Texts may appear on a shared phone or lock screen; use the secure app for private details.';
    expect(lookupStructuredIntakeTranslation(email)).toContain('QA Agency ofrece correos opcionales');
    expect(lookupStructuredIntakeTranslation(email)).not.toContain('sesiones escolares');
    expect(lookupStructuredIntakeTranslation(sms)).toContain('Responda STOP para cancelar');
    expect(lookupStructuredIntakeTranslation(sms)).not.toContain('servicios escolares');
    expect(lookupStructuredIntakeTranslation('By typing my name and continuing, I electronically sign these choices. If I request texts, I control the listed phone and am the recipient. I can decline texts and still receive services.')).toContain('soy la persona destinataria');
  });
});
