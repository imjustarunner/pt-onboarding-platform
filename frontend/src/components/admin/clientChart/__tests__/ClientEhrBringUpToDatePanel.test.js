import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, onMounted } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
const mocks = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), get: vi.fn(), put: vi.fn() }));
vi.mock('../../../../services/api', () => ({ default: mocks }));
vi.mock('../../../../store/auth', () => ({ useAuthStore: () => ({ user:{id:10,role:'support'} }) }));
import Panel from '../ClientEhrBringUpToDatePanel.vue';
const ReadyAssignments=defineComponent({name:'ClientUpdateAssignments',emits:['ready'],setup(_, {emit,expose}){onMounted(()=>emit('ready',true));expose({prepareLeave:()=>true});},template:'<section data-ready-assignments />'});
const stubs = { ClientUpdateAssignments:ReadyAssignments, NoteAidTreatmentPlanImportReview:true, ClientPayerLinkage:true, ClientTransitionInvitation:true, Teleport:true };
const mountPanel = initialTexts => mount(Panel, { props: { open: true, clientId: 12, agencyId: 2, creationFlow: true, initialIntakeServiceCode: '90791', initialTexts }, global: { stubs } });
async function confirmCompletion(wrapper){const review=wrapper.find('[aria-label="Review records import completion"]');if(review.find('input[type=checkbox]').exists())await review.find('input[type=checkbox]').setValue(true);await review.findAll('button').find(b=>b.text()==='Complete records import').trigger('click');await flushPromises();}
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window,'confirm').mockReturnValue(false); setActivePinia(createPinia()); mocks.patch.mockResolvedValue({ data: {} }); mocks.get.mockResolvedValue({ data: { drafts: {} } }); mocks.put.mockResolvedValue({ data: { revision: 1 } }); });
it('imports supplied demographics and signals completion for the saved client', async () => {
  mocks.post.mockResolvedValue({ data: { parsed: { fullName: 'Synthetic Client' } } });
  const wrapper = mountPanel({ demographics: 'Legal Name: Synthetic Client' }); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/clients/12/demographics/import', expect.objectContaining({ demographics: expect.objectContaining({ fullName: 'Synthetic Client' }) }), expect.anything());
  expect(wrapper.emitted('section-imported')).toHaveLength(1);
  expect(wrapper.findAll('button').some(b => b.text() === 'Mark done')).toBe(false);
  expect(mocks.post.mock.calls.some(([url]) => url.endsWith('/note-aid-setup-complete'))).toBe(false);
  wrapper.unmount();
});
it('retries intake after a failure without repeating successful demographics or calling finalization', async () => {
  let failIntake = true;
  mocks.post.mockImplementation(async url => {
    if (url.endsWith('/intake-note/import')) { if (failIntake) throw new Error('Unavailable'); return {data:{draft:{id:5,status:'draft'}}}; }
    return {data:{parsed:{fullName:'Synthetic Client'},plan:{id:6,status:'draft'}}};
  });
  const wrapper=mountPanel({demographics:'Legal Name: Synthetic Client',intake:'Presenting Problem: Concern',plan:'Original treatment plan'});
  await flushPromises();expect(wrapper.emitted('imported')).toBeUndefined();
  failIntake=false;await wrapper.findAll('button').find(b=>b.text()==='Import all filled sections').trigger('click');await flushPromises();
  expect(mocks.post.mock.calls.filter(([url])=>url.endsWith('/demographics/import'))).toHaveLength(1);
  expect(mocks.post).toHaveBeenCalledWith('/clients/12/intake-note/import',expect.objectContaining({serviceCode:'90791',recordsImport:{text:'Presenting Problem: Concern'}}),expect.anything());
  expect(mocks.post.mock.calls.some(([url])=>url.endsWith('/finalize')||url.endsWith('/treatment-plans/parse'))).toBe(false);expect(mocks.patch).not.toHaveBeenCalled();
  expect(wrapper.emitted('section-imported')).toHaveLength(1);wrapper.unmount();
});
it('requires a selected intake type and saves H0031 as an unlinked record',async()=>{
 mocks.post.mockResolvedValue({data:{draft:{id:5,status:'draft'}}});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,initialTexts:{intake:'Original intake'}},global:{stubs}});await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Import intake').trigger('click');await flushPromises();
 expect(mocks.post.mock.calls.some(([url])=>url.endsWith('/intake-note/import'))).toBe(false);expect(wrapper.text()).toContain('Choose H0031 or 90791');
 await wrapper.get('[data-intake-service]').setValue('H0031');await wrapper.findAll('button').find(b=>b.text()==='Import intake').trigger('click');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/12/intake-note/import',expect.objectContaining({serviceCode:'H0031',recordsImport:{text:'Original intake'}}),expect.anything());expect(wrapper.text()).toContain('unlinked, nonbillable imported note');wrapper.unmount();
});
it('saves a plan draft directly without a second parser or blocking staff completion on clinical scales',async()=>{
 mocks.post.mockResolvedValue({data:{plan:{id:6,status:'draft'}}});
 const wrapper=mountPanel({plan:'Original plan with incomplete scales'});await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/medical-billing/treatment-plans',expect.objectContaining({recordsImport:{text:'Original plan with incomplete scales'},status:'draft',finalize:false}),expect.anything());
 expect(mocks.post.mock.calls.some(([url])=>url.endsWith('/treatment-plans/parse')||url.endsWith('/note-aid-setup-complete'))).toBe(false);
 expect(wrapper.findComponent({name:'NoteAidTreatmentPlanImportReview'}).exists()).toBe(false);expect(wrapper.emitted('section-imported')).toHaveLength(1);expect(wrapper.text()).toContain('provider must review and finalize');wrapper.unmount();
});
it('retains historical source dates and authors as unsigned intake/plan drafts without finalization', async () => {
  mocks.post.mockImplementation(async url => {
    if(url.endsWith('/intake-note/import'))return {data:{draft:{id:5,status:'draft'}}};
    if(url.endsWith('/treatment-plans/parse'))return {data:{parsed:{goals:[]}}};
    return {data:{plan:{id:6,status:'draft'}}};
  });
  const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,historicalImport:true,hideDemographics:true,sourceSystem:'Prior EHR',initialTexts:{intake:'Original intake',plan:'Original plan'}},global:{stubs:{NoteAidTreatmentPlanImportReview:true,Teleport:true}}});
  await flushPromises();
  await wrapper.get('[data-intake-service]').setValue('90791');
  const dates=wrapper.findAll('input[type=date]');await dates[0].setValue('2020-03-04');await dates[1].setValue('2021-05-06');
  const authors=wrapper.findAll('.ehr-source-fields input:not([type=date])');await authors[0].setValue('Original Intake Author');await authors[1].setValue('Original Plan Author');
  await wrapper.get('input[type=checkbox]').setValue(true);
  await wrapper.findAll('button').find(b=>b.text()==='Save historical intake and plan for clinical review').trigger('click');await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/clients/12/intake-note/import',expect.objectContaining({historicalImport:expect.objectContaining({sourceSystem:'Prior EHR',sourceDate:'2020-03-04',sourceAuthor:'Original Intake Author',reviewed:true})}),expect.anything());
  expect(mocks.post).toHaveBeenCalledWith('/medical-billing/treatment-plans',expect.objectContaining({status:'draft',finalize:false,effectiveDate:'2021-05-06',historicalImport:expect.objectContaining({sourceAuthor:'Original Plan Author',sourceText:'Original plan'})}),expect.anything());
  expect(mocks.patch).not.toHaveBeenCalled();
  expect(mocks.post.mock.calls.some(([url])=>url.endsWith('/finalize')||url.endsWith('/note-aid-setup-complete'))).toBe(false);
  expect(wrapper.text()).toContain('clinical review remains pending');expect(wrapper.emitted('imported')).toHaveLength(1);wrapper.unmount();
});

