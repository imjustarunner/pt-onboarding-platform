import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),auth:null}));
vi.mock('../../services/api',()=>({default:{get:mocks.get,post:mocks.post}}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>mocks.auth}));
import Notice from '../AccountSecurityNotice.vue';
let wrapper;
const mountNotice=()=>{wrapper=mount(Notice,{global:{stubs:{RouterLink:{template:'<a><slot /></a>'}}}});return wrapper;};
beforeEach(()=>{vi.clearAllMocks();mocks.auth=reactive({user:{id:10}});mocks.get.mockImplementation(async url=>({data:url.endsWith('/activity-protection')?{holds:[{kind:'client_file'}]}:{enabled:true,verified:true}}));});
afterEach(()=>wrapper?.unmount());
it('restores the persisted hold on initial load and after remount without a failed file request',async()=>{
 mountNotice();await flushPromises();expect(wrapper.text()).toContain('Additional access is paused');wrapper.unmount();mountNotice();await flushPromises();expect(wrapper.text()).toContain('Additional access is paused');
});
it('does not mistake allowed staff views for clearing a persistent download hold',async()=>{
 mocks.get.mockImplementation(async url=>({data:url.endsWith('/activity-protection')?{holds:[{kind:'client_file'}],unlimitedFileViews:true}:{verified:true}}));
 mountNotice();await flushPromises();expect(wrapper.text()).toContain('Download, export, and print access is paused');expect(wrapper.text()).toContain('audited document views');
});
it('keeps a known hold when status refresh fails and clears it only after successful empty status',async()=>{
 mountNotice();await flushPromises();mocks.get.mockRejectedValue(new Error('offline'));window.dispatchEvent(new Event('account-security-changed'));await flushPromises();expect(wrapper.text()).toContain('Additional access is paused');expect(wrapper.text()).toContain('could not be checked');
 mocks.get.mockResolvedValue({data:{holds:[],verified:true}});window.dispatchEvent(new Event('account-security-changed'));await flushPromises();expect(wrapper.text()).not.toContain('access is paused');
});
it('does not let an earlier request clear a newly raised hold',async()=>{
 let resolveOld; mocks.get.mockImplementation(url=>url.endsWith('/activity-protection')?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve({data:{verified:true}}));mountNotice();await flushPromises();
 mocks.get.mockRejectedValue(new Error('offline'));window.dispatchEvent(new Event('activity-protection-required'));await flushPromises();resolveOld({data:{holds:[]}});await flushPromises();expect(wrapper.text()).toContain('Additional access is paused');
});

it('sends the hold request with one click and never claims the hold is cleared',async()=>{
 mocks.post.mockResolvedValue({data:{id:'request-a',pending:true}});mountNotice();await flushPromises();
 await wrapper.find('button.request-toggle').trigger('click');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/account-security/activity-protection/requests',{reviewHold:true},{headers:{'X-Account-Security':'1'}});
 expect(wrapper.text()).toContain('Request sent to your privacy reviewer');expect(wrapper.text()).toContain('Additional access is paused');
});
it('shows a failed submission and allows retry without claiming a request was sent',async()=>{
 mocks.post.mockRejectedValue(new Error('offline'));mountNotice();await flushPromises();
 await wrapper.find('button.request-toggle').trigger('click');await flushPromises();expect(wrapper.find('[role="alert"]').text()).toContain('could not be sent');
 expect(wrapper.text()).not.toContain('Request sent to your privacy reviewer');
});

it('distinguishes blocked request volume from affected accounts and file-access requests',async()=>{
 mocks.get.mockImplementation(async url=>({data:url.endsWith('/summary')?{alerts:346,accounts:3,unidentified:2,requests:1}:url.endsWith('/activity-protection')?{holds:[]}:url.endsWith('/requests')?{tickets:[]}:{verified:true,canReviewPrivacy:true}}));
 const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
 mountNotice();await flushPromises();expect(wrapper.text()).toContain('346 unreviewed blocked requests affecting 3 accounts');expect(wrapper.text()).toContain('2 unidentified attempts');expect(wrapper.text()).toContain('1 file-access requests');visibility.mockRestore();
});

it('refreshes a timedown read failure after verified resume without clearing a real hold',async()=>{
 mountNotice();await flushPromises();
 mocks.get.mockRejectedValue({response:{status:423,data:{error:{code:'SESSION_LOCKED'}}}});window.dispatchEvent(new Event('account-security-changed'));await flushPromises();expect(wrapper.text()).toContain('could not be checked');
 mocks.get.mockImplementation(async url=>({data:url.endsWith('/activity-protection')?{holds:[{kind:'client_file'}],unlimitedFileViews:true}:{verified:true}}));
 window.dispatchEvent(new Event('pt:session-resumed'));await flushPromises();expect(wrapper.text()).not.toContain('could not be checked');expect(wrapper.text()).toContain('Download, export, and print access is paused');
});
