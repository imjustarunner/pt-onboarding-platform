import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyKioskClientWaiverFields,
  extractProfileSectionsFromIntakeData,
  mergeWaiverSectionsIntoKioskClient,
  readActiveSectionPayload
} from '../kioskWaiverDisplay.util.js';

test('readActiveSectionPayload reads nested payload without status', () => {
  const payload = readActiveSectionPayload({
    emergency_contacts: {
      payload: { contacts: [{ name: 'Jane', phone: '555-0100' }] }
    }
  }, 'emergency_contacts');
  assert.equal(payload.contacts[0].name, 'Jane');
});

test('readActiveSectionPayload reads legacy flat section rows', () => {
  const payload = readActiveSectionPayload({
    emergency_contacts: {
      status: 'active',
      contacts: [{ name: 'Bob', phone: '555-0200' }]
    }
  }, 'emergency_contacts');
  assert.equal(payload.contacts[0].name, 'Bob');
});

test('readActiveSectionPayload ignores revoked sections', () => {
  const payload = readActiveSectionPayload({
    emergency_contacts: {
      status: 'revoked',
      payload: { contacts: [{ name: 'Hidden' }] }
    }
  }, 'emergency_contacts');
  assert.equal(payload, null);
});

test('mergeWaiverSectionsIntoKioskClient fillMissingOnly keeps existing profile data', () => {
  const entry = {
    ...emptyKioskClientWaiverFields(),
    emergencyContacts: [{ _k: 'a', name: 'Profile Contact', phone: '111' }]
  };
  mergeWaiverSectionsIntoKioskClient(entry, {
    emergency_contacts: {
      status: 'active',
      payload: { contacts: [{ name: 'Intake Contact', phone: '222' }] }
    }
  }, null, { fillMissingOnly: true });
  assert.equal(entry.emergencyContacts.length, 1);
  assert.equal(entry.emergencyContacts[0].name, 'Profile Contact');
});

test('extractProfileSectionsFromIntakeData maps guardian waiver intake bundle', () => {
  const intakeData = {
    clients: [{ id: 612243 }],
    responses: {
      submission: {
        guardianWaiverIntake: {
          clients: [{
            sections: {
              emergency_contacts: {
                payload: { contacts: [{ name: 'Katie Testname', phone: '8145988785' }] }
              },
              allergies_snacks: {
                payload: { allergies: 'Peanuts', notes: 'EpiPen on file' }
              }
            }
          }]
        }
      }
    }
  };
  const sections = extractProfileSectionsFromIntakeData(intakeData, 612243);
  assert.ok(sections.emergency_contacts.payload.contacts[0].name, 'Katie Testname');
  assert.equal(sections.allergies_snacks.payload.allergies, 'Peanuts');
});
