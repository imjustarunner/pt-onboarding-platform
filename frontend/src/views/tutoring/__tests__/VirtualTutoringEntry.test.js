import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),replace:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{appointmentId:'12'},query:{clientId:'4',agencyId:'6'}}),useRouter:()=>({replace:m.replace})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{name:'Next Level Up'}})}));
import Entry from '../VirtualTutoringSessionView.vue';
beforeEach(()=>vi.clearAllMocks());afterEach(()=>{vi.useRealTimers();sessionStorage.clear();});
const mountEntry=()=>mount(Entry,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});
it('shows an opening time at 45 minutes early without creating a visit or admitting anyone',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-21T19:15:00Z'));
 m.get.mockResolvedValue({data:{available:false,virtual:true,opensAt:'2026-10-21T19:30:00Z',closesAt:'2026-10-21T21:30:00Z',timeZone:'America/Denver'}});
 const w=mountEntry();await flushPromises();expect(w.text()).toContain('You’re a little early');expect(w.text()).toContain('1:30 PM MDT');expect(m.post).not.toHaveBeenCalled();expect(m.replace).not.toHaveBeenCalled();w.unmount();
});
it('at 10 minutes early creates a waiting visit and carries its credential to the same permanent office',async()=>{
 m.get.mockResolvedValue({data:{available:true,virtual:true,appointmentId:12,source:'appointment',officeSlug:'sample'}});m.post.mockResolvedValue({data:{officeSlug:'sample',lobby:{id:9,credential:'synthetic',guestDisplayName:'Parent',status:'waiting'}}});
 const w=mountEntry();await flushPromises();expect(m.post.mock.calls[0][0]).toBe('/tutoring-learning-os/clients/4/office-visit');expect(m.replace).toHaveBeenCalledWith('/join/my-room/sample');expect(JSON.parse(sessionStorage.getItem('auricwell-office-visit:sample')).id).toBe(9);expect(m.post.mock.calls.some(([url])=>url.includes('/admit'))).toBe(false);w.unmount();
});
it('does not reuse a cancelled or closed appointment link',async()=>{m.get.mockResolvedValue({data:{available:false,virtual:true,opensAt:null}});const w=mountEntry();await flushPromises();expect(w.text()).toContain('closed or the appointment has changed');expect(m.post).not.toHaveBeenCalled();w.unmount();});