it('imports a single new section while retaining the other pasted drafts', async () => {
  mocks.post.mockResolvedValue({data:{result:{primary:{}}}});
  const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,initialTexts:{insurance:'Example (00050): Primary',contacts:'Name\nPat Example',intake:'Intake draft'}},global:{stubs}});await flushPromises();
  await wrapper.findAll('button').find(b=>b.text()==='Import insurance').trigger('click');await flushPromises();
  expect(mocks.post.mock.calls.map(([url])=>url)).toEqual(['/clients/12/chart-import/start','/clients/12/chart-import/sections/insurance']);
  expect(wrapper.get('textarea[data-section=contacts]').element.value).toBe('Name\nPat Example');expect(wrapper.get('textarea[data-section=intake]').element.value).toBe('Intake draft');expect(wrapper.emitted('section-imported')).toHaveLength(1);wrapper.unmount();
});
it('restores saved drafts and successful section imports, and preserves edits during status refresh', async () => {
  mocks.get.mockResolvedValue({data:{drafts:{comments:{revision:3,value:{text:'Private saved draft',imported:true}}}}});
  const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2},global:{stubs}});await flushPromises();
  expect(wrapper.get('textarea[data-section=comments]').element.value).toBe('Private saved draft');expect(wrapper.text()).toContain('Patient comments · imported');
  expect(wrapper.get('textarea[data-section=comments]').attributes('disabled')).toBeDefined();await wrapper.findAll('button').find(b=>b.text()==='Edit imported section').trigger('click');
  await wrapper.get('textarea[data-section=comments]').setValue('New private draft');await wrapper.setProps({recordStatus:{demographics:'done'}});
  expect(wrapper.get('textarea[data-section=comments]').element.value).toBe('New private draft');await wrapper.vm.prepareLeave();
  expect(mocks.put).toHaveBeenCalledWith('/clients/12/chart-import/drafts/comments',expect.objectContaining({text:'New private draft',revision:3,metadata:expect.objectContaining({imported:false})}),expect.anything());wrapper.unmount();
});
it('allows records completion independently while payer linkage still gates invitations', async () => {
  mocks.post.mockResolvedValue({data:{result:{primary:{}}}});
  const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,creationFlow:true,requireVerifiedPayers:true,initialTexts:{insurance:'Example (00050): Primary'}},global:{stubs}});await flushPromises();
  expect(wrapper.emitted('imported')).toBeUndefined();const finish=()=>wrapper.findAll('button').find(b=>b.text()==='Finish client import');expect(finish().attributes('disabled')).toBeUndefined();
  wrapper.findComponent({name:'ClientPayerLinkage'}).vm.$emit('ready-change',true);await flushPromises();await finish().trigger('click');await flushPromises();await confirmCompletion(wrapper);expect(wrapper.emitted('imported')).toHaveLength(1);wrapper.unmount();
});
it('blocks next-client navigation when a private draft save fails',async()=>{
  const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2},global:{stubs}});await flushPromises();mocks.put.mockRejectedValue({response:{status:409,data:{error:{message:'Draft changed in another window'}}}});
  await wrapper.get('textarea[data-section=comments]').setValue('Keep this draft');await expect(wrapper.vm.prepareLeave()).resolves.toBe(false);expect(wrapper.text()).toContain('Draft changed in another window');expect(wrapper.get('textarea[data-section=comments]').element.value).toBe('Keep this draft');wrapper.unmount();
});

