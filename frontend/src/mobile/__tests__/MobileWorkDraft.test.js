import {expect,it,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';import {createRouter,createMemoryHistory} from 'vue-router';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));vi.mock('axios',()=>({default:api}));
import QuickView from '../../views/QuickViewAccessView.vue';
it('does not overwrite session notes typed while a work item opens its tools',async()=>{
 let finish;const pending=new Promise(resolve=>finish=resolve);api.get.mockImplementation(async url=>url.endsWith('/note-aid/tools')?pending:{data:{preferences:{swipeLeft:'archive',swipeRight:'read',pinnedNavigation:['calendar','home','tasks'],usage:{}}}});api.post.mockResolvedValue({data:{ok:true}});
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span/>'}}]});await router.push('/mobile/workspace?view=mywork');
 const wrapper=mount(QuickView,{props:{mobileSession:{sessionToken:'scoped',userId:1,agencyId:10,expiresAt:'2099-01-01',profile:{workspace:{name:'Test'},appLock:{method:'none'}}}},global:{plugins:[router],stubs:{MobileMessages:true,MobileMyWork:{emits:['draft'],template:`<button class="prepare-draft" @click="$emit('draft',{date:'2026-11-06',clientName:'Example Client'})">Prepare</button>`},QuickViewMusicDock:true,QuickViewPresence:true}}});await flushPromises();
 await wrapper.get('.prepare-draft').trigger('click');await flushPromises();await wrapper.get('textarea[aria-label="Note input"]').setValue('DO NOT OVERWRITE MY NEW TEXT');
 finish({data:{tools:[{id:'clean',name:'Clean + Bulletize'}]}});await flushPromises();expect(wrapper.get('textarea[aria-label="Note input"]').element.value).toBe('DO NOT OVERWRITE MY NEW TEXT');wrapper.unmount();
});

it('opens the directory Message action in the scoped mobile conversation route',async()=>{
 api.get.mockImplementation(async url=>({data:url.endsWith('/directory')?{providers:[{id:2,displayName:'Jordan Example',credential:'LPC',email:'jordan@example.invalid'}],schoolStaff:[]}:url.endsWith('/messages/preferences')?{preferences:{pinnedNavigation:['calendar','home','tasks'],usage:{}}}:{}}));api.post.mockResolvedValue({data:{threadId:45}});
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span/>'}}]});await router.push('/mobile/workspace?view=contacts');
 const wrapper=mount(QuickView,{props:{mobileSession:{sessionToken:'scoped',userId:1,agencyId:10,expiresAt:'2099-01-01',profile:{workspace:{name:'Test'},appLock:{method:'none'}}}},global:{plugins:[router],stubs:{MobileMessages:true,QuickViewMusicDock:true,QuickViewPresence:true}}});await flushPromises();
 await wrapper.get('.qv-contact-row button').trigger('click');await flushPromises();expect(router.currentRoute.value.query).toEqual({view:'home',suite:'direct',threadId:'45'});wrapper.unmount();
});
