import { describe, expect, it } from 'vitest';
import {
  isClinicalOrBillingSupervisorCredentialText,
  supervisorCredentialText
} from '../credentialNormalization.js';

describe('isClinicalOrBillingSupervisorCredentialText', () => {
  it.each(['LPC', 'LCSW', 'LMFT', 'LAC', 'PsyD', 'PhD', 'Ph.D.', 'Licensed Psychologist'])(
    'allows %s',
    (cred) => {
      expect(isClinicalOrBillingSupervisorCredentialText(cred)).toBe(true);
    }
  );

  it.each(['LPCC', 'MFTC', 'SWC', 'LSW', 'Bachelors', 'Bachelor of Arts', 'Pre-licensed', ''])(
    'rejects %s',
    (cred) => {
      expect(isClinicalOrBillingSupervisorCredentialText(cred)).toBe(false);
    }
  );
});

describe('supervisorCredentialText', () => {
  it('prefers credential then provider_credential', () => {
    expect(supervisorCredentialText({ credential: 'LPC', provider_credential: 'LCSW' })).toBe('LPC');
    expect(supervisorCredentialText({ provider_credential: 'LMFT' })).toBe('LMFT');
  });
});