it('places patient comments first and contacts directly below demographics, with one coverage paste',async()=>{
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2},global:{stubs}});await flushPromises();
 const keys=wrapper.findAll('textarea[data-section]').map(node=>node.attributes('data-section'));
 expect(keys.slice(0,3)).toEqual(['comments','demographics','contacts']);expect(keys.filter(key=>['insurance','payer'].includes(key))).toEqual(['insurance']);wrapper.unmount();
});
it('keeps independent coverage pastes across selector changes and autosaves both',async()=>{
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2},global:{stubs}});await flushPromises();
 const coverage=wrapper.get('section[aria-label=Insurance] select[aria-label="Coverage position"]');
 await wrapper.get('textarea[data-section=insurance]').setValue('Primary policy');await coverage.setValue('secondary');
 expect(wrapper.get('textarea[data-section=insurance]').element.value).toBe('');
 await wrapper.get('textarea[data-section=insurance]').setValue('Secondary policy');await coverage.setValue('primary');
 expect(wrapper.get('textarea[data-section=insurance]').element.value).toBe('Primary policy');await wrapper.vm.prepareLeave();
 expect(mocks.put).toHaveBeenLastCalledWith('/clients/12/chart-import/drafts/insurance',expect.objectContaining({metadata:expect.objectContaining({position:'primary',coverageDrafts:{primary:{text:'Primary policy',imported:false},secondary:{text:'Secondary policy',imported:false}}})}),expect.anything());wrapper.unmount();
});
it('imports all filled coverage slots with their own position even while the selected slot is empty',async()=>{
 mocks.post.mockResolvedValue({data:{result:{secondary:{}}}});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2},global:{stubs}});await flushPromises();
 const coverage=wrapper.get('section[aria-label=Insurance] select[aria-label="Coverage position"]');await coverage.setValue('secondary');
 await wrapper.get('textarea[data-section=insurance]').setValue('Secondary policy');await coverage.setValue('primary');
 await wrapper.findAll('button').find(b=>b.text()==='Import all filled sections').trigger('click');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/12/chart-import/sections/insurance',{text:'Secondary policy',position:'secondary'},expect.anything());
 expect(wrapper.emitted('section-imported')).toHaveLength(1);wrapper.unmount();
});
it('requires payer linkage for a secondary-only draft after returning to blank primary',async()=>{
 mocks.get.mockResolvedValue({data:{drafts:{insurance:{revision:1,value:{text:'Secondary policy',position:'secondary',imported:true,coverageDrafts:{primary:{text:'',imported:false},secondary:{text:'Secondary policy',imported:true}}}}}}});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,creationFlow:true,requireVerifiedPayers:true},global:{stubs}});await flushPromises();
 await wrapper.get('section[aria-label=Insurance] select[aria-label="Coverage position"]').setValue('primary');
 const finish=wrapper.findAll('button').find(b=>b.text()==='Finish client import');expect(finish.attributes('disabled')).toBeUndefined();expect(wrapper.emitted('imported')).toBeUndefined();wrapper.unmount();
});
it('routes source guardian channels separately and reimports demographics after correcting their owner',async()=>{
 mocks.post.mockResolvedValue({data:{parsed:{fullName:'Synthetic Client',contactPhone:'555-111-2222',email:'parent@example.test'}}});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,initialTexts:{demographics:'Legal Name\nSynthetic Client'}},global:{stubs}});await flushPromises();
 const button=()=>wrapper.findAll('button').find(b=>b.text()==='Import demographics');await button().trigger('click');await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/12/demographics/import',expect.objectContaining({contactOwner:'guardian'}),expect.anything());
 await wrapper.get('section[aria-label=Demographics] select').setValue('client');await button().trigger('click');await flushPromises();
 expect(mocks.post.mock.calls.filter(([url])=>url.endsWith('/demographics/import'))).toHaveLength(2);
 expect(mocks.post).toHaveBeenLastCalledWith('/clients/12/demographics/import',expect.objectContaining({contactOwner:'client'}),expect.anything());wrapper.unmount();
});

