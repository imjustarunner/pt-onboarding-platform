import {expect,it} from 'vitest';
import {assertAppointmentOutcomePreserved,assertNoShowUsesSignedWorkflow} from '../appointmentOutcomeGuard.js';
it.each(['no_show','late_canceled','canceled_by_provider','voided','rescheduled','completed'])('rejects a stale editor trying to restore %s',status=>{
  expect(()=>assertAppointmentOutcomePreserved({status},{status:'scheduled'})).toThrow('final outcome');
  expect(()=>assertAppointmentOutcomePreserved({status},{status,notes:'Additional context'})).not.toThrow();
});
it('permits the initial reviewed outcome',()=>expect(()=>assertAppointmentOutcomePreserved({status:'scheduled'},{status:'no_show'})).not.toThrow());
it.each([null,{status:'scheduled'},{status:'confirmed'}])('refuses an ordinary booking or update that skips the signed no-show workflow: %j',existing=>{
 expect(()=>assertNoShowUsesSignedWorkflow(existing,'no_show')).toThrow('Appointment Change');
 expect(()=>assertNoShowUsesSignedWorkflow(existing,'no_show_pending')).toThrow('Appointment Change');
});
it('allows only the trusted due finalizer to promote a pending declaration to no-show',()=>{
 expect(()=>assertNoShowUsesSignedWorkflow({status:'no_show_pending'},'no_show')).toThrow();
 expect(()=>assertNoShowUsesSignedWorkflow({status:'no_show_pending'},'no_show',{trustedFinalization:true})).not.toThrow();
 expect(()=>assertNoShowUsesSignedWorkflow({status:'scheduled'},'no_show',{trustedFinalization:true})).toThrow();
 expect(()=>assertNoShowUsesSignedWorkflow({status:'no_show'},'no_show')).not.toThrow();
});
