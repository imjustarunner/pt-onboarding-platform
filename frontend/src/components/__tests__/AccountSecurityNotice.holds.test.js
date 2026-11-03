import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn(),auth:null}));
vi.mock('../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>mocks.auth}));
import Notice from '../AccountSecurityNotice.vue';
let wrapper;
const mountNotice=()=>{wrapper=mount(Notice,{global:{stubs:{RouterLink:true}}});return wrapper;};
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
