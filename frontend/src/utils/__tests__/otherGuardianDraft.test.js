import { expect, it } from 'vitest';
import { snapshotOtherGuardian, restoreOtherGuardian } from '../otherGuardianDraft.js';
it('restores shared custody and the separate invite contact across a reload without serializing files', () => {
  const otherGuardian = snapshotOtherGuardian({ hasLegalRights: 'yes', firstName: 'Devon', email: 'synthetic@example.test', courtDocumentsUploaded: true, courtFiles: [{ privateFile: true }] });
  expect(restoreOtherGuardian(JSON.parse(JSON.stringify({ otherGuardian })))).toMatchObject({ hasLegalRights: 'yes', firstName: 'Devon', email: 'synthetic@example.test', courtDocumentsUploaded: true });
  expect(otherGuardian.courtFiles).toBeUndefined();
});
it('recovers older snapshots from their saved guardian answers', () => {
  expect(restoreOtherGuardian({ guardian: {}, intakeResponses: { guardian: { other_guardian_has_legal_rights: 'shared', other_guardian_email: 'synthetic@example.test' } } })).toMatchObject({ hasLegalRights: 'shared', email: 'synthetic@example.test' });
});
it('preserves an explicit No rather than reviving stale Yes contact details', () => {
  expect(restoreOtherGuardian({ otherGuardian: { hasLegalRights: 'no' } }, { other_guardian_has_legal_rights: 'yes', other_guardian_email: 'old@example.test' })).toMatchObject({ hasLegalRights: 'no', email: '' });
});
