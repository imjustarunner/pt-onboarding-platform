import {expect,it,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';import {createRouter,createMemoryHistory} from 'vue-router';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));vi.mock('axios',()=>({default:api}));
vi.mock('../../services/api',()=>({default:api}));
import QuickView from '../../views/QuickViewAccessView.vue';
it('opens a work item in its scoped clinical writer without putting client names into the route',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/clinical/context')?{agencyId:10,client:{id:34,maskedName:'Exa**** Cli***',age:14},session:{id:45,serviceCode:'90834',dateOfService:'2026-11-06'},preferences:{defaultMode:'narriva',features:{}},serviceCodes:[],alerts:[]}:url.endsWith('/messages/preferences')?{preferences:{pinnedNavigation:['calendar','home','tasks'],usage:{}}}:{}}));api.post.mockResolvedValue({data:{ok:true}});
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span/>'}}]});await router.push('/mobile/workspace?view=mywork');
 const wrapper=mount(QuickView,{props:{mobileSession:{sessionToken:'scoped',userId:1,agencyId:10,expiresAt:'2099-01-01',profile:{workspace:{name:'Test'},appLock:{method:'none'}}}},global:{plugins:[router],stubs:{MobileMessages:true,MobileMyWork:{emits:['draft'],template:`<button class="prepare-draft" @click="$emit('draft',{id:12,clientId:34,clinicalSessionId:45,clientName:'Example Client'})">Open</button>`},QuickViewMusicDock:true,QuickViewPresence:true}}});await flushPromises();
 await wrapper.get('.prepare-draft').trigger('click');await flushPromises();expect(router.currentRoute.value.query).toMatchObject({view:'clinical',workId:'12',clientId:'34',clinicalSessionId:'45'});expect(router.currentRoute.value.fullPath).not.toContain('Example');
 await wrapper.get('textarea[aria-label="Session Narrative"]').setValue('DO NOT OVERWRITE MY NEW TEXT');await flushPromises();expect(wrapper.get('textarea[aria-label="Session Narrative"]').element.value).toBe('DO NOT OVERWRITE MY NEW TEXT');expect(wrapper.text()).not.toContain('Example Client');wrapper.unmount();
});

it('opens the directory Message action in the scoped mobile conversation route',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/directory')?{providers:[{id:2,displayName:'Jordan Example',credential:'LPC',email:'jordan@example.invalid'}],schoolStaff:[]}:url.endsWith('/messages/preferences')?{preferences:{pinnedNavigation:['calendar','home','tasks'],usage:{}}}:{}}));api.post.mockResolvedValue({data:{threadId:45}});
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span/>'}}]});await router.push('/mobile/workspace?view=contacts');
 const wrapper=mount(QuickView,{props:{mobileSession:{sessionToken:'scoped',userId:1,agencyId:10,expiresAt:'2099-01-01',profile:{workspace:{name:'Test'},appLock:{method:'none'}}}},global:{plugins:[router],stubs:{MobileMessages:true,QuickViewMusicDock:true,QuickViewPresence:true}}});await flushPromises();
 await wrapper.get('.qv-contact-row button').trigger('click');await flushPromises();expect(router.currentRoute.value.query).toEqual({view:'home',suite:'direct',threadId:'45'});wrapper.unmount();
});
