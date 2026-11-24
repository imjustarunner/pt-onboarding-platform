import {beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
import Board from '../TransitionWeekBoard.vue';
import {emptyTransitionState,transitionTaskCatalog,transitionVideoCatalog} from '../../../../../backend/src/content/transitionWeek.js';
let current;
const people=Array.from({length:6},(_,i)=>({id:i+1,name:`Example Provider ${i+1}`,providerId:i+1,rank:i+1,cohort:Math.floor(i/5)+1,directCreditHours:(i+1)*3.25,totalCreditHours:(i+1)*4,currentTierCredits:3,serviceEntries:i+1,payrollUnits:4}));
const result=(id=2)=>({revision:0,catalog:transitionTaskCatalog(id),videoCatalog:transitionVideoCatalog(id),state:{...emptyTransitionState(),ranking:{key:'payroll-example',rows:people}},removedVideos:[]});
const clone=v=>JSON.parse(JSON.stringify(v));
const button=(w,name)=>w.findAll('button').find(b=>b.text()===name);
async function open(id=2){current=result(id);const w=mount(Board,{props:{agencyId:id,actorId:1}});await flushPromises();return w;}
beforeEach(()=>{vi.clearAllMocks();current=result();m.get.mockImplementation(async(url)=>({data:url.endsWith('/roster')?{people,staff:[...people,{id:99,name:'Example Coordinator'}],payroll:{description:'Last three completed payroll periods',periods:[{id:3},{id:2},{id:1}],excludedWithoutActivity:2}}:url.endsWith('/clients')?{clients:[{id:77,name:'Fictional client',status:'ACTIVE'}]}:url.endsWith('/meetings')?{events:[]}:clone(current)}));m.put.mockImplementation(async(_,body)=>{if(body.action==='workspace_item'){const old=current.state.workspace[body.kind][body.key]||{};current.state.workspace[body.kind][body.key]={...old,...body.patch,checks:{...old.checks,...Object.fromEntries(Object.entries(body.patch.checks||{}).map(([key,done])=>[key,{done,at:'2026-11-23T20:00:00Z',by:1}]))}};}current={...current,revision:current.revision+1,state:body.state||current.state};return {data:clone(current)};});});
it('shows provider-only automatic payroll groups without manual appointment-count inputs',async()=>{
 const w=await open();expect(w.findAll('.tw-person')).toHaveLength(5);expect(w.findAll('.tw-group-nav button')).toHaveLength(2);
 expect(w.get('.tw-person-list').text()).toContain('Example Provider 1');expect(w.findAll('.tw-person-header').map(h=>h.text()).join(' ')).not.toContain('Example Coordinator');
 expect(w.text()).toContain('3.25 direct credits / hours');expect(w.text()).toContain('2 providers with no activity excluded');
 expect(w.find('.tw-ranking input').exists()).toBe(false);expect(w.text()).not.toContain('Completed in app');
 expect(m.put).not.toHaveBeenCalled();w.unmount();
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
it('keeps coordinators available as owners without adding them to transition groups',async()=>{
 const w=await open();await w.get('.tw-person-open').trigger('click');await flushPromises();
 expect(w.get('.tw-person .tw-checklist-compact select').text()).toContain('Example Coordinator');
 expect(w.findAll('.tw-person-header').map(h=>h.text()).join(' ')).not.toContain('Example Coordinator');
 const group=w.get('.tw-group-checks');await group.get('select').setValue('99');await group.get('form').trigger('submit');await flushPromises();
 expect(m.put.mock.calls[0][1]).toMatchObject({action:'workspace_item',kind:'groups',rankingKey:'payroll-example'});w.unmount();
});
it('ignores stale reads when the practice changes',async()=>{
 let finish;m.get.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const w=mount(Board,{props:{agencyId:6}});await w.setProps({agencyId:377});await flushPromises();finish({data:{...result(6),revision:99}});await flushPromises();expect(w.text()).not.toContain('revision 99');expect(w.get('#transition-week-title').text()).toContain('Get everyone ready');w.unmount();
});

const personForm=(w,index)=>w.findAll('.tw-person')[index].get('form.tw-checklist-compact');
const checkbox=(form,text)=>form.findAll('label').find(label=>label.text().includes(text)).get('input[type=checkbox]');
it('shows an owner and every transition checkbox for each provider before opening any details',async()=>{
 const w=await open();const forms=w.findAll('.tw-person > form.tw-checklist-compact');expect(forms).toHaveLength(5);
 for(const form of forms){expect(form.isVisible()).toBe(true);expect(form.get('select').isVisible()).toBe(true);expect(form.findAll('input[type=checkbox]').filter(input=>input.isVisible())).toHaveLength(9);}
 expect(forms[0].attributes('aria-label')).toBe('Transition checklist for Example Provider 1');expect(w.find('.tw-person-detail').exists()).toBe(false);
 const form=forms[0];await form.get('select').setValue('99');await form.get('input[type=date]').setValue('2026-11-24');await checkbox(form,'All client records transferred').setValue(true);await checkbox(form,'Google access shut off').setValue(true);await form.trigger('submit');await flushPromises();
 expect(m.put.mock.calls[0][1]).toMatchObject({agencyId:2,action:'workspace_item',kind:'people',key:'1',patch:{ownerUserId:99,dueDate:'2026-11-24',checks:{records:true,google:true}}});
 expect(current.state.workspace.groups).toEqual({});expect(current.state.workspace.people[2]).toBeUndefined();
 await button(w,'Refresh').trigger('click');await flushPromises();expect(personForm(w,0).get('select').element.value).toBe('99');expect(checkbox(personForm(w,0),'Google access shut off').element.checked).toBe(true);
 expect(w.findAll('.tw-person')[0].text()).toContain('2/9 steps done');w.unmount();
});
it('keeps two providers independent when saving one while the other has unsaved edits',async()=>{
 const w=await open();const first=personForm(w,0),second=personForm(w,1);
 await first.get('select').setValue('99');await checkbox(first,'All client records transferred').setValue(true);
 await second.get('select').setValue('1');await checkbox(second,'Google access shut off').setValue(true);
 await first.trigger('submit');await flushPromises();expect(second.get('select').element.value).toBe('1');expect(checkbox(second,'Google access shut off').element.checked).toBe(true);expect(w.vm.beforeNavigate()).toBe(false);
 expect(w.get('.tw-save').text()).toContain('Unsaved changes');expect(w.get('.tw-save').text()).not.toContain('Changes saved');
 await second.trigger('submit');await flushPromises();expect(m.put.mock.calls[1][1]).toMatchObject({revision:1,kind:'people',key:'2',patch:{ownerUserId:1,checks:{google:true,records:false}}});
 expect(current.state.workspace.people[1].checks.records.done).toBe(true);expect(current.state.workspace.people[1].checks.google.done).toBe(false);expect(w.vm.beforeNavigate()).toBe(true);w.unmount();
});
it('retains failed provider edits in that card and blocks leaving the group until saved',async()=>{
 const w=await open();const form=personForm(w,0);await form.get('select').setValue('99');await checkbox(form,'Google access shut off').setValue(true);
 m.put.mockRejectedValueOnce({response:{data:{error:{message:'Example save conflict. Keep these edits.'}}}});await form.trigger('submit');await flushPromises();
 expect(form.text()).toContain('Example save conflict');expect(checkbox(form,'Google access shut off').element.checked).toBe(true);expect(personForm(w,1).text()).not.toContain('Example save conflict');
 await w.findAll('.tw-group-nav button')[1].trigger('click');expect(w.findAll('.tw-person')).toHaveLength(5);
 await form.trigger('submit');await flushPromises();await w.findAll('.tw-group-nav button')[1].trigger('click');await flushPromises();expect(w.findAll('.tw-person')).toHaveLength(1);expect(personForm(w,0).attributes('aria-label')).toContain('Example Provider 6');expect(personForm(w,0).get('select').element.value).not.toBe('99');w.unmount();
});
it('opens a provider’s clients directly inside that provider card, above the shared group checklist',async()=>{
 const w=await open();const first=w.findAll('.tw-person')[0];await button(first,'View clients').trigger('click');await flushPromises();
 expect(first.get('.tw-person-detail').text()).toContain('Clients for Example Provider 1');expect(first.get('.tw-person-detail').text()).toContain('Fictional client');expect(w.find('.tw-group-checks .tw-person-detail').exists()).toBe(false);
 await button(first,'Hide clients').trigger('click');await flushPromises();expect(first.find('.tw-person-detail').exists()).toBe(false);w.unmount();
});
