import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paperPacketRoiYears,
  paperPacketRoiExpiresAtYmd,
  PAPER_PACKET_ROI_3Y_START
} from '../paperPacketRoiExpiry.js';

test('paper packets before 2026-08-09 use 1 year', () => {
  assert.equal(paperPacketRoiYears('2026-04-15'), 1);
  assert.equal(paperPacketRoiYears('2026-08-08'), 1);
  assert.equal(paperPacketRoiExpiresAtYmd('2026-04-17'), '2027-04-17');
});

test('paper packets on/after 2026-08-09 use 3 years', () => {
  assert.equal(PAPER_PACKET_ROI_3Y_START, '2026-08-09');
  assert.equal(paperPacketRoiYears('2026-08-09'), 3);
  assert.equal(paperPacketRoiYears('2026-12-01'), 3);
  assert.equal(paperPacketRoiExpiresAtYmd('2026-08-09'), '2029-08-09');
});
