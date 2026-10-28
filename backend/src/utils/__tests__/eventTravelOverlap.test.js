import {test} from 'node:test';import assert from 'node:assert/strict';
import {overlapsRecordedAttendance} from '../eventTravelOverlap.js';
const attendance={startedAt:'2026-10-24T21:41:44Z',endedAt:'2026-10-25T03:40:33.371Z'};
test('accepts travel beginning in the displayed checkout minute without changing attendance',()=>{
 assert.equal(overlapsRecordedAttendance({startedAt:'2026-10-25T03:40:00Z',endedAt:'2026-10-25T04:00:00Z'},attendance),false);
 assert.equal(attendance.endedAt,'2026-10-25T03:40:33.371Z');
});
test('still rejects real overlap and respects second-precision input',()=>{
 assert.equal(overlapsRecordedAttendance({startedAt:'2026-10-25T03:39:00Z',endedAt:'2026-10-25T04:00:00Z'},attendance),true);
 assert.equal(overlapsRecordedAttendance({startedAt:'2026-10-25T03:40:10Z',endedAt:'2026-10-25T04:00:00Z'},attendance),true);
 assert.equal(overlapsRecordedAttendance({startedAt:'2026-10-24T21:30:00Z',endedAt:'2026-10-24T21:41:00Z'},attendance),false);
});
