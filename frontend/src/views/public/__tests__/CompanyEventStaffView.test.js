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
  it('opens the readable public page without login or requests for private event data',async()=>{
    state.signedIn=false;state.params=reactive({eventOrganization:'itsco',eventSlug:'potluck-8'});
    api.get.mockResolvedValue({data:{event:{id:8,title:'Our potluck',potluckEnabled:true},branding:{agencyName:'ITSCO'},agencies:[{name:'ITSCO'}],organizationSlug:'itsco'}});
    const wrapper=await render();expect(wrapper.get('h1').text()).toBe('Our potluck');
    expect(api.get.mock.calls.map(([url])=>url)).toEqual(['/company-events/page/itsco/potluck-8']);
    expect(wrapper.get('a.ee-button-primary').attributes('href')).toContain('/conversa/login/itsco?redirect=');
    expect(wrapper.findComponent({name:'StaffPollsPanel'}).exists()).toBe(false);
    expect(button(wrapper,'Message event group')).toBeUndefined();
  });
  it('adds authenticated features on that same readable event page',async()=>{
    state.params=reactive({eventOrganization:'itsco',eventSlug:'potluck-8'});
    api.get.mockImplementation(async url=>({data:url.endsWith('/staff')?{event:{id:8,agencyId:2,title:'Our potluck',isWorkEvent:false,response:'yes'},branding:{agencyName:'ITSCO'}}:{event:{id:8,title:'Our potluck'},branding:{agencyName:'ITSCO'},agencies:[{name:'ITSCO'}],organizationSlug:'itsco'}}));
    const wrapper=await render();expect(button(wrapper,'Attending')).toBeDefined();
    expect(wrapper.findComponent({name:'StaffPollsPanel'}).props('linkedEventId')).toBe(8);
    await button(wrapper,'Maybe').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/company-events/page/itsco/potluck-8/staff/respond',{response:'maybe'});
    expect(button(wrapper,'Message event group')).toBeDefined();
  });
  it('still shows public details to a signed-in person outside the invitation list',async()=>{
    state.params=reactive({eventOrganization:'itsco',eventSlug:'potluck-8'});
    api.get.mockImplementation(async url=>{if(url.endsWith('/staff'))throw{response:{status:403,data:{error:{message:'This private page is available to event invitees and coordinators.'}}}};return{data:{event:{id:8,title:'Our potluck'},branding:{agencyName:'ITSCO'},agencies:[{name:'ITSCO'}],organizationSlug:'itsco'}};});
    const wrapper=await render();expect(wrapper.get('h1').text()).toBe('Our potluck');
    expect(button(wrapper,'Attending')).toBeUndefined();expect(button(wrapper,'Message event group')).toBeUndefined();
    expect(wrapper.text()).toContain('Contact the organizer');
  });
  it('clears the previous event and ignores its delayed load when navigating between invitations',async()=>{
    let first;api.get.mockImplementation(url => url.includes('/invitation/8/') ? new Promise(resolve => {first=resolve;}) : Promise.resolve({data:{event:{id:9,title:'Current event',isWorkEvent:false},branding:{agencyName:'ITSCO'}}}));
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

  it('shows invitation details without sign-in while protecting interest, messages, check-in and travel', async () => {
    state.signedIn = false;
    api.get.mockResolvedValue({data:{event:{id:8,title:'Team potluck',description:'An evening together',potluckEnabled:true},branding:{agencyName:'ITSCO'},agencies:[{name:'ITSCO'},{name:'Inner Strength'}]}});
    const wrapper = await render();
    expect(wrapper.get('a[href^="/login?redirect="]').exists()).toBe(true);
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(api.get).toHaveBeenCalledWith('/company-events/invitation/8/share-token',{skipAuthRedirect:true,skipGlobalLoading:true});
    expect(wrapper.get('h1').text()).toBe('Team potluck');
    expect(wrapper.text()).toContain('An evening together');
    expect(wrapper.text()).toContain('Hosted by');
    expect(wrapper.text()).toContain('ITSCO');
    expect(wrapper.text()).toContain('Participating agencies');
    expect(wrapper.text()).toContain('Inner Strength');
    expect(wrapper.text()).toContain('Sign in to choose what I’m bringing');
    expect(wrapper.findComponent({name:'StaffPollsPanel'}).exists()).toBe(false);
    expect(wrapper.findComponent({name:'EventConversation'}).exists()).toBe(false);
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
