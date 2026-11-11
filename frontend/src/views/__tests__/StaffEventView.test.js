import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
vi.mock('../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { eventId: '90' }, query: { agencyId: '2' } }) }));
import api from '../../services/api';
import View from '../StaffEventView.vue';
enableAutoUnmount(afterEach);
beforeEach(() => vi.resetAllMocks());
it('loads the authenticated internal event route with its agency and renders plain event details', async () => {
  api.get.mockResolvedValue({ data: { title: 'Holiday dinner', startsAt: '2026-12-04T01:00:00Z', endsAt: '2026-12-04T03:00:00Z', timezone: 'America/Denver', description: 'Dinner with the team', locationName: 'Meeting room', locationAddress: '100 Example Street' } });
  const w = mount(View); await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/me/company-events/90', { params: { agencyId: 2 } });
  expect(w.get('h1').text()).toBe('Holiday dinner'); expect(w.text()).toContain('Meeting room'); expect(w.text()).toContain('Dinner with the team');
});
it('shows an unavailable state when the event is no longer accessible instead of linking to its public page', async () => {
  api.get.mockRejectedValue({ response: { data: { error: { message: 'Event details are not available for your account.' } } } });
  const w = mount(View); await flushPromises();
  expect(w.get('[role=alert]').text()).toContain('not available'); expect(w.find('article').exists()).toBe(false); expect(w.find('a').exists()).toBe(false);
});
it('connects a linked event to the invited user’s existing RSVP and potluck signup',async()=>{
 api.get.mockResolvedValue({data:{title:'Potluck',potluckEnabled:true,organizerProviding:['Drinks'],needList:[{id:8,itemName:'Fruit salad',mine:true,claimed:true}],rsvpUrl:'/event-rsvp/personal-invite'}});
 const w=mount(View);await flushPromises();expect(w.text()).toContain('The organizer is providing: Drinks');expect(w.text()).toContain('You are bringing this');expect(w.get('a').attributes('href')).toBe('/event-rsvp/personal-invite');
});
it('lets a company invitee update an RSVP directly and keeps a single private details link',async()=>{
 api.get.mockResolvedValue({data:{id:90,agencyId:2,title:'Anniversary',isInvitedCompanyEvent:true,myRsvp:'yes',canRsvp:true,staffPageUrl:'/company-events/90/staff/private',rsvpUrl:'/event-rsvp/personal-invite'}});
 api.post.mockResolvedValue({data:{response:'no'}});const w=mount(View);await flushPromises();expect(w.text()).toContain('Your RSVP: Yes');
 await w.findAll('button').find(button=>button.text()==='No').trigger('click');await flushPromises();expect(w.text()).toContain('Your RSVP: No');
 expect(api.post).toHaveBeenCalledWith('/me/company-events/90/respond',{response:'no',agencyId:2},{params:{agencyId:2}});expect(w.findAll('a')).toHaveLength(1);expect(w.get('a').attributes('href')).toBe('/company-events/90/staff/private');
});
