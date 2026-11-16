import { expect, it } from 'vitest';
import { parseDemographicsPaste, demographicsToClientPatch, applyGuardianContactOwnership } from '../demographicsImport.service.js';

it('retains the parent contact source without attaching their channels or preferences to the client', () => {
  const parsed = parseDemographicsPaste('Patient Information\nsvgEdit\nLegal Name\nSynthetic Client\nDate of Birth\n11/19/2012Age: 13y\nMobile Phone\n(555) 111-2222\nEmail\n[parent@example.test](mailto:parent@example.test)\nAppt Reminders\nNo reminders');
  const patch = demographicsToClientPatch(parsed);
  applyGuardianContactOwnership(parsed, patch, { contact_phone:'+1 555 111 2222', email:'PARENT@example.test' });
  expect(patch).toMatchObject({ full_name:'Synthetic Client', date_of_birth:'2012-11-19', contact_phone:null, email:null });
  expect(patch).not.toHaveProperty('session_sms_opt_in');expect(patch).not.toHaveProperty('appointment_reminder_type');
  expect(parsed).toMatchObject({ contactOwner:'guardian', contactPhone:null, email:null, sourceContact:{ email:'parent@example.test', contactPhone:'(555) 111-2222' } });
});
it('preserves existing client-owned channels that differ from the imported parent', () => {
  const parsed = { fullName:'Synthetic Client', contactPhone:'555-111-2222', email:'parent@example.test', textMessagesOk:true };
  const patch = demographicsToClientPatch(parsed);
  applyGuardianContactOwnership(parsed, patch, { contact_phone:'555-999-8888', email:'client@example.test' });
  expect(patch).toEqual({ full_name:'Synthetic Client' });
});
