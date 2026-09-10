import { describe, it, expect } from 'vitest';
import {
  pickRecipientEmail,
  resolveLoginEmail
} from '../passwordRecovery.service.js';

describe('passwordRecovery login + recipient', () => {
  const groupHire = {
    email: 'jane.doe@itsco.health',
    username: 'jane.doe@itsco.health',
    work_email: 'jane.doe@itsco.health',
    personal_email: 'jane.personal@gmail.com',
    login_is_group_email: 1,
    sso_password_override: 1
  };

  it('resolves login email as work/group alias', () => {
    expect(resolveLoginEmail(groupHire)).toBe('jane.doe@itsco.health');
  });

  it('sends recovery to personal when work email is typed', () => {
    expect(pickRecipientEmail(groupHire, 'jane.doe@itsco.health')).toBe('jane.personal@gmail.com');
  });

  it('sends recovery to personal when personal email is typed', () => {
    expect(pickRecipientEmail(groupHire, 'jane.personal@gmail.com')).toBe('jane.personal@gmail.com');
  });

  it('falls back to login email when no personal recovery is on file', () => {
    const noPersonal = { ...groupHire, personal_email: null };
    expect(pickRecipientEmail(noPersonal, 'jane.doe@itsco.health')).toBe('jane.doe@itsco.health');
  });

  it('prefers personal recovery for applicants with work + personal', () => {
    const applicant = {
      email: 'a@personal.com',
      personal_email: 'a@personal.com',
      work_email: 'a@itsco.health',
      login_is_group_email: 0
    };
    expect(resolveLoginEmail(applicant)).toBe('a@itsco.health');
    expect(pickRecipientEmail(applicant, 'a@itsco.health')).toBe('a@personal.com');
    expect(pickRecipientEmail(applicant, 'a@personal.com')).toBe('a@personal.com');
  });
});
