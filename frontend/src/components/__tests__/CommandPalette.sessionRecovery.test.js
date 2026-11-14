import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils';
import {createPinia,setActivePinia} from 'pinia';
import {createMemoryHistory,createRouter} from 'vue-router';
import Palette from '../CommandPalette.vue';
import {useAuthStore} from '../../store/auth';
import {useAgencyStore} from '../../store/agency';
import {useSessionLockStore} from '../../store/sessionLock';
import {useCommandPalette} from '../../composables/useCommandPalette';
vi.mock('../../services/api',()=>({default:{get:vi.fn().mockResolvedValue({data:{}}),post:vi.fn().mockResolvedValue({data:{}})}}));
let wrapper,pinia,auth,agencies,lock,router;const palette=useCommandPalette();
beforeEach(async()=>{localStorage.clear();palette.bindContext(0,0,null);pinia=createPinia();setActivePinia(pinia);auth=useAuthStore();auth.user={id:1465,role:'school_staff'};auth.token='fictional-login-1';agencies=useAgencyStore();agencies.currentAgency={id:451,slug:'cedar-demo',organization_type:'school'};lock=useSessionLockStore();router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<span />'}}]});await router.push('/cedar-demo/school-portal');});
afterEach(()=>{wrapper?.unmount();palette.bindContext(0,0,null);document.body.innerHTML='';});
async function start(){wrapper=mount(Palette,{attachTo:document.body,global:{plugins:[pinia,router]}});palette.openPalette('nav');await flushPromises();return new DOMWrapper(document.body);}
it('hides Quick Nav while warning/locked and restores the same unsent input after normal recovery',async()=>{
 const body=await start();await body.get('.cp-input').setValue('QA 1113 held note B');lock.warningActive=true;await flushPromises();expect(body.find('.cp-overlay').exists()).toBe(false);expect(palette.draftQuery.value).toBe('QA 1113 held note B');
 lock.warningActive=false;window.dispatchEvent(new Event('pt:session-resumed'));await flushPromises();expect(body.get('.cp-input').element.value).toBe('QA 1113 held note B');lock.isLocked=true;await flushPromises();expect(body.find('.cp-overlay').exists()).toBe(false);lock.unlock();await flushPromises();expect(body.get('.cp-input').element.value).toBe('QA 1113 held note B');
});
it('retains unsubmitted text on reopen or remount in the same actor, agency and login',async()=>{
 let body=await start();await body.get('.cp-input').setValue('Held, never sent');palette.closePalette();await flushPromises();palette.openPalette('nav');await flushPromises();expect(body.get('.cp-input').element.value).toBe('Held, never sent');wrapper.unmount();wrapper=null;body=await start();expect(body.get('.cp-input').element.value).toBe('Held, never sent');
});
it.each(['actor','agency','credential','logout'])('clears held input at a real %s boundary',async boundary=>{
 const body=await start();await body.get('.cp-input').setValue('Private held query');if(boundary==='actor')auth.user={id:2000,role:'school_staff'};if(boundary==='agency')agencies.currentAgency={id:999,slug:'other-school'};if(boundary==='credential')auth.token='fictional-new-login';if(boundary==='logout')auth.user=null;await flushPromises();expect(palette.draftQuery.value).toBe('');expect(body.find('.cp-overlay').exists()).toBe(false);
});
