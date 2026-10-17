import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import SupervisionRecordPanel from '../SupervisionRecordPanel.vue';
const api = vi.hoisted(() => ({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',() => ({default:api}));
let data;
beforeEach(() => {
  vi.resetAllMocks();
  data={session:{id:102,startAt:'2026-10-08 16:00:00',endAt:'2026-10-08 17:00:00',status:'FINALIZED'},
    participants:[{userId:501,name:'Michael Mendez',role:'Supervisor',totalSeconds:786,firstJoinedAt:'2026-10-08 16:00:00',lastLeftAt:'2026-10-08 16:13:06'},{userId:567,name:'Halle Brimm',role:'Supervisee',totalSeconds:667}],
    events:[],corrections:[],actorUserId:501,canManage:true,canCorrect:true};
  api.get.mockImplementation(async() => ({data}));api.post.mockResolvedValue({data:{status:'approved',synced:true}});
});
it('shows completed status and real attendance, with notes and time controls directly on the info screen',async() => {
  const w=mount(SupervisionRecordPanel,{props:{sessionId:102,compact:true}});await flushPromises();
  expect(w.text()).toContain('Completed');expect(w.text()).toContain('Michael Mendez: 13.1 min');expect(w.text()).toContain('Halle Brimm: 11.1 min');
  await w.findAll('button').find(b => b.text()==='Attendance & time').trigger('click');expect(w.emitted('open-attendance')).toHaveLength(1);
  await w.findAll('button').find(b => b.text()==='Notes & summary').trigger('click');expect(w.emitted('open-notes')).toHaveLength(1);w.unmount();
});
it('requires a reason and attestation and sends the displayed Mountain times as UTC',async() => {
  const w=mount(SupervisionRecordPanel,{props:{sessionId:102,timezone:'America/Denver'}});await flushPromises();
  expect(w.get('[data-testid="correction-start"]').element.value).toBe('2026-10-08T10:00');
  expect(w.findAll('button').find(b => b.text()==='Save time correction').attributes('disabled')).toBeDefined();
  await w.get('[data-testid="correction-minutes"]').setValue(55);
  await w.get('[data-testid="correction-reason"]').setValue('Continued by phone after connection loss.');
  await w.get('[data-testid="correction-attestation"]').setValue(true);
  await w.findAll('button').find(b => b.text()==='Save time correction').trigger('click');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/supervision/sessions/102/time-corrections',expect.objectContaining({userIds:[501],startAt:'2026-10-08T16:00:00.000Z',endAt:'2026-10-08T17:00:00.000Z',minutes:55,attested:true}));
  expect(w.text()).toContain('Actual attendance updated.');expect(w.emitted('changed')).toHaveLength(1);w.unmount();
});
it('lets supervisees submit their own correction for review, without controls to approve other people',async() => {
  data.canManage=false;data.actorUserId=567;
  const w=mount(SupervisionRecordPanel,{props:{sessionId:102}});await flushPromises();
  expect(w.find('fieldset').text()).not.toContain('Michael');expect(w.find('fieldset').text()).toContain('Halle');
  expect(w.text()).toContain('Submit time correction');expect(w.text()).not.toContain('Approve correction');w.unmount();
});
it('retains a failed correction and its request identifier for a safe retry',async() => {
  api.post.mockRejectedValue({response:{data:{error:{message:'Overlapping attendance'}}}});
  const w=mount(SupervisionRecordPanel,{props:{sessionId:102}});await flushPromises();
  await w.get('[data-testid="correction-minutes"]').setValue(60);await w.get('[data-testid="correction-reason"]').setValue('Correcting actual attendance.');await w.get('[data-testid="correction-attestation"]').setValue(true);
  const button=w.findAll('button').find(b => b.text()==='Save time correction');await button.trigger('click');await flushPromises();await button.trigger('click');await flushPromises();
  expect(api.post.mock.calls[0][1].requestKey).toBe(api.post.mock.calls[1][1].requestKey);expect(w.text()).toContain('Overlapping attendance');w.unmount();
});
it('shows credited hours and explains logged attendance that does not count toward requirements',async() => {
  data.hourCredits=[{userId:567,individualHours:0.92,groupHours:0,countable:true}];
  const w=mount(SupervisionRecordPanel,{props:{sessionId:102}});await flushPromises();
  expect(w.text()).toContain('0.92 individual · 0.00 group hrs');w.unmount();
  data.hourCredits=[{userId:567,individualHours:0,groupHours:0,countable:false,effectiveStartDate:null}];
  const other=mount(SupervisionRecordPanel,{props:{sessionId:102}});await flushPromises();
  expect(other.text()).toContain('Attendance logged; requirement tracking needs a supervision start date.');other.unmount();
});
