import { describe, expect, it } from 'vitest';
import {
  groupIntakeFieldsForAdaptiveShell,
  mapFieldToControl,
  practitionerBasicIntakeFields,
  documentsToConsentCards
} from '../adaptiveIntakeFieldAdapter.js';

describe('adaptiveIntakeFieldAdapter', () => {
  it('maps field types to UI controls', () => {
    expect(mapFieldToControl({ type: 'yes_no' })).toBe('choice');
    expect(mapFieldToControl({ type: 'textarea' })).toBe('textarea');
    expect(mapFieldToControl({ type: 'phone' })).toBe('phone');
  });

  it('groups intake fields into adaptive sections', () => {
    const groups = groupIntakeFieldsForAdaptiveShell([
      { key: 'guardian_email', label: 'Guardian email', type: 'email' },
      { key: 'child_name', label: 'Child name', type: 'text' },
      { key: 'referral_reason', label: 'Reason for referral', type: 'textarea' }
    ]);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.some((g) => g.id === 'guardian')).toBe(true);
    expect(groups.some((g) => g.id === 'client' || g.id === 'referral')).toBe(true);
  });

  it('builds practitioner basic frames', () => {
    const fields = practitionerBasicIntakeFields({ vertical: 'life_coach' });
    expect(fields.some((f) => f.key === 'support_goals')).toBe(true);
    expect(fields.some((f) => f.key === 'respondent_email')).toBe(true);
  });

  it('maps document templates to consent cards', () => {
    const cards = documentsToConsentCards([{ id: 9, name: 'HIPAA', description: 'Privacy' }]);
    expect(cards[0].id).toBe(9);
    expect(cards[0].title).toBe('HIPAA');
  });
});
