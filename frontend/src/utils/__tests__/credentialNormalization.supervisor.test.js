import { describe, expect, it } from 'vitest';
import {
  isClinicalOrBillingSupervisorCredentialText,
  isFullyLicensedCredentialText,
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

describe('isFullyLicensedCredentialText Colorado DORA prefixes', () => {
  it.each(['LPC.002383', 'CSW.09931054', 'MFT.0002328', 'CSW'])(
    'treats %s as fully licensed',
    (cred) => {
      expect(isFullyLicensedCredentialText(cred)).toBe(true);
    }
  );

  it.each(['LPCC', 'MFTC', 'SWC', 'LSW'])(
    'still excludes prelicensed %s',
    (cred) => {
      expect(isFullyLicensedCredentialText(cred)).toBe(false);
    }
  );
});

describe('supervisorCredentialText', () => {
  it('prefers credential then provider_credential', () => {
    expect(supervisorCredentialText({ credential: 'LPC', provider_credential: 'LCSW' })).toBe('LPC');
    expect(supervisorCredentialText({ provider_credential: 'LMFT' })).toBe('LMFT');
  });
});
