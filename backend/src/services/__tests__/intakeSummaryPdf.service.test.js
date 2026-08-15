import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIntakeSummaryDocumentHtml,
  buildOfficeIntakeSummarySpec,
  buildQuickIntakeSummarySpec,
  pdfFilename,
  recordPdfFilename
} from '../intakeSummaryPdf.service.js';

test('builds packet-branded summary HTML with tenant name and answers', () => {
  const html = buildIntakeSummaryDocumentHtml({
    title: 'Intake packet summary',
    kicker: 'For your records',
    agencyName: 'ITSCO',
    metaLines: ['Submission 778', 'Submitted August 14, 2026'],
    sections: [
      { title: 'Contact', rows: [{ label: 'Name', value: 'Ada Lovelace' }] }
    ],
    footerNote: 'Your care team has this packet.'
  });
  assert.match(html, /Comfortaa/);
  assert.match(html, /packet-watermark/);
  assert.match(html, /ITSCO/);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /Intake packet summary/);
});

test('office spec skips secrets and includes nested answers plus e-sign', () => {
  const spec = buildOfficeIntakeSummarySpec({
    agencyName: 'ITSCO',
    submission: {
      id: 778,
      submitted_at: '2026-08-14T18:00:00.000Z',
      signer_name: 'Ada Lovelace',
      signer_email: 'ada@example.com',
      consent_given_at: '2026-08-14T17:55:00.000Z',
      ip_address: '203.0.113.10',
      intake_data: {
        responses: {
          guardian: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', password: 'secret' },
          submission: { presenting_concern: 'Sleep', insuranceInfo: { payer: 'Medicaid' } }
        }
      }
    },
    clients: [{ fullName: 'Ada Lovelace', dateOfBirth: '1985-01-02' }]
  });
  assert.equal(spec.agencyName, 'ITSCO');
  assert.equal(spec.packetVersionLabel, '1.0');
  const labels = spec.sections.flatMap((section) => section.rows.map((row) => row.label));
  assert.ok(labels.includes('Email'));
  assert.ok(!labels.some((label) => /password/i.test(label)));
  assert.ok(spec.sections.some((section) => section.rows.some((row) => row.value === 'Sleep')));
  assert.ok(spec.sections.some((section) => section.rows.some((row) => /Medicaid/.test(row.value))));
  assert.match(spec.esign.statement, /ESIGN Act/);
  const html = buildIntakeSummaryDocumentHtml({ ...spec, printable: true });
  assert.match(html, /Electronic Signature Certificate/);
  assert.match(html, /Medicaid/);
});

test('quick spec uses confirmation fields without a cover page', () => {
  const spec = buildQuickIntakeSummarySpec({
    agencyName: 'ITSCO',
    identifierCode: 'ABC123',
    submittedAt: '2026-08-14T18:00:00.000Z',
    summary: {
      whoForLabel: 'Myself',
      contactName: 'Ada Lovelace',
      contactEmail: 'ada@example.com',
      concerns: ['Anxiety'],
      acknowledgments: ['I understand this is an interest form.']
    }
  });
  assert.match(spec.title, /Interest form/i);
  assert.equal(spec.acknowledgments.length, 1);
  const html = buildIntakeSummaryDocumentHtml(spec);
  assert.doesNotMatch(html, /<section class="packet-cover/);
  assert.match(html, /ABC123/);
});

test('pdf filename stays download-safe', () => {
  assert.equal(pdfFilename(['itsco', 'intake summary', 778]), 'itsco-intake-summary-778.pdf');
});

test('record pdf filename uses tenant, initials, and date of birth', () => {
  assert.equal(
    recordPdfFilename({ tenant: 'ITSCO Counseling', initials: 'JSM', dateOfBirth: '2014-06-12' }),
    'ITSCO-Counseling-JSM-20140612.pdf'
  );
});
