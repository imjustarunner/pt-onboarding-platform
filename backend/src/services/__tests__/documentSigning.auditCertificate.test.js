import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';
import DocumentSigningService from '../documentSigning.service.js';

const signer = { firstName: 'Demo', lastName: 'Guardian', email: 'guardian@example.com', userId: 'Public-1405' };
const audit = { packetSection: true, clientId: 2394, clientName: 'Demo Child', documentReference: 'INTAKE-1405-null-MW3PJBNG' };
const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function pdfText(bytes) {
  const parser = new PDFParse({ data: bytes });
  try { return (await parser.getText()).text; }
  finally { await parser.destroy(); }
}
async function certificateText(options, workflow = { consent_given_at: '2026-11-05T15:10:13Z', finalized_at: '2026-11-05T15:35:34Z' }, trail = audit, user = signer) {
  const pdfDoc = await PDFDocument.create();
  await DocumentSigningService.addAuditCertificatePage(pdfDoc, workflow, user, trail, options);
  const bytes = await pdfDoc.save();
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  return pdfText(bytes);
}
async function assertSignatureImage(bytes) {
  const document = await PDFDocument.load(bytes);
  const images = document.getPages()[0].node.Resources().lookup(PDFName.of('XObject'), PDFDict);
  assert.equal(images.keys().length, 1, 'The native PDF must contain the drawn signature image');
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

test('enrollment certificate renders every actual instant on the agency calendar day across Denver midnight', async () => {
  const workflow = {
    consent_given_at: '2026-11-14 06:59:59',
    intent_to_sign_at: '2026-11-14T07:00:01Z',
    identity_verified_at: '2026-11-14T07:00:02Z',
    finalized_at: new Date('2026-11-14T07:00:03Z')
  };
  const trail = { ...audit, timeZone: 'America/Denver', signedAt: '2026-11-14T07:00:03Z' };
  const before = JSON.stringify({ workflow, trail });
  const text = await certificateText({ omitRawAuditTrail: true }, workflow, trail);
  assert.match(text, /Time Zone: America\/Denver/);
  assert.match(text, /Consent Given: November 13, 2026 at 11:59:59 PM MST/);
  assert.match(text, /Intent to Sign: November 14, 2026 at 12:00:01 AM MST/);
  assert.match(text, /Identity Verified: November 14, 2026 at 12:00:02 AM MST/);
  assert.match(text, /Document Finalized: November 14, 2026 at 12:00:03 AM MST/);
  assert.doesNotMatch(text, /2026-11-14T|fallback/);
  assert.equal(JSON.stringify({ workflow, trail }), before, 'Formatting must preserve stored instant and audit values');
});

test('certificate preserves the spring daylight-saving jump in the named agency zone', async () => {
  const text = await certificateText({ timeZone: 'America/Denver', omitRawAuditTrail: true }, {
    consent_given_at: '2026-03-08T08:59:59Z', intent_to_sign_at: '2026-03-08T09:00:00Z'
  });
  assert.match(text, /Consent Given: March 8, 2026 at 1:59:59 AM MST/);
  assert.match(text, /Intent to Sign: March 8, 2026 at 3:00:00 AM MDT/);
});

test('certificate disambiguates the repeated fall clock hour using its actual zone abbreviation', async () => {
  const text = await certificateText({ timeZone: 'America/Denver', omitRawAuditTrail: true }, {
    consent_given_at: '2026-11-01T07:30:00Z', finalized_at: '2026-11-01T08:30:00Z'
  });
  assert.match(text, /Consent Given: November 1, 2026 at 1:30:00 AM MDT/);
  assert.match(text, /Document Finalized: November 1, 2026 at 1:30:00 AM MST/);
});

test('generic certificates without agency context use an explicit UTC fallback rather than a signer preference', async () => {
  const text = await certificateText({ omitRawAuditTrail: true }, { finalized_at: '2026-11-14T06:00:00Z' }, audit,
    { ...signer, timeZone: 'Pacific/Honolulu', timezone: 'America/Denver' });
  assert.match(text, /Time Zone: UTC \(fallback; no valid agency time zone supplied\)/);
  assert.match(text, /Document Finalized: November 14, 2026 at 6:00:00 AM UTC/);
  assert.doesNotMatch(text, /MST|HST|Honolulu|Denver/);
});

test('an invalid server zone falls back explicitly to UTC without changing the instant', async () => {
  const text = await certificateText({ timeZone: 'Not/A_Timezone', omitRawAuditTrail: true }, {
    finalized_at: '2026-11-14T06:00:00Z'
  }, { ...audit, timeZone: 'Invalid/Agency' });
  assert.match(text, /Time Zone: UTC \(fallback/);
  assert.match(text, /Document Finalized: November 14, 2026 at 6:00:00 AM UTC/);
});

test('stored agency audit context remains usable when an optional zone override is invalid', async () => {
  const text = await certificateText({ timeZone: 'Not/A_Timezone', omitRawAuditTrail: true }, {
    finalized_at: '2026-11-14T06:00:00Z'
  }, { ...audit, timeZone: 'America/Denver' });
  assert.match(text, /Time Zone: America\/Denver/);
  assert.match(text, /Document Finalized: November 13, 2026 at 11:00:00 PM MST/);
  assert.doesNotMatch(text, /fallback/);
});

test('finalized PDF pipeline forwards its explicit server timezone ahead of audit and signer preferences', async t => {
  const base = await PDFDocument.create(); base.addPage(); const baseBytes = await base.save();
  t.mock.method(DocumentSigningService, 'convertHTMLToPDF', async () => baseBytes);
  t.mock.method(console, 'log', () => {});
  const workflow = { finalized_at: '2026-11-14T06:00:00Z' };
  const bytes = await DocumentSigningService.generateFinalizedPDF(null, 'html', '<p>Synthetic consent</p>', null,
    workflow, { ...signer, timezone: 'Pacific/Honolulu' }, { ...audit, timeZone: 'America/Denver' }, null,
    { timeZone: 'Asia/Tokyo', omitRawAuditTrail: true });
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 2);
  const text = await pdfText(bytes);
  assert.match(text, /Time Zone: Asia\/Tokyo/);
  assert.match(text, /Document Finalized: November 14, 2026 at 3:00:00 PM GMT\+9/);
  assert.doesNotMatch(text, /MST|HST|fallback/);
});

test('the drawn signature date uses the actual finalized instant in the same server zone as its certificate', async t => {
  const base = await PDFDocument.create(); base.addPage(); const baseBytes = await base.save();
  t.mock.method(DocumentSigningService, 'convertHTMLToPDF', async () => baseBytes);
  t.mock.method(console, 'log', () => {});
  for (const [timeZone, expectedDate] of [['America/Denver', '2026-11-13'], ['Asia/Tokyo', '2026-11-14']]) {
    const bytes = await DocumentSigningService.generateFinalizedPDF(null, 'html', '<p>Synthetic consent</p>', signature,
      { finalized_at: '2026-11-14T00:30:00Z', intent_to_sign_at: '2026-11-12T00:30:00Z' }, signer,
      { ...audit, signedAt: '2026-11-16T00:30:00Z', timeZone: 'Pacific/Honolulu' }, null,
      { timeZone, omitRawAuditTrail: true });
    await assertSignatureImage(bytes);
    const text = await pdfText(bytes);
    assert.ok(text.includes(expectedDate));
    assert.ok(text.includes(`Time Zone: ${timeZone}`));
    assert.doesNotMatch(text, /2026-11-16/);
    if (timeZone === 'America/Denver') assert.doesNotMatch(text, /2026-11-14/);
  }
});

test('signature date falls back to the recorded intent or trusted audit instant when finalization is not supplied', async t => {
  const base = await PDFDocument.create(); base.addPage(); const baseBytes = await base.save();
  t.mock.method(DocumentSigningService, 'convertHTMLToPDF', async () => baseBytes);
  t.mock.method(console, 'log', () => {});
  for (const workflow of [{ intent_to_sign_at: '2026-11-14T00:30:00Z' }, {}]) {
    const bytes = await DocumentSigningService.generateFinalizedPDF(null, 'html', '<p>Synthetic consent</p>', signature,
      workflow, signer, { ...audit, signedAt: '2026-11-14T00:30:00Z', timeZone: 'America/Denver' }, null,
      { omitRawAuditTrail: true });
    await assertSignatureImage(bytes);
    assert.match(await pdfText(bytes), /2026-11-13/);
  }
});

test('generic signature stamping retains UTC fallback and suppressDate keeps the real image without a date', async t => {
  t.mock.method(console, 'log', () => {});
  for (const suppressDate of [false, true]) {
    const document = await PDFDocument.create(); document.addPage();
    await DocumentSigningService.addSignatureToPDF(document, signature, null, { signedAt: '2026-11-14T00:30:00Z', suppressDate });
    const bytes = await document.save(); await assertSignatureImage(bytes);
    const text = await pdfText(bytes);
    if (suppressDate) assert.doesNotMatch(text, /2026-11-/);
    else assert.match(text, /2026-11-14/);
  }
});
