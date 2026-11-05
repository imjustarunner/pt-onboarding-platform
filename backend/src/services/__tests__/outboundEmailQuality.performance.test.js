import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countAgencyCommunicationQualityIssues } from '../outboundEmailQuality.service.js';

test('large badge scans let other event-loop work run before finishing and preserve the count', async () => {
  let scanned = 0;
  let progressAtOtherWork = null;
  const rows = Array.from({ length: 125 }, (_, id) => ({
    id, subject: 'Your document', metadata: {},
    get body() { scanned++; return '<p>See attached file.</p>'; }
  }));
  const pool = { execute: async () => [rows] };
  const otherWork = new Promise(resolve => setImmediate(() => { progressAtOtherWork = scanned; resolve(); }));
  assert.equal(await countAgencyCommunicationQualityIssues(2, { pool }), 125);
  await otherWork;
  assert.ok(progressAtOtherWork > 0 && progressAtOtherWork < 125);
});

test('resolved flags and attachment metadata retain their existing meaning', async () => {
  const body = '<p>See attached file.</p>';
  const rows = [
    { body, metadata: {} },
    { body, metadata: { hadAttachments: true } },
    { body, metadata: { qualityResolvedAt: '2026-11-04T12:00:00Z' } }
  ];
  assert.equal(await countAgencyCommunicationQualityIssues(2, { pool: { execute: async () => [rows] } }), 1);
});
