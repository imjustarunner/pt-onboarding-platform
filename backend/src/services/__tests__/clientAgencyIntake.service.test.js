import assert from 'node:assert/strict';
import {
  computeAgencyIntakeState,
  inferAgencyIntakePacketType
} from '../clientAgencyIntake.service.js';

assert.equal(inferAgencyIntakePacketType({ source: 'SCHOOL_UPLOAD' }), 'paper');
assert.equal(inferAgencyIntakePacketType({ source: 'PUBLIC_INTAKE_LINK' }), 'digital');

const digitalReady = computeAgencyIntakeState({
  client: { source: 'PUBLIC_INTAKE_LINK' },
  intake: { insuranceReviewed: true, ehrTransferred: true },
  hasProvider: true,
  providerLabel: 'Dr. Smith',
  clientStatusKey: 'in_process'
});
assert.equal(digitalReady.packetType, 'digital');
assert.equal(digitalReady.agencyIntakeComplete, true);
assert.equal(digitalReady.clearToSchedule, true);

const paperWaiting = computeAgencyIntakeState({
  client: { source: 'SCHOOL_UPLOAD' },
  intake: { insuranceReviewed: true, ehrTransferred: false, paperComplete: null },
  hasProvider: false,
  clientStatusKey: 'packet'
});
assert.equal(paperWaiting.packetType, 'paper');
assert.equal(paperWaiting.agencyIntakeComplete, false);
assert.ok(paperWaiting.pendingLabels.includes('Paper packet complete'));
assert.ok(paperWaiting.pendingLabels.includes('Provider assigned'));

const waitlisted = computeAgencyIntakeState({
  client: { source: 'PUBLIC_INTAKE_LINK' },
  intake: { insuranceReviewed: true, ehrTransferred: true },
  hasProvider: false,
  clientStatusKey: 'waitlist'
});
assert.equal(waitlisted.waitlisted, true);
assert.ok(!waitlisted.pendingLabels.includes('Provider assigned'));

console.log('clientAgencyIntake.service.test.js: ok');
