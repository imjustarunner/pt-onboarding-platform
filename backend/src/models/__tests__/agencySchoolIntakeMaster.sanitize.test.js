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
  it('preserves agency documents instead of replacing them by title', () => {
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
    assert.equal(types.filter(t=>t==='document').length, 4);
    assert.equal(out[1].preserveAgencyDocument, true);
    assert.equal(types.includes('packet_informed_group_consent'), false);
    assert.equal(types.includes('packet_policy_services'), false);
    assert.equal(types.includes('packet_hipaa_notice'), false);
    assert.equal(types.includes('smart_disclosure'), false);
  });
});

it('leaves the existing programmed packet intact and fills only missing categories', () => {
  const live = [{type:'packet_informed_group_consent'}, {type:'packet_policy_services'}, {type:'packet_hipaa_notice'}, {type:'smart_disclosure'}];
  assert.deepEqual(sanitizeSchoolMasterSteps(live), live);
  const withCustom = sanitizeSchoolMasterSteps([{type:'document',templateId:9}], new Map([[9,'Notice of Privacy Practices']]));
  assert.equal(withCustom.some(s=>s.type==='packet_hipaa_notice'),false);
  assert.equal(withCustom.some(s=>s.type==='smart_disclosure'),true);
  assert.deepEqual(sanitizeSchoolMasterSteps(withCustom,new Map([[9,'Notice of Privacy Practices']])),withCustom);
});

describe('shouldKeepLegacyPacketDocument' , () => {
  it('requires an agency document even when another consent was signed', () => {
    assert.equal(shouldKeepLegacyPacketDocument({ title: 'Informed Consent', step: {preserveAgencyDocument:true}, link: {intake_steps:[{type:'packet_informed_group_consent'}]}, intakeData:{packetSections:{informed_group_consent:{signatureData:'signed'}}} }), true);
  });

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
