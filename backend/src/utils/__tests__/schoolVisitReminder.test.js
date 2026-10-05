import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schoolVisitReminderDue as due, schoolVisitReminderDetails as details, schoolVisitReminderBody as body } from '../schoolVisitReminder.js';
const booking={starts_at:'2026-10-05 17:00:00',ends_at:'2026-10-05 18:00:00',modality:'in_person',location_text:'School office'};
const event={startAt:'2026-10-05T17:00:00Z',endAt:'2026-10-05T18:00:00Z',status:'confirmed',location:'School office'};
test('Monday reminder becomes due Friday at 10am Mountain',()=>{
  assert.equal(due(event.startAt,new Date('2026-10-02T15:59:00Z')),false);
  assert.equal(due(event.startAt,new Date('2026-10-02T16:00:00Z')),true);
  assert.equal(due(event.startAt,new Date('2026-10-03T16:00:00Z')),false);
  assert.equal(due(event.startAt,new Date(event.startAt)),false);
});
test('winter reminder follows Mountain standard time',()=>{
  assert.equal(due('2026-12-07T18:00:00Z',new Date('2026-12-04T16:00:00Z')),false);
  assert.equal(due('2026-12-07T18:00:00Z',new Date('2026-12-04T17:00:00Z')),true);
});
test('changed and cancelled visits are held',()=>{
  assert.ok(details(booking,{...event,status:'cancelled'}).hold);
  assert.ok(details(booking,{...event,summary:'Virtual school visit'}).hold);
  assert.ok(details(booking,{...event,startAt:'2026-10-05T19:00:00Z'}).hold);
  assert.ok(details(booking,{...event,location:'Different school'}).hold);
});
test('virtual details use verified calendar link',()=>{
  const result=details({...booking,modality:'virtual'},{...event,summary:'Virtual school visit',meetLink:'https://meet.google.com/example'});
  assert.equal(result.meetLink,'https://meet.google.com/example');
  assert.ok(details({...booking,modality:'virtual'},event).hold);
});
test('branded copy escapes school text and respects direct arrangements',()=>{
  const result=body({schoolName:'School <script>',...details(booking,event)});
  assert.match(result.html,/ITSCO/);assert.ok(!result.html.includes('<script>'));
  assert.match(result.text,/please follow her latest message/);assert.match(result.text,/MDT/);
  assert.match(result.html,/schools@itsco.health/);
});
