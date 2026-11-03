import {afterEach,describe,it,expect,vi} from 'vitest';
import {defineComponent,h} from 'vue';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import {createPinia} from 'pinia';
import {useClientQuickLook} from '../../../composables/useClientQuickLook';
import ClientQuickLook from '../../../components/clients/ClientQuickLook.vue';
import WorkspaceShell from '../../WorkspaceShell.vue';
import {demoResponse,actor,demoTaskLists} from '../fixtures';
let wrapper;
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.useRealTimers();});
const presentation={getInitialsStyle:()=>({}),getClientDisplay:c=>c.initials,getStatusPillStyle:()=>({}),formatClientStatus:c=>c.status,affiliationDisplayLabel:()=> 'Practice',formatDate:value=>value||'—',getDocumentStatusTone:()=> 'complete',getDocumentStatusIcon:()=> '✓',formatDocumentStatusSummary:()=> 'On file',roiExpiryClass:()=>''};
describe('shared Clients hover preview',()=>{
 it('waits420ms, allows250ms to enter the panel, and retains pinned previews',()=>{
  vi.useFakeTimers();let preview;
  wrapper=mount(defineComponent({setup(){preview=useClientQuickLook();return()=>h('span');}}));
  const first={id:1},second={id:2};preview.scheduleQuickView(first);vi.advanceTimersByTime(419);expect(preview.quickViewClient.value).toBeNull();vi.advanceTimersByTime(1);expect(preview.quickViewClient.value.id).toBe(1);
  preview.cancelQuickView();vi.advanceTimersByTime(200);preview.cancelQuickViewClose();vi.advanceTimersByTime(100);expect(preview.quickViewClient.value.id).toBe(1);
  preview.pinClientPanel(first);preview.scheduleQuickViewClose();vi.advanceTimersByTime(1000);expect(preview.quickViewClient.value.id).toBe(1);
  preview.scheduleQuickView(second);vi.advanceTimersByTime(420);expect(preview.quickViewClient.value.id).toBe(2);
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(preview.quickViewClient.value).toBeNull();
  preview.scheduleQuickView(first);wrapper.unmount();wrapper=null;vi.advanceTimersByTime(1000);expect(preview.quickViewClient.value).toBeNull();
 });
 it('reuses the same non-modal panel, permits only supplied edit actions, and emits full-view/close',async()=>{
  const client={id:12,full_name:'Fictional Person',initials:'FP',status:'ACTIVE',provider_name:'Fictional Provider'};
  wrapper=mount(ClientQuickLook,{props:{client,presentation,canEdit:false},global:{stubs:{transition:false}}});
  expect(wrapper.get('[role=complementary]').attributes('aria-label')).toBe('Client detail panel');expect(wrapper.find('[role=dialog]').exists()).toBe(false);
  expect(wrapper.text()).toContain('Fictional Provider');expect(wrapper.text()).not.toContain('Edit status');await wrapper.get('.cm-drawer-open-btn').trigger('click');expect(wrapper.emitted('open')[0]).toEqual([client]);
  await wrapper.setProps({canEdit:true});await wrapper.get('.cm-drawer-footer-btn--secondary').trigger('click');expect(wrapper.emitted('edit-status')[0]).toEqual([client]);expect(wrapper.emitted('close')).toHaveLength(1);
 });
});
describe('workspace space and return navigation',()=>{
 it.each(['documentation','billing'])('removes the outer sidebar/header for %s and supplies a return route',async section=>{
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:organizationSlug/:section',component:{template:'<span />'}}]});await router.push('/meadowbrook/'+section);await router.isReady();
  wrapper=mount(WorkspaceShell,{props:{actor,slug:'meadowbrook',section,navigation:[],websiteBase:'/',demo:true},global:{plugins:[router,createPinia()]},slots:{default:'<div>Shared workspace</div>'}});await flushPromises();
  expect(wrapper.find('.aw-sidebar').exists()).toBe(false);expect(wrapper.find('.aw-topbar').exists()).toBe(false);expect(wrapper.get('.aw-workspace-return a').attributes('href')).toBe('/meadowbrook/overview');expect(wrapper.get('#aw-main').classes()).toContain('aw-content--workspace');
 });
 it('starts schedule navigation collapsed, reveals it on hover, and closes on leave',async()=>{
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:organizationSlug/:section',component:{template:'<span />'}}]});await router.push('/meadowbrook/appointments');
  wrapper=mount(WorkspaceShell,{props:{actor,slug:'meadowbrook',section:'appointments',navigation:[],websiteBase:'/',demo:true},global:{plugins:[router,createPinia()]}});
  expect(wrapper.classes()).toContain('aw-collapsed');await wrapper.get('.aw-sidebar').trigger('mouseenter');expect(wrapper.classes()).toContain('aw-sidebar-revealed');await wrapper.get('.aw-sidebar').trigger('mouseleave');expect(wrapper.classes()).not.toContain('aw-sidebar-revealed');
 });
});
describe('real task-tool fixture contract',()=>{
 it('supplies task/list data and the same Overview task links without mutating fixtures',()=>{
  const tasks=demoResponse('/tasks',{params:{view:'assigned'}});expect(tasks.filter(t=>t.status!=='completed')).toHaveLength(3);
  for(const list of demoTaskLists){const active=demoResponse(`/task-lists/${list.id}/tasks`,{params:{status:'open'}});expect(active).toHaveLength(list.task_count);expect(active.every(task=>task.task_list_id===list.id)).toBe(true);expect(demoResponse(`/task-lists/${list.id}`).members).not.toHaveLength(0);}
  const billingTask=demoResponse('/tasks/990504');expect(billingTask.assigned_to_user_id).toBe(990115);expect(billingTask.assignee_first_name).toBe('Quinn');expect(demoResponse('/task-lists/990602').members.map(member=>member.first_name)).toEqual(['Avery','Quinn','Riley']);
  for(const method of ['post','put','patch','delete'])expect(()=>demoResponse('/tasks/990501/complete',{method})).toThrow(/nothing was saved/);
  expect(demoResponse('/tasks/990501').status).toBe('pending');expect(()=>demoResponse('/task-lists/1/tasks')).toThrow(/outside/);expect(()=>demoResponse('/me/tasks/1/comments')).toThrow(/outside/);
 });
});