it('places assignments after the records and saves pending assignment changes as drafts before leaving',async()=>{
 const leave=vi.fn(()=>false);const AssignmentStub=defineComponent({name:'ClientUpdateAssignments',emits:['busy','ready','updated'],setup(_, {expose}){expose({prepareLeave:()=>false,saveWorkingDraft:leave});},template:'<section data-assignments>Assignments controls</section>'});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2},global:{stubs:{...stubs,ClientUpdateAssignments:AssignmentStub}}});await flushPromises();
 expect(wrapper.find('[data-assignments]').exists()).toBe(true);expect(wrapper.html().indexOf('data-assignments')).toBeGreaterThan(wrapper.html().indexOf('data-section="plan"'));
 expect(await wrapper.vm.prepareLeave()).toBe(false);expect(leave).toHaveBeenCalledOnce();
 await wrapper.findAll('button').find(button=>button.text()==='Mark done').trigger('click');await flushPromises();expect(mocks.post.mock.calls.some(([url])=>url.endsWith('/note-aid-setup-complete'))).toBe(false);expect(wrapper.emitted('done')).toBeUndefined();
 wrapper.findComponent(AssignmentStub).vm.$emit('busy',true);await flushPromises();expect(wrapper.emitted('busy').at(-1)).toEqual([true]);
 wrapper.findComponent(AssignmentStub).vm.$emit('busy',false);wrapper.findComponent(AssignmentStub).vm.$emit('ready',true);leave.mockReturnValue(true);await flushPromises();expect(await wrapper.vm.prepareLeave()).toBe(true);
 await wrapper.findAll('button').find(button=>button.text()==='Mark done').trigger('click');await flushPromises();await confirmCompletion(wrapper);expect(mocks.post).toHaveBeenCalledWith('/clients/12/chart-import/complete',{keptBlankSections:expect.any(Array)},expect.anything());expect(wrapper.emitted('done')).toHaveLength(1);wrapper.unmount();
});

