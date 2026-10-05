import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({mark:vi.fn(),day:vi.fn()}));
vi.mock('../clientLifecycleStatus.service.js',()=>({markClientBeingSeen:mocks.mark,clientHasWeekdayAssignment:mocks.day}));
import { confirmChecklistServices as confirm } from '../clientServiceConfirmation.service.js';
const now=new Date('2026-10-05T12:00:00Z');
describe('checklist service confirmation',()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.mark.mockResolvedValue({statusKey:'being_seen',changed:true});mocks.day.mockResolvedValue(false);});
 it('confirms returners and reports weekday follow-up separately',async()=>{
  const result=await confirm({client:{id:1,client_status_key:'ready_to_schedule',created_at:'2025-01-01'},firstServiceAt:'2026-09-15',actorUserId:2,now});
  expect(result.confirmed).toBe(true);expect(result.needsDayAssignment).toBe(true);expect(mocks.mark).toHaveBeenCalledWith({clientId:1,actorUserId:2,serviceDate:'2026-09-15'});
 });
 it('does not turn historical, missing or future dates into current confirmation',async()=>{
  for(const date of [null,'2026-02-01','2026-11-01'])expect((await confirm({client:{id:1},firstServiceAt:date,now})).confirmed).toBe(false);
  expect(mocks.mark).not.toHaveBeenCalled();
 });
 it('does not reopen a waitlisted client',async()=>{
  expect((await confirm({client:{id:1,client_status_key:'waitlist'},firstServiceAt:'2026-09-01',now})).confirmed).toBe(false);expect(mocks.mark).not.toHaveBeenCalled();
 });
});
