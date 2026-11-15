import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
const m=vi.hoisted(()=>({route:null,agency:null}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({push:vi.fn(),replace:vi.fn()})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>m.agency}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1433,role:'provider'}})}));
vi.mock('../../../store/branding',()=>({useBrandingStore:()=>({})}));
vi.mock('../../../store/organization',()=>({useOrganizationStore:()=>({})}));
import View from '../PlatformChatsView.vue';
let w;
beforeEach(()=>{
 m.route=reactive({path:'/qa/messages',params:{organizationSlug:'qa'},query:{}});
 m.agency=reactive({currentAgency:{id:450},userAgencies:[{id:450,slug:'qa'}]});
});
afterEach(()=>w?.unmount());
it.each([
 {threadId:'379',secure:'1',view:'workspace'},
 {threadId:'379',messageId:'237',secure:'1'},
 {secureClientId:'2560',agencyId:'450',channel:'secure',view:'workspace'}
])('opens secure client links in the subject reader, including historical workspace links: %o',async query=>{
 m.route.query=query;w=shallowMount(View);await flushPromises();
 expect(w.findComponent({name:'MessagesHubShell'}).exists()).toBe(true);
 expect(w.findComponent({name:'MessagesWorkspace'}).exists()).toBe(false);
 expect(m.route.query).toEqual(query);
});
it('keeps ordinary team threads in Team chat and switches readers when the URL changes',async()=>{
 m.route.query={threadId:'379',view:'workspace'};w=shallowMount(View);await flushPromises();
 expect(w.findComponent({name:'MessagesWorkspace'}).exists()).toBe(true);
 m.route.query={threadId:'379',secure:'1'};await flushPromises();
 expect(w.findComponent({name:'MessagesHubShell'}).exists()).toBe(true);
});
