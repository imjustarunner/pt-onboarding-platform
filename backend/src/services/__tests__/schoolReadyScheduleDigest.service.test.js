import test from 'node:test';
import assert from 'node:assert/strict';
import {runReadyToScheduleDigestTick} from '../schoolReadyScheduleDigest.service.js';
test('the retired Mon/Wed/Fri digest does not send even during its old send window',async()=>{
  assert.deepEqual(await runReadyToScheduleDigestTick(new Date('2026-09-23T16:00:00Z')),{ran:false,reason:'replaced_by_immediate_school_status_emails'});
});
