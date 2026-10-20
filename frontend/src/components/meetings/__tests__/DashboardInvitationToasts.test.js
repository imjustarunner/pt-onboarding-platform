import { mount as rawMount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import DashboardInvitationToasts from '../DashboardInvitationToasts.vue';
const mount=(component,options)=>rawMount(component,{...options,global:{stubs:{Teleport:true}}});
const mocks = vi.hoisted(() => ({ get:vi.fn(), post:vi.fn(), push:vi.fn() }));
vi.mock('../../../services/api', () => ({default:mocks}));
vi.mock('vue-router', () => ({useRoute:() => ({params:{organizationSlug:'itsco'}}),useRouter:() => ({push:mocks.push})}));
vi.mock('../ScheduledTrainingPanel.vue', () => ({default:{props:['eventId'],template:'<div>Training details {{eventId}}</div>'}}));
const training = {key:'training:1',id:1,type:'training',title:'Crisis skills',startAt:'2026-10-20T22:00:00Z',required:false};
const supervision = {key:'supervision:2',id:2,type:'supervision',title:'Supervision',startAt:'2026-10-20T22:00:00Z',required:true};
beforeEach(() => {vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T22:00:00Z'));vi.clearAllMocks();mocks.get.mockResolvedValue({data:{prompts:[training,supervision]}});mocks.post.mockResolvedValue({data:{ok:true}});});
afterEach(() => vi.useRealTimers());
describe('dashboard invitation responses', () => {
  it('persists optional dismissal with no reason and never hides a failed response', async () => {
    const w=mount(DashboardInvitationToasts,{props:{userId:7}});await flushPromises();
    mocks.post.mockRejectedValueOnce(new Error('offline'));
    await w.findAll('button').find(b=>b.text().includes('not interested')).trigger('click');await flushPromises();
    expect(w.text()).toContain('Crisis skills');expect(w.get('[role="alert"]').text()).toContain('could not be saved');
    await w.findAll('button').find(b=>b.text().includes('not interested')).trigger('click');await flushPromises();
    expect(mocks.post).toHaveBeenLastCalledWith('/team-meetings/1/training/rsvp',{response:'declined'});
    expect(w.find('textarea').exists()).toBe(false);w.unmount();
  });
  it('requires and submits an absence reason for mandatory supervision', async () => {
    const w=mount(DashboardInvitationToasts,{props:{userId:7}});await flushPromises();
    await w.findAll('button').find(b=>b.text().startsWith('Show all')).trigger('click');
    await w.findAll('button').find(b=>b.text()==='I can’t attend').trigger('click');
    expect(w.get('button[type="submit"]').attributes('disabled')).toBeDefined();
    await w.get('textarea').setValue('Previously scheduled appointment');await w.get('form').trigger('submit');await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/supervision/sessions/2/rsvp',{response:'declined',reason:'Previously scheduled appointment'});w.unmount();
  });
  it('shows signup time remaining and uses the audience signup and dismissal endpoints', async () => {
    mocks.get.mockResolvedValue({data:{prompts:[{...supervision,required:false,signupOnly:true,signupClosesAt:'2026-10-19T23:30:00Z'}]}});
    const w=mount(DashboardInvitationToasts,{props:{userId:7}});await flushPromises();
    expect(w.text()).toContain('1h 30m left to register');
    await w.findAll('button').find(b=>b.text()==='Sign up').trigger('click');await flushPromises();
    expect(mocks.post).toHaveBeenCalledWith('/supervision/sessions/2/signup',{response:'accepted'});
    await vi.advanceTimersByTimeAsync(60000);
    await w.findAll('button').find(b=>b.text().includes('not interested')).trigger('click');await flushPromises();
    expect(mocks.post).toHaveBeenLastCalledWith('/supervision/sessions/2/signup-dismiss',{response:'declined'});w.unmount();
  });
  it('opens training information in place and links supervision to its own event', async () => {
    const w=mount(DashboardInvitationToasts,{props:{userId:7}});await flushPromises();
    await w.findAll('button').find(b=>b.text()==='More info').trigger('click');expect(w.get('[role="dialog"]').text()).toContain('Training details 1');
    await w.get('[aria-label="Close training details"]').trigger('click');expect(w.find('[role="dialog"]').exists()).toBe(false);
    await w.findAll('button').find(b=>b.text().startsWith('Show all')).trigger('click');
    await w.findAll('button').filter(b=>b.text()==='More info')[1].trigger('click');
    expect(mocks.push).toHaveBeenCalledWith({path:'/itsco/my-schedule',query:{eventId:2,eventKind:'SUPERVISION',weekStart:'2026-10-20'}});w.unmount();
  });
});
