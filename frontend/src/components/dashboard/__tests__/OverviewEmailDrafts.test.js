import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import Links from '../OverviewEmailDrafts.vue';
const mocks=vi.hoisted(()=>({get:vi.fn(),auth:null,lock:null}));
vi.mock('../../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>mocks.auth}));
vi.mock('../../../store/sessionLock',()=>({useSessionLockStore:()=>mocks.lock}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'sample'}})}));
let wrapper;
beforeEach(()=>{vi.useFakeTimers();mocks.auth=reactive({user:{id:5}});mocks.lock=reactive({isLocked:false,warningActive:false});mocks.get.mockReset().mockResolvedValue({data:{draftCount:3,attentionCount:1}});});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
async function create(props={agencyId:2}){wrapper=mount(Links,{props,global:{stubs:{RouterLink:{name:'RouterLink',props:['to'],template:'<a><slot /></a>'}}}});await flushPromises();}
it('links each count to its email folder and refreshes after an autosave',async()=>{
 await create();expect(wrapper.text()).toContain('Email drafts 3');expect(wrapper.findAllComponents({name:'RouterLink'})[0].props('to')).toEqual({path:'/sample/messages',query:{folder:'drafts',channel:'email'}});
 mocks.get.mockResolvedValue({data:{draftCount:2,attentionCount:0}});window.dispatchEvent(new CustomEvent('email-workspace-changed'));await vi.advanceTimersByTimeAsync(750);await flushPromises();
 expect(wrapper.text()).toContain('Email drafts 2');expect(wrapper.text()).not.toContain('needs attention');
});
it('does not fetch for a disabled dashboard or locked session',async()=>{
 await create({agencyId:2,enabled:false});expect(mocks.get).not.toHaveBeenCalled();mocks.lock.isLocked=true;await wrapper.setProps({enabled:true});expect(mocks.get).not.toHaveBeenCalled();
});
it('discards stale counts after changing organization',async()=>{
 let resolveOld;mocks.get.mockReturnValueOnce(new Promise(resolve=>resolveOld=resolve));await create();
 await wrapper.setProps({agencyId:3});await flushPromises();expect(wrapper.text()).toContain('Email drafts 3');
 resolveOld({data:{draftCount:99,attentionCount:99}});await flushPromises();expect(wrapper.text()).not.toContain('99');
 expect(mocks.get).toHaveBeenLastCalledWith('/communications/drafts/summary',expect.objectContaining({params:{agencyId:3},timeout:30000}));
});
it('hides empty counts without introducing an empty card',async()=>{
 mocks.get.mockResolvedValue({data:{draftCount:0,attentionCount:0}});await create();expect(wrapper.find('nav').exists()).toBe(false);
});
