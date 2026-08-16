import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletedIntakeRecord } from '../completedIntakeRecord.service.js';

test('completed record includes nested answers, skips secrets, and keeps ESIGN + signatures', () => {
  const spec = buildCompletedIntakeRecord({
    agency: { official_name: 'ITSCO' },
    link: {
      title: 'School intake',
      intake_steps: [
        {
          type: 'questions',
          label: 'About your child',
          fields: [
            { key: 'presenting_concern', label: 'What is the biggest concern?', type: 'text' }
          ]
        }
      ],
      intake_fields: [
        { key: 'presenting_concern', label: 'What is the biggest concern?', type: 'text' }
      ]
    },
    submission: {
      id: 778,
      submitted_at: '2026-08-14T18:00:00.000Z',
      consent_given_at: '2026-08-14T17:55:00.000Z',
      signer_name: 'Ada Lovelace',
      signer_email: 'ada@example.com',
      signer_role: 'guardian',
      ip_address: '203.0.113.10',
      user_agent: 'Mozilla/5.0',
      intake_data: {
        approval: { mode: 'staff_assisted', staffLastName: 'Rivera', approvedAt: '2026-08-14T17:50:00.000Z' },
        responses: {
          guardian: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', password: 'secret' },
          submission: {
            presenting_concern: 'Sleep',
            insuranceInfo: { payer: 'Medicaid', memberId: 'M123', card_number: '4111111111111111' }
          }
        }
      }
    },
    signedDocuments: [
      {
        document_template_name: 'Consent for treatment',
        signed_at: '2026-08-14T18:00:00.000Z',
        pdf_hash: 'abc123',
        audit_trail: { signatureData: 'data:image/png;base64,aaaa' }
      }
    ],
    clients: [{ fullName: 'Ada Lovelace', dateOfBirth: '1985-01-02' }]
  });

  assert.equal(spec.agencyName, 'ITSCO');
  assert.match(spec.title, /Completed intake packet/i);
  const values = spec.sections.flatMap((section) => section.rows.map((row) => `${row.label}|${row.value}`));
  assert.ok(values.some((row) => row.includes('Sleep')));
  assert.ok(values.some((row) => /Medicaid/.test(row)));
  assert.ok(!values.some((row) => /password|411111/i.test(row)));
  assert.equal(spec.signatures.length, 1);
  assert.equal(spec.signatures[0].documentName, 'Consent for treatment');
  assert.ok(spec.signatures[0].imageDataUrl.startsWith('data:image/png'));
  assert.ok(spec.approvals.some((block) => /Staff-assisted/i.test(block.title)));
  assert.ok(spec.esign.rows.some((row) => row.label === 'IP address' && row.value === '203.0.113.10'));
  assert.match(spec.esign.statement, /ESIGN Act/);
});

test('packet sections become per-document signature cards and skipped questionnaires are omitted', () => {
  const spec = buildCompletedIntakeRecord({
    agency: { name: 'ITSCO' },
    publicKey: 'office-intake-key',
    link: {
      public_key: 'office-intake-key',
      intake_steps: [
        {
          type: 'clinical_questions',
          label: 'Standard Questionnaires',
          fields: [
            { key: 'phq9_1', label: 'Little interest', type: 'select', instrument: 'phq9' },
            { key: 'skip_phq9', label: 'Skip PHQ-9', type: 'text' }
          ]
        }
      ]
    },
    submission: {
      id: 793,
      signer_name: 'Ada Lovelace',
      intake_data: {
        responses: {
          submission: {
            clinicalResponses: { skip_phq9: 'yes', phq9_1: '0' },
            packetSections: {
              policy_services: {
                acknowledged: true,
                signerName: 'Ada Lovelace',
                contentHash: 'hash-policy',
                packetVersion: 4,
                signatureData: 'data:image/png;base64,bbbb',
                snapshotHtml: '<p>Very long policy text that must not dump into answers</p>'
              }
            }
          }
        }
      }
    }
  });
  assert.ok(!spec.sections.some((section) => /Questionnaire/i.test(section.title)));
  assert.ok(!spec.sections.some((section) => section.rows.some((row) => /Very long policy/i.test(row.value))));
  assert.equal(spec.signatures.length, 1);
  assert.equal(spec.signatures[0].documentName, 'Policy and Services Agreement');
  assert.match(spec.signatures[0].publicUrl, /packet-section\/policy_services\/view/);
  assert.equal(spec.signatures[0].hash, 'hash-policy');
});

test('omits all-zero Vanderbilt/SCARED leftovers and humanizes option slugs', () => {
  const spec = buildCompletedIntakeRecord({
    agency: { name: 'ITSCO' },
    publicKey: 'office-intake-2-en',
    publicOrigin: 'https://app.itsco.health',
    link: {
      public_key: 'office-intake-2-en',
      intake_steps: [
        {
          type: 'questions',
          label: 'Daily life',
          fields: [
            {
              key: 'life_sleep',
              label: 'Sleep',
              type: 'radio',
              options: [
                { value: 'going_well', label: 'Going well' },
                { value: 'some_difficulty', label: 'Some difficulty' }
              ]
            }
          ]
        },
        {
          type: 'clinical_questions',
          label: 'Standard Questionnaires',
          fields: [
            { key: 'vanderbilt_1', label: 'Vanderbilt 1', type: 'select', instrument: 'vanderbilt_adhd18' },
            { key: 'scared5_1', label: 'Scared5 1', type: 'select', instrument: 'scared5_parent' }
          ]
        }
      ]
    },
    submission: {
      id: 801,
      signer_name: 'Ada Lovelace',
      intake_data: {
        smartDisclosure: { acknowledged: true, contentHash: 'disc-hash' },
        responses: {
          clients: [{
            life_sleep: 'going_well',
            vanderbilt_1: '0',
            scared5_1: '0',
            send_child_anxiety: 'send'
          }]
        }
      }
    }
  });
  const rows = spec.sections.flatMap((section) => section.rows.map((row) => `${row.label}|${row.value}`));
  assert.ok(rows.some((row) => /Going well/i.test(row)));
  assert.ok(!rows.some((row) => /Vanderbilt|Scared5|Send Child/i.test(row)));
  const disclosure = spec.signatures.find((row) => /Disclosure/i.test(row.documentName));
  assert.ok(disclosure);
  assert.match(disclosure.publicUrl, /https:\/\/app\.itsco\.health\/api\/public-intake\/office-intake-2-en\/disclosure\/view/);
});
