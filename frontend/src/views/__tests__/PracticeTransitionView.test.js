import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import {createMemoryHistory,createRouter} from 'vue-router';
const m=vi.hoisted(()=>({get:vi.fn(),allowed:true}));
vi.mock('../../services/api',()=>({default:{get:m.get}}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>({user:{id:91,role:'admin'}})}));
vi.mock('../../components/admin/AuricWellTransitionWorkbench.vue',()=>({default:{template:'<div>Import tools</div>'}}));
vi.mock('../../components/admin/TransitionWeekBoard.vue',()=>({default:{props:['agencyId','actorId'],template:'<div data-testid="board">{{agencyId}}</div>',setup(_, {expose}){expose({beforeNavigate:()=>m.allowed});}}}));
import View from '../PracticeTransitionView.vue';
const practices=[{id:6,slug:'nlu',name:'Next Level Up'},{id:2,slug:'itsco',name:'ITSCO'},{id:377,slug:'tisi',name:'Inner Strength'}];
beforeEach(()=>{vi.clearAllMocks();m.allowed=true;m.get.mockResolvedValue({data:{practices}});});
async function open(path='/practice-transition'){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/practice-transition',component:View},{path:'/auricwell-operations',component:{template:'<div />'}}]});await router.push(path);await router.isReady();const w=mount(View,{global:{plugins:[router]}});await flushPromises();return {w,router};}
it('defaults to ITSCO regardless of prior selected agency and switches within its own three-practice interface',async()=>{
 localStorage.setItem('currentAgency',JSON.stringify({id:6}));const {w,router}=await open();expect(w.get('[data-testid=board]').text()).toBe('2');
 expect(w.findAll('.tw-practices button')).toHaveLength(3);await w.findAll('.tw-practices button').find(b=>b.text()==='Next Level Up').trigger('click');await flushPromises();expect(router.currentRoute.value.fullPath).toBe('/practice-transition?practice=nlu');expect(w.get('[data-testid=board]').text()).toBe('6');expect(JSON.parse(localStorage.getItem('currentAgency')).id).toBe(6);w.unmount();
});
it('holds company switches with unsaved work and never offers inaccessible practices',async()=>{
 m.get.mockResolvedValue({data:{practices:[practices[0],practices[1]]}});const {w}=await open();m.allowed=false;await w.findAll('.tw-practices button').find(b=>b.text()==='Next Level Up').trigger('click');await flushPromises();expect(w.get('[data-testid=board]').text()).toBe('2');expect(w.text()).not.toContain('Inner Strength');w.unmount();
});
it('honors a shared NLU link only when that practice is authorized',async()=>{
 const {w}=await open('/practice-transition?practice=nlu');expect(w.get('[data-testid=board]').text()).toBe('6');w.unmount();
 m.get.mockResolvedValue({data:{practices:[practices[1]]}});const other=await open('/practice-transition?practice=nlu');expect(other.w.get('[data-testid=board]').text()).toBe('2');other.w.unmount();
});
