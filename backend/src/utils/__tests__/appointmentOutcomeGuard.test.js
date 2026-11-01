import {expect,it} from 'vitest';
import {assertAppointmentOutcomePreserved} from '../appointmentOutcomeGuard.js';
it.each(['no_show','late_canceled','canceled_by_provider','voided','rescheduled','completed'])('rejects a stale editor trying to restore %s',status=>{
  expect(()=>assertAppointmentOutcomePreserved({status},{status:'scheduled'})).toThrow('final outcome');
  expect(()=>assertAppointmentOutcomePreserved({status},{status,notes:'Additional context'})).not.toThrow();
});
it('permits the initial reviewed outcome',()=>expect(()=>assertAppointmentOutcomePreserved({status:'scheduled'},{status:'no_show'})).not.toThrow());
