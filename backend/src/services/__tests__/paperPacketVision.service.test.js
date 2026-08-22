import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVersionLabelFromText,
  detectSignaturesFromText,
  detectDenyStaffFromText,
  normalizeVersionLabel
} from '../../utils/paperPacketVisionParse.util.js';

test('normalizeVersionLabel strips prefixes', () => {
  assert.equal(normalizeVersionLabel('V1.02'), '1.02');
  assert.equal(normalizeVersionLabel('Version 1.1'), '1.1');
  assert.equal(normalizeVersionLabel('1.023'), '1.023');
});

test('extractVersionLabelFromText prefers footer-style version', () => {
  const text = `
Authorized School Staff
ACKNOWLEDGEMENT AND CONSENT SUMMARY
Packet Version: 1.02
`;
  const hit = extractVersionLabelFromText(text);
  assert.equal(hit.label, '1.02');
  assert.ok(hit.confidence >= 0.7);
});

test('detectSignaturesFromText finds two dated signature blocks', () => {
  const text = `
Sign here — required
Client's or Responsible Party's Signature
Date 08/21/2026
...
Sign here — required (all signatures on this page)
Client's or Responsible Party's Signature
Date 08/21/2026
`;
  const sigs = detectSignaturesFromText(text);
  assert.equal(sigs.roiSignatureDetected, true);
  assert.equal(sigs.disclosureSignatureDetected, true);
});

test('detectDenyStaffFromText maps checked deny next to staff name', () => {
  const staff = [
    { id: 10, fullName: 'Deb Hronsky', firstName: 'Deb', lastName: 'Hronsky' },
    { id: 11, fullName: 'Kelly Gallegos', firstName: 'Kelly', lastName: 'Gallegos' }
  ];
  const text = `
☐ Deny Deb Hronsky Counselor
☑ Deny Kelly Gallegos Admin
`;
  const result = detectDenyStaffFromText(text, staff);
  assert.ok(result.denyStaffUserIds.includes(11));
  assert.ok(!result.denyStaffUserIds.includes(10));
});
