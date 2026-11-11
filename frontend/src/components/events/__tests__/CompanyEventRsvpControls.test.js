import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{post:vi.fn()}}));
import api from '../../../services/api';
import Controls from '../CompanyEventRsvpControls.vue';
let wrapper;
const event={id:8,agencyId:9,isInvitedCompanyEvent:true,myRsvp:'yes',canRsvp:true,mandatory:false,staffPageUrl:'/company-events/8/staff/private'};
beforeEach(()=>{vi.clearAllMocks();api.post.mockResolvedValue({data:{response:'maybe'}});});
afterEach(()=>wrapper?.unmount());
const render=props=>{wrapper=mount(Controls,{props:{event:{...event,...props}}});return wrapper;};
const choice=value=>wrapper.findAll('button').find(button=>button.text()===value);
describe('company event RSVP controls',()=>{
 it('shows the saved response and stable details page without taking action',()=>{
   render();expect(wrapper.text()).toContain('Your RSVP: Yes');expect(choice('Yes').attributes('aria-pressed')).toBe('true');expect(wrapper.get('a').attributes('href')).toBe(event.staffPageUrl);
   expect(wrapper.text()).toContain('Details, votes & potluck');expect(api.post).not.toHaveBeenCalled();
 });
 it('saves an explicit change through canonical companyEventId and refreshes dashboard and schedule',async()=>{
   render({id:-123,companyEventId:8});const changed=vi.fn(),schedule=vi.fn();window.addEventListener('company-event-rsvp-changed',changed);window.addEventListener('pt-schedule-refresh',schedule);
   try{await choice('Maybe').trigger('click');await flushPromises();
     expect(api.post).toHaveBeenCalledWith('/me/company-events/8/respond',{response:'maybe',agencyId:9},{params:{agencyId:9}});
     expect(wrapper.text()).toContain('Your RSVP: Maybe');expect(wrapper.text()).toContain('Tentative');expect(choice('Maybe').attributes('aria-pressed')).toBe('true');
     expect(changed.mock.calls[0][0].detail).toEqual({eventId:8,agencyId:9,response:'maybe'});expect(schedule).toHaveBeenCalledTimes(1);
   }finally{window.removeEventListener('company-event-rsvp-changed',changed);window.removeEventListener('pt-schedule-refresh',schedule);}
 });
 it('preserves the saved RSVP and lets the person retry after a server rejection',async()=>{
   api.post.mockRejectedValue({response:{data:{error:{message:'You are no longer invited.'}}}});render();await choice('No').trigger('click');await flushPromises();
   expect(wrapper.text()).toContain('Your RSVP: Yes');expect(wrapper.get('[role=alert]').text()).toContain('no longer invited');expect(wrapper.emitted('changed')).toBeUndefined();expect(choice('No').attributes('disabled')).toBeUndefined();
 });
 it('ignores a late save response after switching to another event',async()=>{
   let finish;api.post.mockReturnValue(new Promise(resolve=>{finish=resolve;}));render();await choice('No').trigger('click');
   await wrapper.setProps({event:{...event,id:10,myRsvp:'maybe'}});finish({data:{response:'no'}});await flushPromises();
   expect(wrapper.text()).toContain('Your RSVP: Maybe');expect(wrapper.emitted('changed')).toBeUndefined();
 });
 it('keeps closed RSVPs read-only and preserves the details link',()=>{
   render({canRsvp:false,mandatory:true});expect(wrapper.text()).toContain('Required attendance');expect(wrapper.text()).toContain('changes are closed');
   expect(wrapper.findAll('button').every(button=>button.attributes('disabled')!==undefined)).toBe(true);expect(wrapper.get('a').attributes('href')).toBe(event.staffPageUrl);
 });
 it('does not add company RSVP actions to a program or school record',()=>{render({isInvitedCompanyEvent:false});expect(wrapper.findAll('button')).toHaveLength(0);expect(api.post).not.toHaveBeenCalled();});
});
