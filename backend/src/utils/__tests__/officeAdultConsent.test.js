import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMultiChildSigning } from '../multiChildIntake.js';

const parent = { firstName: 'Alex', lastName: 'Demo', dateOfBirth: '1990-01-01' };
const adult = { firstName: 'Jordan', lastName: 'Demo', dateOfBirth: '1991-01-01' };
const minor = { firstName: 'Casey', lastName: 'Demo', dateOfBirth: '2015-01-01' };
function packet(serviceSubject, clients = [parent, adult], formLocale = 'en') {
  return {
    formLocale, clients, guardian: parent,
    responses: { submission: { serviceSubject }, clients: clients.map(() => ({})) },
    multiClientSignatureConsent: { accepted: true, acceptedAt: '2026-11-02T18:00:00Z', clientCount: clients.length },
    // Arbitrary supplied signatures are not a supported independently signed flow.
    adultSignatures: clients.map(person => ({ name: person.firstName, signatureData: 'claimed-signature' }))
  };
}

test('couple packets cannot finalize using the guardian shared-signature consent', () => {
  assert.match(validateMultiChildSigning({ intakeData: packet('couple') }), /Each adult must provide their own consent/);
  assert.match(validateMultiChildSigning({ intakeData: packet('couple', [parent, adult], 'es') }), /Cada adulto debe dar su propio consentimiento/);
});
test('family packets block additional adults but retain existing checks for primary plus minors', () => {
  assert.ok(validateMultiChildSigning({ intakeData: packet('family') }));
  assert.equal(validateMultiChildSigning({ intakeData: packet('family', [parent, minor]) }), null);
  const missingConsent = packet('family', [parent, minor]);
  delete missingConsent.multiClientSignatureConsent;
  assert.ok(validateMultiChildSigning({ intakeData: missingConsent }));
});
test('family primary identity can be read from its saved answers without treating another adult as the signer', () => {
  const data = packet('family', [parent, minor]);
  delete data.guardian;
  data.responses.guardian = { pc_legal_first: 'Alex', pc_legal_last: 'Demo', pc_date_of_birth: '1990-01-01' };
  assert.equal(validateMultiChildSigning({ intakeData: data }), null);
  data.responses.guardian.pc_date_of_birth = '1991-01-01';
  assert.ok(validateMultiChildSigning({ intakeData: data }));
});
test('flat stored intake data also enforces the scoped adult consent block', () => {
  const data = packet('family');
  data.submission = data.responses.submission;
  delete data.responses;
  assert.ok(validateMultiChildSigning({ intakeData: data }));
});
test('dependent and legacy school shared signing behavior is unchanged', () => {
  assert.equal(validateMultiChildSigning({ intakeData: packet('dependent') }), null);
  const school = packet(undefined);
  assert.equal(validateMultiChildSigning({ intakeData: school }), null);
});