it('honors client-owned contact channels selected before creating an office chart',async()=>{
 mocks.post.mockResolvedValue({data:{parsed:{fullName:'Synthetic adult',email:'adult@example.test'}}});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,creationFlow:true,requireVerifiedPayers:true,initialContactOwner:'client',initialTexts:{demographics:'Legal Name\nSynthetic adult'}},global:{stubs}});await flushPromises();
 expect(mocks.post).toHaveBeenCalledWith('/clients/12/demographics/import',expect.objectContaining({contactOwner:'client'}),expect.anything());wrapper.unmount();
});
it('keeps assignments and the portal invitation inside the creation flow before final completion',async()=>{
 const AssignmentStub=defineComponent({name:'ClientUpdateAssignments',emits:['ready'],setup(_, {emit,expose}){onMounted(()=>emit('ready',false));expose({prepareLeave:()=>true});},template:'<section data-create-assignments />'});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,creationFlow:true,requireVerifiedPayers:true},global:{stubs:{...stubs,ClientUpdateAssignments:AssignmentStub}}});await flushPromises();const finish=()=>wrapper.findAll('button').find(button=>button.text()==='Finish client import');expect(finish().attributes('disabled')).toBeUndefined();
 expect(wrapper.html().indexOf('data-create-assignments')).toBeLessThan(wrapper.html().indexOf('client-transition-invitation-stub'));expect(wrapper.html().indexOf('client-transition-invitation-stub')).toBeLessThan(wrapper.html().indexOf('Finish client import'));
 wrapper.findComponent(AssignmentStub).vm.$emit('ready',true);await flushPromises();expect(finish().attributes('disabled')).toBeUndefined();wrapper.unmount();
});

it('explains the remaining steps and distinguishes a saved paste from a successful import',async()=>{
 mocks.post.mockResolvedValue({data:{}});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,creationFlow:true,requireVerifiedPayers:true,autoImport:false,pendingProviderAssignment:true,initialTexts:{demographics:'Legal Name\nSynthetic Client'}},global:{stubs}});await flushPromises();
 expect(wrapper.text()).toContain('Demographics · Ready to import');expect(wrapper.get('[aria-label="Remaining import steps"]').text()).toContain('Import demographics.');expect(wrapper.text()).toContain('Resolve the provider assignment');expect(wrapper.findAll('button').find(button=>button.text()==='Finish client import').attributes('disabled')).toBeUndefined();wrapper.unmount();
});
it('keeps the import open when server completion fails after sections have saved',async()=>{
 mocks.post.mockImplementation(async url=>{if(url.endsWith('/chart-import/complete'))throw{response:{status:409,data:{error:{message:'Review a remaining section'}}}};return{data:{parsed:{fullName:'Synthetic Client'}}};});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,creationFlow:true,requireVerifiedPayers:true,initialTexts:{demographics:'Legal Name\nSynthetic Client'}},global:{stubs}});await flushPromises();
 await wrapper.findAll('button').find(button=>button.text()==='Finish client import').trigger('click');await flushPromises();await confirmCompletion(wrapper);expect(wrapper.text()).toContain('Review a remaining section');expect(wrapper.emitted('imported')).toBeUndefined();expect(wrapper.get('textarea[data-section=demographics]').element.value).toContain('Synthetic Client');wrapper.unmount();
});

it('uses the client profile drafts over stale creation pastes, including an intentionally cleared field',async()=>{
 mocks.get.mockResolvedValue({data:{drafts:{plan:{revision:5,value:{text:'Latest source plan',imported:true,needsReview:false}},comments:{revision:3,value:{text:'',imported:false}},intake:{revision:2,value:{text:'Saved H0031 source',imported:true,serviceCode:'H0031'}}}}});
 mocks.post.mockResolvedValue({data:{progress:{status:'complete'}}});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,creationFlow:true,requireVerifiedPayers:true,autoImport:false,initialTexts:{plan:'Stale creation plan',comments:'Removed old comment',intake:'Old intake'}},global:{stubs}});await flushPromises();
 expect(wrapper.get('textarea[data-section=plan]').element.value).toBe('Latest source plan');expect(wrapper.get('textarea[data-section=comments]').element.value).toBe('');expect(wrapper.get('[data-intake-service]').element.value).toBe('H0031');
 await wrapper.findAll('button').find(b=>b.text()==='Finish client import').trigger('click');await flushPromises();await confirmCompletion(wrapper);
 expect(mocks.post).toHaveBeenCalledWith('/clients/12/chart-import/complete',{keptBlankSections:expect.any(Array)},expect.anything());expect(mocks.post.mock.calls.some(([url])=>url.endsWith('/intake-note/import')||url==='/medical-billing/treatment-plans')).toBe(false);expect(wrapper.emitted('imported')).toHaveLength(1);wrapper.unmount();
});
it('marks imported intake and plan drafts done without attesting to clinical finalization',async()=>{
 mocks.get.mockResolvedValue({data:{drafts:{intake:{value:{text:'Original intake',serviceCode:'90791',imported:true,needsReview:true}},plan:{value:{text:'Original plan',imported:true,needsReview:true}}}}});mocks.post.mockResolvedValue({data:{}});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2},global:{stubs}});await flushPromises();await wrapper.findAll('button').find(b=>b.text()==='Mark done').trigger('click');await flushPromises();await confirmCompletion(wrapper);
 expect(mocks.post).toHaveBeenCalledWith('/clients/12/chart-import/complete',{keptBlankSections:expect.any(Array)},expect.anything());expect(wrapper.emitted('done')).toHaveLength(1);expect(mocks.post.mock.calls.some(([url])=>url.endsWith('/finalize')||url.endsWith('/note-aid-setup-complete'))).toBe(false);wrapper.unmount();
});

