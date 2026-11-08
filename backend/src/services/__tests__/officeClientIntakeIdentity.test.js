import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWhoFor, intakeTypeLabel } from '../officeClientManagement.service.js';
for (const [subject, label] of [['dependent', 'Dependent'], ['self', 'Adult / Self'], ['representative', 'Adult represented'], ['', 'Not recorded']]) {
  test(`office list preserves recorded subject: ${subject || 'unknown'}`, () => {
    const who = mapWhoFor({}, { serviceSubject: subject });
    assert.equal(who, subject);
    assert.equal(intakeTypeLabel(who), label);
  });
}
