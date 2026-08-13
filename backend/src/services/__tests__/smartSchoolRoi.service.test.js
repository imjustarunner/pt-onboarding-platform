import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import {
  buildSmartSchoolRoiHtml,
  normalizeSmartSchoolRoiResponse,
  validateSmartSchoolRoiResponse
} from '../smartSchoolRoi.service.js';

const roiContext = {
  client: {
    id: 42,
    fullName: 'Test Client',
    dateOfBirth: '2015-01-02',
    initials: 'TC'
  },
  requiredAcknowledgements: [
    { id: 'esign_consent', title: 'Electronic consent', body: 'Accept electronic signature.' }
  ],
  waiverItems: [
    { id: 'communication_and_care_planning', title: 'Care planning', body: 'Authorize communication.' }
  ],
  staffRoster: [
    { schoolStaffUserId: 7, fullName: 'Staff One', email: 'staff1@example.com' },
    { schoolStaffUserId: 8, fullName: 'Staff Two', email: 'staff2@example.com' }
  ]
};

after(async () => {
  try {
    await pool.end();
  } catch {
    // ignore test cleanup errors
  }
});

test('normalizeSmartSchoolRoiResponse builds structured ROI decisions', () => {
  const response = normalizeSmartSchoolRoiResponse({
    roiContext,
    intakeData: {
      smartSchoolRoi: {
        signer: {
          firstName: 'Jamie',
          lastName: 'Parent',
          relationship: 'Mother',
          email: 'jamie@example.com',
          phone: '555-123-4567'
        },
        staffDecisions: [
          { schoolStaffUserId: 7, decision: 'roi_docs' },
          { schoolStaffUserId: 8, decision: 'none' }
        ],
        thirdPartyRecipients: [
          { name: 'Minerva McGonagall', relationship: 'Head of House', decision: 'roi' }
        ]
      }
    },
    signedAt: new Date('2026-03-06T12:00:00.000Z')
  });

  assert.equal(response.clientFullName, 'Test Client');
  assert.equal(response.clientDateOfBirth, '2015-01-02');
  assert.equal(response.signer.fullName, 'Jamie Parent');
  assert.equal(response.packetReleaseAllowed, true);
  assert.deepEqual(
    response.staffDecisions.map((item) => ({ id: item.schoolStaffUserId, decision: item.decision })),
    [
      { id: 7, decision: 'roi_docs' },
      { id: 8, decision: 'none' }
    ]
  );
  assert.equal(response.thirdPartyRecipients[0].name, 'Minerva McGonagall');
  assert.equal(response.thirdPartyRecipients[0].decision, 'roi');
  assert.equal(response.thirdPartyRecipients[0].packetAllowed, false);
  const html = buildSmartSchoolRoiHtml({ roiContext, response, signedAt: new Date('2026-03-06T12:00:00.000Z') });
  assert.match(html, /Minerva McGonagall/);
  assert.match(html, /ROI \(Speak\)/);
  assert.match(html, /school-based care coordination/);
  assert.match(html, /treatment goals/);
});

test('validateSmartSchoolRoiResponse rejects missing required acknowledgements', () => {
  const response = normalizeSmartSchoolRoiResponse({
    roiContext,
    intakeData: {
      smartSchoolRoi: {
        signer: {
          firstName: 'Jamie',
          lastName: 'Parent',
          relationship: 'Mother',
          email: 'jamie@example.com'
        },
        staffDecisions: [
          { schoolStaffUserId: 7, decision: 'roi' },
          { schoolStaffUserId: 8, decision: 'roi_docs' }
        ]
      }
    }
  });

  const validation = validateSmartSchoolRoiResponse(response);

  assert.equal(validation.valid, false);
  assert.match(validation.missing.join(' | '), /Required acknowledgement/);
});
