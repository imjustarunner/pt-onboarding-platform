import { expect, it } from 'vitest';
import { preferredIdentityKeysForOutboundSend, identityKeyMatchesPreferred } from '../../constants/automatedEmailCatalog.js';

it.each(['session_reminder', 'session_confirmation', 'auricwell_session_reminder', 'school_session_notice'])
('recognizes the deliberate AuricWell appointment sender for %s instead of flagging a fallback', templateType => {
  expect(preferredIdentityKeysForOutboundSend({ templateType })[0]).toBe('clinical_appointment_reminders');
  expect(identityKeyMatchesPreferred({ identity_key: 'clinical_appointment_reminders' }, templateType)).toBe(true);
  expect(identityKeyMatchesPreferred({ identity_key: 'clinical_enrollment_portal' }, templateType)).toBe(false);
  expect(identityKeyMatchesPreferred({ identity_key: 'notifications' }, templateType)).toBe(true);
});
