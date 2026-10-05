import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchoolVisitRequest as request, normalizeSchoolVisitUpdate as update } from '../schoolVisitChange.js';
import { createSchoolVisitChangeToken as create, verifySchoolVisitChangeToken as verify } from '../schoolVisitChangeToken.js';
const now = new Date('2026-10-01T12:00:00Z');
test('visit-only links reject tampering and unrelated JWT secrets', () => {
 const previous=process.env.JWT_SECRET;process.env.JWT_SECRET='test-school-visit-secret';
 try { const token=create(7); assert.equal(verify(token),7);assert.throws(()=>verify(token+'invalid'));process.env.JWT_SECRET='other-secret';assert.throws(()=>verify(token)); }
 finally { if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous; }
});
test('school change request has explicit contact and bounded details',()=>{
 assert.deepEqual(request({name:' School Staff ',email:'OFFICE@example.com',kind:'virtual',note:'Please change to virtual.'}),{name:'School Staff',email:'office@example.com',kind:'virtual',note:'Please change to virtual.'});
 assert.throws(()=>request({name:'Staff',email:'bad',note:'note'}));
 assert.throws(()=>request({name:'Staff',email:'a@example.com',note:'x'.repeat(2001)}));
});
test('staff rescheduling consistently interprets Mountain time across DST',()=>{
 const base={action:'update',modality:'virtual',location:'old school'};
 assert.equal(update({...base,startsAt:'2026-10-12T09:00',endsAt:'2026-10-12T09:30'},now).startsAt,'2026-10-12 15:00:00');
 assert.equal(update({...base,startsAt:'2026-12-07T09:00',endsAt:'2026-12-07T09:30'},now).startsAt,'2026-12-07 16:00:00');
 assert.equal(update({...base,startsAt:'2026-10-12T09:00',endsAt:'2026-10-12T09:30'},now).location,'');
});
test('staff cannot save past, reversed or missing-location visits',()=>{
 const base={action:'update',modality:'in_person',location:'School',startsAt:'2026-10-12T09:00',endsAt:'2026-10-12T09:30'};
 assert.throws(()=>update({...base,location:''},now));assert.throws(()=>update({...base,endsAt:'2026-10-12T08:30'},now));assert.throws(()=>update({...base,startsAt:'2026-09-01T09:00'},now));
});
