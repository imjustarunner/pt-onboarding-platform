import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import {
  documentStepLooksLikeReplacedPacketDoc,
  livePacketCoverage,
  sanitizeSchoolMasterSteps,
  shouldKeepLegacyPacketDocument
} from '../AgencySchoolIntakeMaster.model.js';

describe('documentStepLooksLikeReplacedPacketDoc', () => {
  it('recognizes the retired Informed Consent (School) PDF', () => {
    assert.equal(documentStepLooksLikeReplacedPacketDoc('Informed Consent (School)'), 'informed');
    assert.equal(documentStepLooksLikeReplacedPacketDoc('Informed Consent - Espanol'), 'informed');
  });

  it('recognizes policy, HIPAA, and disclosure titles', () => {
    assert.equal(documentStepLooksLikeReplacedPacketDoc('Policy and Services (School)'), 'policy');
    assert.equal(documentStepLooksLikeReplacedPacketDoc('HIPAA Privacy Policy and Notice of Privacy Practices'), 'hipaa');
    assert.equal(documentStepLooksLikeReplacedPacketDoc('Disclosure Agreement'), 'disclosure');
  });
});

describe('sanitizeSchoolMasterSteps', () => {
  it('drops retired school PDFs and keeps live packet steps', () => {
    const out = sanitizeSchoolMasterSteps(
      [
        { type: 'questions' },
        { type: 'document', templateId: 40, title: 'Informed Consent (School)' },
        { type: 'document', templateId: 51, title: 'Policy and Services (School)' },
        { type: 'document', templateId: 70, title: 'HIPAA Privacy Policy and Notice of Privacy Practices' },
        { type: 'document', templateId: 38, title: 'Disclosure Agreement' }
      ],
      null,
      'en'
    );
    const types = out.map((s) => s.type);
    assert.equal(types.includes('document'), false);
    assert.equal(types.includes('packet_informed_group_consent'), true);
    assert.equal(types.includes('packet_policy_services'), true);
    assert.equal(types.includes('packet_hipaa_notice'), true);
    assert.equal(types.includes('smart_disclosure'), true);
  });
});

describe('shouldKeepLegacyPacketDocument', () => {
  const informedTitle = 'Informed Consent (School)';
  const storedMcAuliffeLink = {
    intake_steps: [
      { type: 'questions' },
      { type: 'school_roi' },
      { type: 'document', templateId: 40, title: informedTitle }
    ]
  };

  it('still requires the old PDF when the live packet was never signed', () => {
    assert.equal(
      shouldKeepLegacyPacketDocument({ title: informedTitle, link: storedMcAuliffeLink, intakeData: {} }),
      true
    );
  });

  it('does not require Informed Consent (School) after the live packet section is signed', () => {
    assert.equal(
      shouldKeepLegacyPacketDocument({
        title: informedTitle,
        link: storedMcAuliffeLink,
        intakeData: {
          packetSections: {
            informed_group_consent: { signatureData: 'data:image/png;base64,xx' }
          }
        }
      }),
      false
    );
  });

  it('does not require the old PDF when the overlaid master has packet_informed_group_consent', () => {
    assert.equal(
      shouldKeepLegacyPacketDocument({
        title: informedTitle,
        link: {
          intake_steps: [
            { type: 'packet_informed_group_consent' },
            { type: 'communications' }
          ]
        },
        intakeData: {}
      }),
      false
    );
    assert.equal(
      livePacketCoverage({
        intake_steps: [{ type: 'packet_informed_group_consent' }]
      }).informed,
      true
    );
  });
});

after(async () => {
  await pool.end();
});
