import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSmartSchoolRoi,
  roiAcknowledgedHipaa,
  schoolRoiRecordSections,
  buildSchoolRoiAnswersText,
  buildSchoolRoiClinicalText,
  enrichIntakeDataWithSignedRoi
} from '../schoolRoiChartText.service.js';

const roiPayload = {
  smartSchoolRoi: {
    clientFullName: 'ChaMar',
    clientDateOfBirth: '2013-12-27',
    signatureData: 'data:image/png;base64,aaa',
    signer: { firstName: 'Carla', lastName: 'Archuleta', relationship: 'Mother' },
    requiredAcknowledgements: {
      esign_consent: true,
      hipaa_privacy: true
    },
    waiverItems: {
      hipaa_serious_imminent_threat_disclosure: 'accept'
    },
    staffDecisions: [
      { fullName: 'Kelly Gallegos', email: 'kelly@school.org', allowed: true, decision: 'roi_docs' }
    ]
  }
};

test('extracts ROI and HIPAA acknowledgement from school packet payload', () => {
  const roi = extractSmartSchoolRoi(roiPayload);
  assert.equal(roi.clientFullName, 'ChaMar');
  assert.equal(roiAcknowledgedHipaa(roi), true);
});

test('school ROI record sections include staff, notices, and question bodies', () => {
  const sections = schoolRoiRecordSections(roiPayload);
  const titles = sections.map((s) => s.title);
  assert.ok(titles.includes('School Release of Information'));
  assert.ok(titles.includes('Required notices'));
  assert.ok(titles.includes('School staff decisions'));
  const notices = sections.find((s) => s.title === 'Required notices');
  assert.ok(String(notices?.rows?.[0]?.value || '').includes('Acknowledged —'));
});

test('intake answers text includes guardian-equivalent ROI fields', () => {
  const text = buildSchoolRoiAnswersText(roiPayload);
  assert.match(text, /ChaMar/);
  assert.match(text, /Kelly Gallegos/);
  assert.match(text, /HIPAA/i);
});

test('clinical fallback explains school ROI instead of empty questionnaire', () => {
  const text = buildSchoolRoiClinicalText(roiPayload);
  assert.match(text, /school Release of Information/i);
  assert.match(text, /HIPAA privacy notice: acknowledged/);
  assert.doesNotMatch(text, /No clinical responses captured/);
});

test('enrichIntakeDataWithSignedRoi prefers named staff from the signed trail', () => {
  const enriched = enrichIntakeDataWithSignedRoi(
    { smartSchoolRoi: { staffDecisions: [{ schoolStaffUserId: 1 }] } },
    [{ audit_trail: { roiResponse: { staffDecisions: [{ fullName: 'Kelly Gallegos', allowed: true, decision: 'roi_docs' }] } } }]
  );
  assert.equal(enriched.smartSchoolRoi.staffDecisions[0].fullName, 'Kelly Gallegos');
});
