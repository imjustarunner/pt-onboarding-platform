import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import CompanyEventStaffView from '../CompanyEventStaffView.vue';
import api from '../../../services/api';
const state = vi.hoisted(() => ({ signedIn: true, query: {}, participation: { assigned: false, clockedIn: false, canCheckIn: false, canCheckOut: false } }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ get params() { return state.params; }, query: state.query, hash: '#event-check-in', fullPath: '/company-events/8/staff/share-token?attendance=checkout-time#event-check-in' }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ get isAuthenticated() { return state.signedIn; } }) }));
const wrappers = [];
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text);
async function render() { const wrapper = mount(CompanyEventStaffView, { global: { stubs: { StaffPollsPanel: true } } }); wrappers.push(wrapper); await flushPromises(); return wrapper; }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-27T12:00:00Z'));
  state.signedIn = true;
  state.query = {};
  state.params = reactive({eventId:'8',token:'share-token'});
  state.participation = { assigned: false, clockedIn: false, canCheckIn: false, canCheckOut: false };
  api.get.mockImplementation(url => Promise.resolve({ data: url.includes('/participation') ? state.participation : { event: { id: 8, title: 'School outreach', startsAt: '2026-10-24T18:00:00Z', isWorkEvent: true }, branding: { agencyName: 'ITSCO' } } }));
  api.post.mockResolvedValue({ data: { ok: true } });
});
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllMocks(); vi.useRealTimers(); });

