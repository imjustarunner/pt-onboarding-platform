import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyKioskClientWaiverFields,
  extractProfileSectionsFromIntakeData,
  formatKioskClientDisplayName,
  mergeGuardiansIntoKioskPickups,
  mergeWaiverSectionsIntoKioskClient,
  normalizeIntakeDataShape,
  readActiveSectionPayload,
  clientCheckoutBlocked,
  buildSectionsFromWaiverHistoryRows
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

test('mergeWaiverSectionsIntoKioskClient fillMissingOnly keeps profile emergency data and adds intake contacts', () => {
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
  assert.equal(entry.emergencyContacts.length, 2);
  assert.ok(entry.emergencyContacts.some((c) => c.name === 'Profile Contact'));
  assert.ok(entry.emergencyContacts.some((c) => c.name === 'Intake Contact'));
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

test('formatKioskClientDisplayName uses first name and last initial', () => {
  assert.equal(formatKioskClientDisplayName('Azula Oco'), 'Azula O.');
});

test('mergeGuardiansIntoKioskPickups adds linked guardians as pickup options', () => {
  const entry = { ...emptyKioskClientWaiverFields() };
  mergeGuardiansIntoKioskPickups(entry, [{ userId: 9, name: 'Jane Parent', phone: '5551234567' }]);
  assert.equal(entry.authorizedPickups.length, 1);
  assert.equal(entry.authorizedPickups[0].source, 'guardian');
  assert.equal(entry.authorizedPickups[0].name, 'Jane Parent');
});

test('walk home authorized wins over later declined profile merge', () => {
  const entry = { ...emptyKioskClientWaiverFields() };
  mergeWaiverSectionsIntoKioskClient(entry, {
    walk_home_authorization: {
      status: 'active',
      payload: { allowedToWalkHome: true, allowedWindow: 'After 3pm' }
    }
  }, null);
  mergeWaiverSectionsIntoKioskClient(entry, {
    walk_home_authorization: {
      status: 'active',
      payload: { allowedToWalkHome: false }
    }
  }, null);
  assert.equal(entry.walkHome.allowedToWalkHome, true);
});

test('clientCheckoutBlocked when no pickups and no walk-home authorization', () => {
  const entry = { ...emptyKioskClientWaiverFields() };
  assert.equal(clientCheckoutBlocked(entry), true);
  entry.walkHome = { allowedToWalkHome: true };
  assert.equal(clientCheckoutBlocked(entry), false);
});

test('mergeWaiverSectionsIntoKioskClient unions pickups when fillMissingOnly and profile already has one', () => {
  const entry = {
    ...emptyKioskClientWaiverFields(),
    authorizedPickups: [{ _k: 'a', name: 'Jane Parent', phone: '5551112222', source: 'guardian' }]
  };
  mergeWaiverSectionsIntoKioskClient(entry, {
    pickup_authorization: {
      status: 'active',
      payload: {
        authorizedPickups: [
          { name: 'Grandma Sue', relationship: 'Grandmother', phone: '5553334444' },
          { name: 'Uncle Bob', relationship: 'Uncle', phone: '5555556666' }
        ]
      }
    }
  }, null, { fillMissingOnly: true });
  assert.equal(entry.authorizedPickups.length, 3);
  assert.ok(entry.authorizedPickups.some((p) => p.name === 'Grandma Sue'));
  assert.ok(entry.authorizedPickups.some((p) => p.name === 'Uncle Bob'));
});

test('mergeWaiverSectionsIntoKioskClient unions emergency contacts when fillMissingOnly', () => {
  const entry = {
    ...emptyKioskClientWaiverFields(),
    emergencyContacts: [{ _k: 'a', name: 'Existing Contact', phone: '5551112222' }]
  };
  mergeWaiverSectionsIntoKioskClient(entry, {
    emergency_contacts: {
      status: 'active',
      payload: {
        contacts: [{ name: 'Registration Contact', phone: '5559998888', relationship: 'Aunt' }]
      }
    }
  }, null, { fillMissingOnly: true });
  assert.equal(entry.emergencyContacts.length, 2);
  assert.ok(entry.emergencyContacts.some((c) => c.name === 'Registration Contact'));
});

test('mergeWaiverSectionsIntoKioskClient merges approved snacks when fillMissingOnly and profile has allergies only', () => {
  const entry = {
    ...emptyKioskClientWaiverFields(),
    allergies: {
      allergies: 'Peanuts',
      approvedSnacks: '',
      approvedSnacksList: [],
      noSnacks: false,
      notes: '',
      applyNone: false
    }
  };
  mergeWaiverSectionsIntoKioskClient(entry, {
    allergies_snacks: {
      status: 'active',
      payload: {
        allergies: 'Peanuts',
        approvedSnacksList: ['Fruit', 'Crackers'],
        approvedSnacks: ''
      }
    }
  }, null, { fillMissingOnly: true });
  assert.equal(entry.allergies.allergies, 'Peanuts');
  assert.deepEqual(entry.allergies.approvedSnacksList, ['Fruit', 'Crackers']);
});

test('extractProfileSectionsFromIntakeData accepts legacy flat section rows', () => {
  const sections = extractProfileSectionsFromIntakeData({
    responses: {
      submission: {
        guardianWaiverIntake: {
          clients: [{
            sections: {
              emergency_contacts: {
                contacts: [{ name: 'Flat Contact', phone: '5551234567', relationship: 'Neighbor' }]
              }
            }
          }]
        }
      }
    }
  }, 999);
  assert.ok(sections?.emergency_contacts?.payload?.contacts?.[0]?.name, 'Flat Contact');
});

test('extractProfileSectionsFromIntakeData reads flat submission guardian waiver intake', () => {
  const intakeData = {
    clients: [{ firstName: 'Marcus', lastName: 'V' }],
    submission: {
      guardianWaiverIntake: {
        clients: [{
          sections: {
            allergies_snacks: {
              payload: {
                allergies: 'none',
                approvedSnacks: 'just no dairy snacks, I will also pack him snacks (:',
                notes: 'none'
              },
              signatureData: 'data:image/png;base64,' + 'x'.repeat(80)
            },
            emergency_contacts: {
              payload: {
                contacts: [{ name: 'Kaitlin', relationship: 'mom', phone: '9739053624' }]
              },
              signatureData: 'data:image/png;base64,' + 'y'.repeat(80)
            }
          }
        }]
      }
    }
  };
  const sections = extractProfileSectionsFromIntakeData(intakeData, 303152);
  assert.equal(
    sections.allergies_snacks.payload.approvedSnacks,
    'just no dairy snacks, I will also pack him snacks (:'
  );
  assert.equal(sections.emergency_contacts.payload.contacts[0].name, 'Kaitlin');
});

test('extractProfileSectionsFromIntakeData uses submission client order for multi-child intakes', () => {
  const intakeData = {
    clients: [{ firstName: 'Older' }, { firstName: 'Marcus', lastName: 'V' }],
    submission: {
      guardianWaiverIntake: {
        clients: [
          {
            sections: {
              allergies_snacks: {
                payload: { approvedSnacks: 'Older child snacks' }
              }
            }
          },
          {
            sections: {
              allergies_snacks: {
                payload: { approvedSnacks: 'just no dairy snacks' }
              }
            }
          }
        ]
      }
    }
  };
  const younger = extractProfileSectionsFromIntakeData(intakeData, 303152, { preferredIndex: 1 });
  assert.equal(younger.allergies_snacks.payload.approvedSnacks, 'just no dairy snacks');
});

test('normalizeIntakeDataShape nests flat submission guardian waiver bundle', () => {
  const normalized = normalizeIntakeDataShape({
    submission: { guardianWaiverIntake: { clients: [{ sections: {} }] } }
  });
  assert.ok(normalized.responses.submission.guardianWaiverIntake);
});

test('mergeWaiverSectionsIntoKioskClient applies intake allergies after normalize shape', () => {
  const entry = { ...emptyKioskClientWaiverFields() };
  const sections = extractProfileSectionsFromIntakeData({
    submission: {
      guardianWaiverIntake: {
        clients: [{
          sections: {
            allergies_snacks: {
              payload: {
                allergies: 'none',
                approvedSnacks: 'fruit and crackers only'
              }
            }
          }
        }]
      }
    }
  }, 999);
  mergeWaiverSectionsIntoKioskClient(entry, sections, null, { fillMissingOnly: true });
  assert.equal(entry.allergies.approvedSnacks, 'fruit and crackers only');
});

test('buildSectionsFromWaiverHistoryRows keeps latest payload per section key', () => {
  const sections = buildSectionsFromWaiverHistoryRows([
    { section_key: 'pickup_authorization', payload_json: { authorizedPickups: [{ name: 'Old Pickup' }] } },
    { section_key: 'pickup_authorization', payload_json: { authorizedPickups: [{ name: 'New Pickup' }] } }
  ]);
  assert.equal(sections.pickup_authorization.payload.authorizedPickups[0].name, 'Old Pickup');
});
