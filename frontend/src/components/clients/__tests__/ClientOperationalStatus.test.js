import {beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),timezone:'America/Denver'}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
vi.mock('../../../store/userPreferences',()=>({useUserPreferencesStore:()=>({timezone:m.timezone})}));
import Status from '../ClientOperationalStatus.vue';
beforeEach(()=>{vi.clearAllMocks();m.timezone='America/Denver';});
it.each([['America/Denver','10:00 AM MST'],['America/Los_Angeles','9:00 AM PST']])('shows source instants with the configured timezone %s',async(zone,time)=>{
 m.timezone=zone;m.get.mockResolvedValue({data:{scope:'Recorded sessions',sessions:[{sessionId:261,startsAt:'2026-11-10T17:00:00.000Z',sessionStatus:'scheduled',noteStatus:'missing',claimStatus:'none'}]}});
 const w=mount(Status,{props:{clientId:2271}});await flushPromises();expect(w.text()).toContain('Nov 10, 2026');expect(w.text()).toContain(time);expect(w.text()).not.toContain('T17:00');expect(w.text()).toContain('scheduled');w.unmount();
});
it('does not show one child’s delayed sessions for the next child',async()=>{
 let done;m.get.mockReturnValueOnce(new Promise(r=>done=r)).mockResolvedValue({data:{scope:'Selected child',sessions:[]}});const w=mount(Status,{props:{clientId:2271}});await w.setProps({clientId:2474});await flushPromises();done({data:{scope:'Previous child',sessions:[{sessionId:261,startsAt:'2026-11-10T17:00:00.000Z'}]}});await flushPromises();expect(w.text()).not.toContain('Nov 10');expect(w.text()).toContain('Selected child');w.unmount();
});
