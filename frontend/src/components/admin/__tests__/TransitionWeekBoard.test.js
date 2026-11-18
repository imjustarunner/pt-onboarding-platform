import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
import Board from '../TransitionWeekBoard.vue';
import {emptyTransitionState,transitionTaskCatalog,transitionVideoCatalog} from '../../../../../backend/src/content/transitionWeek.js';
let current;
const people=Array.from({length:6},(_,i)=>({id:i+1,name:`Example Employee ${i+1}`,appCompleted:i===5?0:(i+1)*4,appUpcoming:2}));
const result=(id=2)=>({revision:0,catalog:transitionTaskCatalog(id),videoCatalog:transitionVideoCatalog(id),state:emptyTransitionState(),removedVideos:[]});
const clone=v=>JSON.parse(JSON.stringify(v));
const button=(w,name)=>w.findAll('button').find(b=>b.text()===name);
async function open(id=2){current=result(id);const w=mount(Board,{props:{agencyId:id,actorId:1}});await flushPromises();return w;}
beforeEach(()=>{vi.clearAllMocks();current=result();m.get.mockImplementation(async(url)=>({data:url.endsWith('/roster')?{people}:url.endsWith('/clients')?{clients:[{id:77,name:'Fictional client',status:'ACTIVE'}]}:url.endsWith('/meetings')?{events:[]}:clone(current)}));m.put.mockImplementation(async(_,body)=>{current={...current,revision:current.revision+1,state:body.state||current.state};return {data:clone(current)};});});
it('loads actual employee names into five-person previews and keeps missing source counts unknown',async()=>{
 const w=await open();expect(w.findAll('.tw-person')).toHaveLength(5);expect(w.text()).toContain('Example Employee 1');expect(w.text()).toContain('proposed order');
 expect(w.get('[aria-label="Example Employee 6 completed sessions"]').element.value).toBe('');
 expect(button(w,'Confirm order & create groups of five').element.disabled).toBe(true);
 expect(w.text()).not.toContain('Session counts CSV');expect(w.text()).not.toContain('Publish denominators');w.unmount();
});
it('does not show already-finished provider update work or totals for ITSCO',async()=>{
 const w=await open();await button(w,'Practice checklist0/44')?.trigger('click');
 expect(w.findAll('.transition-task').some(t=>t.text().includes('provider update'))).toBe(false);
 expect(w.find('.tw-totals').text()).not.toContain('Provider updates');w.unmount();
});
it('saves evidence with revisions and retains edits after a conflict',async()=>{
 const w=await open(6);const input=w.get('.transition-task input');await input.setValue('Assigned reviewer');expect(w.vm.beforeNavigate()).toBe(false);
 m.put.mockRejectedValueOnce({response:{data:{error:{message:'Board changed; refresh after keeping your changes.'}}}});
 await button(w,'Save checklist & videos').trigger('click');await flushPromises();expect(input.element.value).toBe('Assigned reviewer');expect(w.text()).toContain('Unsaved changes');
 await button(w,'Save checklist & videos').trigger('click');await flushPromises();expect(m.put).toHaveBeenLastCalledWith('/provider-scheduling/transition-week',expect.objectContaining({agencyId:6,revision:0,action:'save'}));expect(w.vm.beforeNavigate()).toBe(true);w.unmount();
});
it('opens existing clients by named employee and uses the selected agency for records and scheduling',async()=>{
 const w=await open(377);await w.get('.tw-person-open').trigger('click');await flushPromises();
 expect(m.get).toHaveBeenCalledWith('/provider-scheduling/transition-workspace/clients',{params:{agencyId:377,providerId:1}});
 expect(w.text()).toContain('Fictional client');expect(w.get('.tw-client-actions a').attributes('href')).toContain('/tisi/admin/clients?agencyId=377&clientId=77');
 await button(w,'Schedule Inner Strength sessions').trigger('click');expect(w.emitted('open-tools')[0][0]).toMatchObject({providerId:1,tab:'agenda',practice:{id:377}});w.unmount();
});
it('preselects the five current group members for an invitation without sending on open',async()=>{
 const w=await open();await button(w,'Schedule / invite this group').trigger('click');await flushPromises();
 const dialog=w.get('[role=dialog]');expect(dialog.text()).toContain('5 selected');expect(dialog.findAll('input[type=checkbox]').filter(i=>i.element.checked)).toHaveLength(6);expect(m.put).not.toHaveBeenCalled();w.unmount();
});
it('retains missing counts as null in saved ranking drafts and blocks unreviewed freezing',async()=>{
 const w=await open();await w.get('[aria-label="Example Employee 1 completed sessions"]').setValue('');await button(w,'Save counts for later').trigger('click');await flushPromises();
 expect(m.put.mock.calls[0][1]).toMatchObject({action:'ranking_draft',rows:expect.arrayContaining([{providerId:1,completedFourWeeks:null,upcomingWeek:2}])});expect(button(w,'Confirm order & create groups of five').element.disabled).toBe(true);w.unmount();
});
it('ignores stale reads when the practice changes',async()=>{
 let finish;m.get.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const w=mount(Board,{props:{agencyId:6}});await w.setProps({agencyId:377});await flushPromises();finish({data:{...result(6),revision:99}});await flushPromises();expect(w.text()).not.toContain('revision 99');expect(w.get('#transition-week-title').text()).toContain('Get everyone ready');w.unmount();
});
