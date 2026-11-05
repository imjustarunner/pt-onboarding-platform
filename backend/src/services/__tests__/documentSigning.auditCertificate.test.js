import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import DocumentSigningService from '../documentSigning.service.js';

async function certificateText(options) {
  const pdfDoc = await PDFDocument.create();
  const drawn = [];
  const addPage = pdfDoc.addPage.bind(pdfDoc);
  pdfDoc.addPage = (...args) => {
    const page = addPage(...args);
    const drawText = page.drawText.bind(page);
    page.drawText = (text, opts) => { drawn.push(String(text)); return drawText(text, opts); };
    return page;
  };
  await DocumentSigningService.addAuditCertificatePage(
    pdfDoc,
    { consent_given_at: '2026-11-05T15:10:13Z', finalized_at: '2026-11-05T15:35:34Z' },
    { firstName: 'Demo', lastName: 'Guardian', email: 'guardian@example.com', userId: 'Public-1405' },
    { packetSection: true, clientId: 2394, clientName: 'Demo Child', documentReference: 'INTAKE-1405-null-MW3PJBNG' },
    options
  );
  return drawn.join('\n');
}

test('family enrollment certificate keeps the human signature summary without raw audit JSON', async () => {
  const text = await certificateText({ referenceNumber: 'Enrollment 1405', documentName: 'Informed Consent + Group Consent', omitRawAuditTrail: true });
  assert.match(text, /Electronic Signature Certificate/);
  assert.match(text, /Document Name: Informed Consent \+ Group Consent/);
  assert.match(text, /Document Reference: Enrollment 1405/);
  assert.match(text, /Name: Demo Guardian/);
  assert.match(text, /Document Finalized:/);
  assert.doesNotMatch(text, /Audit Trail/);
  assert.doesNotMatch(text, /packetSection|"clientId"|INTAKE-/);
});

test('other signed documents still print the audit trail block', async () => {
  const text = await certificateText({ referenceNumber: 'DOC-1', documentName: 'Staff form' });
  assert.match(text, /Audit Trail/);
  assert.match(text, /"clientId": 2394/);
});