describe('staff event participation', () => {
  it('clears the previous event and ignores its delayed load when navigating between invitations',async()=>{
    let first;api.get.mockImplementation(url => url.includes('/staff/8/') ? new Promise(resolve => {first=resolve;}) : Promise.resolve({data:{event:{id:9,title:'Current event',isWorkEvent:false},branding:{agencyName:'ITSCO'}}}));
    const wrapper=mount(CompanyEventStaffView,{global:{stubs:{StaffPollsPanel:true}}});wrappers.push(wrapper);
    state.params.eventId='9';await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Current event');
    first({data:{event:{id:8,title:'Old event',isWorkEvent:false}}});await flushPromises();
    expect(wrapper.get('h1').text()).toBe('Current event');
    expect(wrapper.text()).not.toContain('Old event');
  });
  it('shows the saved RSVP and searchable real attendees in the redesigned page',async()=>{
    api.get.mockResolvedValue({data:{event:{id:8,title:'Workshop',isWorkEvent:false,response:'yes',attendees:[{id:7,name:'Ada Carter'},{id:9,name:'Ben Lee'}],attendance:{attending:2,maybe:1},audienceLabel:'8 invited people'},branding:{agencyName:'ITSCO'}}});
    const wrapper=await render();
    expect(button(wrapper,'Attending').attributes('aria-pressed')).toBe('true');
    expect(wrapper.text()).toContain('You’re attending!');
    expect(wrapper.text()).toContain('8 invited people');
    expect(wrapper.text()).toContain('Calendar options appear once the date is set');
    await button(wrapper,'View all 2').trigger('click');
    await wrapper.get('.event-attendee-list input').setValue('Ada');
    expect(wrapper.get('.event-attendee-list').text()).toContain('Ada Carter');
    expect(wrapper.get('.event-attendee-list').text()).not.toContain('Ben Lee');
    expect(wrapper.find('#event-check-in').exists()).toBe(false);
  });
  it('shows an undated private social event with RSVP, linked votes and a group conversation but no payroll',async()=>{
    api.get.mockResolvedValue({data:{event:{id:8,title:'Two years together',startsAt:null,endsAt:null,isWorkEvent:false,mandatory:false},branding:{agencyName:'ITSCO'}}});
    const wrapper=await render();
    expect(wrapper.text()).toContain('Date & time to be decided');
    expect(wrapper.text()).toContain('Optional invitation');
    expect(wrapper.find('#event-check-in').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'StaffPollsPanel' }).props('linkedEventId')).toBe(8);
    await button(wrapper,'Attending').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/staff/8/share-token/respond',{response:'yes'});
    expect(wrapper.text()).toContain('Your RSVP was saved');
    expect(api.get.mock.calls.some(([url])=>url.endsWith('/participation'))).toBe(false);
    expect(button(wrapper,'Message event group')).toBeDefined();
  });

  it('lets an invitee suggest a dish without any organizer slots and keeps their saved contribution editable',async()=>{
    const event={id:8,title:'Team potluck',startsAt:null,endsAt:null,isWorkEvent:false,potluckEnabled:true,organizerProviding:['Main dishes']};
    api.get.mockResolvedValue({data:{event,needList:[],branding:{agencyName:'ITSCO'}}});
    const wrapper=await render();
    const form=wrapper.find('.event-potluck form');
    await form.find('select').setValue('__custom');
    await form.find('input').setValue('Fresh fruit salad');
    api.get.mockResolvedValue({data:{event,needList:[{id:91,name:'Fresh fruit salad',mine:true,custom:true,claimed:true}],branding:{agencyName:'ITSCO'}}});
    await form.trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/staff/8/share-token/potluck',{itemId:null,customItemName:'Fresh fruit salad'});
    expect(wrapper.text()).toContain('Your contribution was saved. Thank you!');
    expect(wrapper.find('.event-potluck article.mine').text()).toContain('Fresh fruit salad');
    expect(wrapper.find('.event-potluck select').element.value).toBe('__custom');
    expect(wrapper.find('.event-potluck input').element.value).toBe('Fresh fruit salad');
    await wrapper.find('.event-potluck input').setValue('Watermelon and berries');
    await wrapper.find('.event-potluck form').trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenLastCalledWith('/company-events/staff/8/share-token/potluck',{itemId:null,customItemName:'Watermelon and berries'});
  });

  it('requires sign-in before allowing interest, check-in, or travel', async () => {
    state.signedIn = false;
    const wrapper = await render();
    expect(wrapper.get('a[href^="/login?redirect="]').exists()).toBe(true);
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(api.get).not.toHaveBeenCalled();
  });
  it('records interest without assigning staff or opening check-in', async () => {
    const wrapper = await render();
    await button(wrapper, "I'm interested").trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/staff/8/share-token/respond', { response: 'yes' });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Assignment requires coordinator approval');
    expect(button(wrapper, 'Check in')).toBeUndefined();
  });
  it('permits checkout of an existing open punch even after assignment was removed', async () => {
    state.participation = { assigned: false, clockedIn: true, canCheckOut: true };
    const wrapper = await render();
    await button(wrapper, 'Clock out now').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/me/company-events/8/check-out', {});
  });
  it('keeps travel reimbursement in Submit instead of the attendance page', async () => {
    state.participation = { assigned: true, canSubmitTravel: true, isEventDay: true, canCheckIn: true };
    const wrapper = await render();
    expect(wrapper.find('.event-travel-panel').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Travel time');
    expect(button(wrapper, 'Check in')).toBeDefined();
  });

  it('opens the chosen-time form from the email without automatically recording a punch', async () => {
    state.query = { attendance: 'checkout-time' };
    state.participation = { assigned: true, clockedIn: true, canCheckOut: true, lastPunch: { at: '2026-10-24T16:00:00Z' } };
    const wrapper = await render();
    expect(wrapper.find('#event-check-in form').exists()).toBe(true);
    expect(wrapper.text()).toContain('device timezone');
    expect(api.post).not.toHaveBeenCalled();
    const form = wrapper.find('#event-check-in form');
    await form.find('input[type="datetime-local"]').setValue('2026-10-24T20:00');
    await form.find('input[type="checkbox"]').setValue(true);
    await form.trigger('submit'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/me/company-events/8/check-out', { checkoutAt: new Date('2026-10-24T20:00').toISOString() });
    expect(wrapper.text()).toContain('Your event time was saved');
  });

  it('rejects a checkout before clock-in without sending a request', async () => {
    state.query = { attendance: 'checkout-time' };
    state.participation = { assigned: true, clockedIn: true, canCheckOut: true, lastPunch: { at: '2026-10-24T16:00:00Z' } };
    const wrapper = await render();
    const form = wrapper.find('#event-check-in form');
    await form.find('input[type="datetime-local"]').setValue('2026-10-23T10:00');
    await form.find('input[type="checkbox"]').setValue(true);
    await form.trigger('submit'); await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('after your clock-in time');
  });

  it('keeps a failed checkout editable and shows the server error', async () => {
    state.participation = { assigned: true, clockedIn: true, canCheckOut: true };
    api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'You are not currently clocked in to this event' } } } });
    const wrapper = await render();
    await button(wrapper, 'Clock out now').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('not currently clocked in');
    expect(button(wrapper, 'Clock out now').attributes('disabled')).toBeUndefined();
  });

});