it('restores the latest coverage slot and contact owner rather than stale creation defaults',async()=>{
 mocks.get.mockResolvedValue({data:{drafts:{demographics:{value:{text:'Saved demographics',imported:true,contactOwner:'client'}},insurance:{value:{text:'Saved secondary',position:'secondary',coverageDrafts:{primary:{text:'Latest primary',imported:true},secondary:{text:'Saved secondary',imported:true}},imported:true}}}}});
 const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2,creationFlow:true,autoImport:false,initialTexts:{insurance:'Stale primary'}},global:{stubs}});await flushPromises();
 expect(wrapper.get('section[aria-label=Demographics] select').element.value).toBe('client');expect(wrapper.get('textarea[data-section=insurance]').element.value).toBe('Saved secondary');await wrapper.get('section[aria-label=Insurance] select[aria-label="Coverage position"]').setValue('primary');expect(wrapper.get('textarea[data-section=insurance]').element.value).toBe('Latest primary');wrapper.unmount();
});
it('requires remaining pasted data to import and blank sections to be confirmed before completion',async()=>{
 mocks.post.mockResolvedValue({data:{result:{message:'Saved'}}});const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2},global:{stubs}});await flushPromises();
 await wrapper.get('textarea[data-section=comments]').setValue('Source comment');await wrapper.findAll('button').find(b=>b.text()==='Mark done').trigger('click');
 const complete=()=>wrapper.findAll('button').find(b=>b.text()==='Complete records import');expect(complete().attributes('disabled')).toBeDefined();expect(wrapper.text()).toContain('Patient comments');
 await wrapper.findAll('button').find(b=>b.text()==='Import remaining pasted sections').trigger('click');await flushPromises();expect(complete().attributes('disabled')).toBeDefined();expect(wrapper.get('textarea[data-section=comments]').attributes('disabled')).toBeDefined();
 expect(wrapper.emitted('done')).toBeUndefined();expect(wrapper.emitted('section-imported')).toHaveLength(1);await confirmCompletion(wrapper);expect(wrapper.emitted('done')).toHaveLength(1);expect(mocks.post).toHaveBeenLastCalledWith('/clients/12/chart-import/complete',{keptBlankSections:expect.arrayContaining(['intake','plan','contacts'])},expect.anything());wrapper.unmount();
});
it('offers to import unsaved pasted information on leaving, or preserves it as a private draft',async()=>{
 mocks.post.mockResolvedValue({data:{result:{message:'Saved'}}});const wrapper=mount(Panel,{props:{open:true,clientId:12,agencyId:2},global:{stubs}});await flushPromises();await wrapper.get('textarea[data-section=comments]').setValue('Saved source comment');
 expect(await wrapper.vm.prepareLeave()).toBe(true);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.put).toHaveBeenCalled();
 window.confirm.mockReturnValue(true);expect(await wrapper.vm.prepareLeave()).toBe(true);expect(mocks.post).toHaveBeenCalledWith('/clients/12/chart-import/sections/comments',expect.objectContaining({text:'Saved source comment'}),expect.anything());wrapper.unmount();
});
it('keeps the explicit finish action available for referral and task creation flows too',async()=>{
 mocks.post.mockResolvedValue({data:{parsed:{fullName:'Synthetic Client'}}});const wrapper=mountPanel({demographics:'Legal Name: Synthetic Client'});await flushPromises();
 expect(wrapper.emitted('imported')).toBeUndefined();await wrapper.findAll('button').find(b=>b.text()==='Finish client import').trigger('click');await confirmCompletion(wrapper);expect(wrapper.emitted('imported')).toHaveLength(1);wrapper.unmount();
});
