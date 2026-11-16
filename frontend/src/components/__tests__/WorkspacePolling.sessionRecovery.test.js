import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import StaffPolls from '../dashboard/StaffPollsPanel.vue';
import Notice from '../AccountSecurityNotice.vue';
import {useSessionLockStore} from '../../store/sessionLock';
import {useAuthStore} from '../../store/auth';
import {useNotificationStore} from '../../store/notifications';
import {useCommunicationsCountsStore} from '../../store/communicationsCounts';
import api from '../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
let pinia,lock,wrapper;const poll={id:12,agencyId:450,title:'Saved team poll',question:'Which day?',options:[{key:'a',label:'Monday'}],closesAt:'2099-01-01T00:00:00Z',canVote:true};
beforeEach(()=>{vi.useFakeTimers();vi.resetAllMocks();localStorage.clear();pinia=createPinia();setActivePinia(pinia);useAuthStore().user={id:1433,role:'provider'};lock=useSessionLockStore();api.get.mockImplementation(async url=>({data:url==='/me/staff-polls'?[poll]:url==='/account-security/activity-protection'?{holds:[{kind:'client_file'}]}:url==='/notifications/counts'?{_total:7}:{verified:true,enabled:true}}));});
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.useRealTimers();});
function open(component,props={}){wrapper=mount(component,{props,global:{plugins:[pinia],stubs:{Teleport:true,RouterLink:{template:'<a><slot/></a>'},FileAccessReviewToasts:true}}});return wrapper;}
it('pauses actual staff-poll timer/focus reads, retains the poll and unsent choice, then resumes once',async()=>{
 open(StaffPolls,{agencyId:450});await flushPromises();await wrapper.get('input[type=radio]').setValue(true);api.get.mockClear();lock.warningActive=true;await vi.advanceTimersByTimeAsync(125000);window.dispatchEvent(new Event('focus'));await flushPromises();expect(api.get).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Saved team poll');expect(wrapper.get('input[type=radio]').element.checked).toBe(true);
 lock.warningActive=false;await vi.advanceTimersByTimeAsync(0);await flushPromises();expect(api.get).toHaveBeenCalledTimes(1);expect(api.get).toHaveBeenCalledWith('/me/staff-polls',expect.objectContaining({params:{agencyId:450}}));expect(wrapper.get('input[type=radio]').element.checked).toBe(true);
});
it('uses the current school/agency after recovery rather than replaying a queued old poll',async()=>{
 open(StaffPolls,{agencyId:450});await flushPromises();lock.warningActive=true;api.get.mockClear();await wrapper.setProps({agencyId:2});await vi.advanceTimersByTimeAsync(90000);expect(api.get).not.toHaveBeenCalled();lock.warningActive=false;await vi.advanceTimersByTimeAsync(0);await flushPromises();expect(api.get.mock.calls.map(([,c])=>c.params.agencyId)).toEqual([2]);
});
it('pauses security protection polling without clearing a known hold and verifies it after resume',async()=>{
 open(Notice);await flushPromises();await wrapper.get('.security-trigger').trigger('click');expect(wrapper.text()).toContain('Additional access is paused');api.get.mockClear();lock.warningActive=true;await vi.advanceTimersByTimeAsync(180000);expect(api.get).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Additional access is paused');expect(wrapper.text()).not.toContain('could not be checked');lock.warningActive=false;await vi.advanceTimersByTimeAsync(0);await flushPromises();expect(api.get.mock.calls.filter(([url])=>url==='/account-security/activity-protection')).toHaveLength(1);
});
it('retains notification/communications counts while paused instead of manufacturing a zero',async()=>{
 const notifications=useNotificationStore(),communications=useCommunicationsCountsStore();await notifications.fetchCounts();communications.openTicketsCount=3;lock.warningActive=true;api.get.mockClear();await notifications.fetchCounts();await communications.fetchCounts();expect(api.get).not.toHaveBeenCalled();expect(notifications.counts._total).toBe(7);expect(communications.openTicketsCount).toBe(3);
});
it('still surfaces a real unexpected423 when the local session was not paused',async()=>{
 api.get.mockRejectedValue({response:{status:423,data:{error:{message:'Session needs recovery.'}}}});open(StaffPolls,{agencyId:450});await flushPromises();expect(wrapper.text()).toContain('Session needs recovery.');expect(api.get).toHaveBeenCalled();
});
