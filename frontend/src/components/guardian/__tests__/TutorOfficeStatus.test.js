import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,afterEach} from 'vitest';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../composables/usePortalCareApi',()=>({usePortalCareApi:()=>api}));
import Status from '../TutorOfficeStatus.vue';
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();sessionStorage.clear();});
it('does not expose availability or open a chat outside the scheduled window',async()=>{
 api.get.mockResolvedValue({data:{offices:[]}});const w=mount(Status,{props:{clientId:4}});await flushPromises();expect(w.text()).toContain('30 minutes before');expect(w.find('button').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('shows status and opens a private chat only after the visitor chooses to message',async()=>{
 vi.useFakeTimers();let offices=[{appointmentId:12,source:'learning_session',providerName:'Timmy',officeSlug:'sample',joinUrl:'/join/my-room/sample',virtual:true,availability:'in_session'}];
 api.get.mockImplementation(async url=>({data:url.endsWith('/messages')?{messages:[],canSend:true}:{offices}}));api.post.mockResolvedValue({data:{lobby:{id:8,credential:'a'.repeat(43),guestDisplayName:'Demo parent'}}});
 const w=mount(Status,{props:{clientId:4}});await flushPromises();expect(w.text()).toContain('Timmy is currently in a session');expect(w.find('a').attributes('href')).toBe('/join/my-room/sample');expect(api.post).not.toHaveBeenCalled();
 await w.find('button').trigger('click');await flushPromises();expect(api.post.mock.calls[0][0]).toBe('/tutoring-learning-os/clients/4/office-visit');expect(w.text()).toContain('Only you and Timmy');expect(JSON.parse(sessionStorage.getItem('auricwell-office-visit:sample')).id).toBe(8);
 offices=[];await vi.advanceTimersByTimeAsync(15000);await flushPromises();expect(w.find('.office-messages').exists()).toBe(false);expect(w.text()).not.toContain('Timmy is currently');w.unmount();
});

it('changes office scope for the same child immediately and rejects a late response from the previous service',async()=>{
 const {ref}=await import('vue');const care=ref({clientId:2545,agencyId:453,serviceId:1038});let releaseOld;
 api.get.mockImplementationOnce(()=>new Promise(resolve=>releaseOld=resolve)).mockResolvedValue({data:{offices:[]}});
 const w=mount(Status,{props:{clientId:2545},global:{provide:{portalCareContext:care}}});await flushPromises();care.value={...care.value,serviceId:1042};await flushPromises();expect(api.get).toHaveBeenCalledTimes(2);
 releaseOld({data:{offices:[{appointmentId:324,source:'learning_session',providerName:'Old tutor',officeSlug:'old',virtual:true}]}});await flushPromises();expect(w.text()).not.toContain('Old tutor');expect(w.find('a').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();w.unmount();
});

it('uses an appointment-specific join link and the existing authenticated learning-team messages for a booked visit',async()=>{api.get.mockResolvedValue({data:{offices:[{appointmentId:359,source:'appointment',providerName:'Finley QA',joinUrl:'/tutoring-session/appointment/359?clientId=2547&agencyId=453',virtual:true,availability:'available'}]}});const w=mount(Status,{props:{clientId:2547}});await flushPromises();const links=w.findAll('a');expect(links[0].attributes('href')).toContain('/tutoring-session/appointment/359');expect(links[1].attributes('href')).toContain('panel=messages');expect(api.post).not.toHaveBeenCalled();expect(w.text()).not.toContain('Tutor’s office');w.unmount();});
