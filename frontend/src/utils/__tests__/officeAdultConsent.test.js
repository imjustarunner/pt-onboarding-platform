import { describe, expect, it } from 'vitest';
import { officeAdultConsentBlockMessage } from '../officeAdultConsent.js';

const parent = { firstName: 'Alex', lastName: 'Demo', dateOfBirth: '1990-01-01' };
const adult = { firstName: 'Jordan', lastName: 'Demo', dateOfBirth: '1991-01-01' };
const minor = { firstName: 'Casey', lastName: 'Demo', dateOfBirth: '2015-01-01' };
const check = args => officeAdultConsentBlockMessage({ asOf: '2026-11-02', ...args });

describe('separate consent for adult office participants', () => {
  it.each(['en', 'es'])('blocks a couple shared signature with a clear %s next step', locale => {
    const message = check({ serviceSubject: 'couple', participants: [parent, adult], primarySigner: parent, locale });
    expect(message).toContain(locale === 'es' ? 'Cada adulto' : 'Each adult');
    expect(message).toContain(locale === 'es' ? 'Guarde su progreso' : 'Save your progress');
  });
  it('does not claim the missing couple-signing capability exists for an incomplete roster', () => {
    expect(check({ serviceSubject: 'couple', participants: [] })).not.toBe('');
  });
  it('allows the existing family signing checks to handle verified minors and the primary signer', () => {
    expect(check({ serviceSubject: 'family', participants: [minor], primarySigner: parent })).toBe('');
    expect(check({ serviceSubject: 'family', participants: [parent, minor], primarySigner: parent })).toBe('');
  });
  it('blocks an additional adult or a person whose age or signer identity is unknown', () => {
    for (const participant of [adult, null, { ...adult, dateOfBirth: '' }, { ...adult, dateOfBirth: '2015-02-31' }]) {
      expect(check({ serviceSubject: 'family', participants: [parent, participant], primarySigner: parent })).not.toBe('');
    }
    expect(check({ serviceSubject: 'family', participants: [parent, minor] })).not.toBe('');
    const futureIdentity = { ...parent, dateOfBirth: '2030-01-01' };
    expect(check({ serviceSubject: 'family', participants: [futureIdentity], primarySigner: futureIdentity })).not.toBe('');
  });
  it('recognizes adulthood on the eighteenth birthday', () => {
    const participant = { ...adult, dateOfBirth: '2008-11-02' };
    expect(check({ serviceSubject: 'family', participants: [participant], primarySigner: parent })).not.toBe('');
    expect(officeAdultConsentBlockMessage({ serviceSubject: 'family', participants: [participant], primarySigner: parent, asOf: '2026-11-01' })).toBe('');
  });
  it('does not authorize a second adult merely because their identifying details match the signer', () => {
    expect(check({ serviceSubject: 'family', participants: [parent, { ...parent }], primarySigner: parent })).not.toBe('');
  });
  it.each(['dependent', 'self', 'school', ''])('does not change existing %s enrollment signing rules', serviceSubject => {
    expect(check({ serviceSubject, participants: [parent, adult] })).toBe('');
  });
});
