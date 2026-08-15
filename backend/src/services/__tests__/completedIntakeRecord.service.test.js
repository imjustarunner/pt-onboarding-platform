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
