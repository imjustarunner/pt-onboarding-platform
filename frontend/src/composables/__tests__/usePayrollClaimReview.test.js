import { beforeEach, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { usePayrollClaimReview } from '../usePayrollClaimReview';
const api = vi.hoisted(() => ({ patch: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: api }));
const row = id => ({ id, agency_id: 2, status: 'submitted', first_name: 'Test' });
let queues, review, saved, open, selectedAgencyId;
beforeEach(() => {
  vi.clearAllMocks(); selectedAgencyId = 2; queues = { time: ref([row(1),row(2)]), mileage: ref([]), reimb: ref([]) };
  saved = vi.fn(); open = vi.fn();
  review = usePayrollClaimReview({ agencyId: () => selectedAgencyId, queues, onSaved: saved, onReview: open });
});
it('removes only server-confirmed approvals without fetching queues, and overlays an older list response', async () => {
  const original = [...queues.time.value], since = review.revision.value;
  api.patch.mockResolvedValue({ data: { claim: { ...row(1),status:'approved',applied_amount:21 } } });
  expect(await review.decide('time',original[0],{action:'approve'})).toBe(true);
  expect(queues.time.value.map(c=>c.id)).toEqual([2]);
  expect(review.reconcile('time',original,since).map(c=>c.id)).toEqual([2]);
  expect(review.reconcileApproved('time',[],since)).toMatchObject([{id:1,applied_amount:21}]);
  expect(saved).toHaveBeenCalledOnce();
});
it('retains a blocked travel claim and opens its required review without showing success', async () => {
  api.patch.mockRejectedValue({ response: {status:409,data:{error:{message:'Review the report'},reviewRequired:{type:'event_travel'}}} });
  expect(await review.decide('time',row(1),{action:'approve'})).toBe(false);
  expect(queues.time.value).toHaveLength(2); expect(open).toHaveBeenCalledWith('time',expect.objectContaining({id:1}));
  expect(review.errors['time-1']).toBe('Review the report'); expect(review.notice.value).toBe(''); expect(saved).not.toHaveBeenCalled();
});
it('never reports approval when an override is declined', async () => {
  vi.spyOn(window,'confirm').mockReturnValueOnce(false);
  api.patch.mockRejectedValue({response:{status:409,data:{error:{message:'Submitted after cutoff'}}}});
  expect(await review.decide('time',row(1),{action:'approve'})).toBe(false);
  expect(saved).not.toHaveBeenCalled(); expect(api.patch).toHaveBeenCalledOnce(); expect(review.notice.value).toBe('');
});
it('uses one bulk request, applies partial success, and keeps the failed selection and reason', async () => {
  review.toggleAll('time',queues.time.value,true);
  api.post.mockResolvedValue({data:{results:[{kind:'time',id:1,ok:true,claim:{...row(1),status:'approved'}},{kind:'time',id:2,ok:false,error:{message:'Open the Event travel report'},reviewRequired:{type:'event_travel'}}]}});
  await review.bulk(queues.time.value.map(claim=>({kind:'time',claim,targetPayrollPeriodId:8,creditsHours:claim.id})), 'approve');
  expect(api.post).toHaveBeenCalledOnce();
  expect(api.post).toHaveBeenCalledWith('/payroll/claims/batch',expect.objectContaining({agencyId:2,items:[{kind:'time',id:1,targetPayrollPeriodId:8,creditsHours:1},{kind:'time',id:2,targetPayrollPeriodId:8,creditsHours:2}]}));
  expect(queues.time.value.map(c=>c.id)).toEqual([2]); expect(review.selected.value).toEqual(['time-2']);
  expect(review.errors['time-2']).toBe('Open the Event travel report'); expect(review.notice.value).toContain('1 of 2');
  expect(open).not.toHaveBeenCalled();
});
it('does not accept an incomplete or wrong-agency confirmation', async () => {
  for (const claim of [{id:1}, {...row(1),status:'approved',agency_id:3}]) {
    api.patch.mockResolvedValue({data:{claim}});
    expect(await review.decide('time',row(1),{action:'approve'})).toBe(false);
  }
  expect(queues.time.value).toHaveLength(2); expect(saved).not.toHaveBeenCalled();
});
it('ignores an old agency mutation response after scope changes', async () => {
  let finish; api.patch.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=review.decide('time',row(1),{action:'approve'}); review.reset();
  finish({data:{claim:{...row(1),status:'approved'}}}); await pending;
  expect(saved).not.toHaveBeenCalled(); expect(queues.time.value).toHaveLength(2);
});
it('accepts confirmed single and bulk decisions for an authorized parent agency when a child organization is selected', async () => {
  selectedAgencyId = 9;
  api.patch.mockResolvedValue({data:{claim:{...row(1),status:'approved'}}});
  expect(await review.decide('time',row(1),{action:'approve'})).toBe(true);
  review.toggleAll('time',queues.time.value,true);
  api.post.mockResolvedValue({data:{results:[{kind:'time',id:2,ok:true,claim:{...row(2),status:'approved'}}]}});
  await review.bulk([{kind:'time',claim:row(2),targetPayrollPeriodId:8}],'approve');
  expect(api.post).toHaveBeenCalledWith('/payroll/claims/batch',expect.objectContaining({agencyId:9}));
  expect(queues.time.value).toEqual([]);expect(saved).toHaveBeenCalledTimes(2);expect(Object.keys(review.errors)).toEqual([]);
});
