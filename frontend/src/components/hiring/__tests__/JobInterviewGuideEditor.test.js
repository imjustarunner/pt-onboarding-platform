import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('vue-router',()=>({onBeforeRouteLeave:vi.fn()}));
import Editor from '../JobInterviewGuideEditor.vue';
let wrapper;
const guide=()=>({job:{id:45,title:'Counselor'},questionSet:{id:4},questions:[{key:'q1',text:'Original question?'}],criteria:[{key:'judgment',label:'Clinical judgment',weight:1}],criteriaSource:'job'});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{data:guide()}});api.put.mockResolvedValue({data:{data:guide()}});});
afterEach(()=>wrapper?.unmount());
async function open(){wrapper=mount(Editor,{props:{agencyId:6,jobDescriptionId:45,jobTitle:'Counselor'}});await wrapper.get('button').trigger('click');await flushPromises();}
it('edits job questions and ratings in place and saves them only to that job and agency',async()=>{
 await open();await wrapper.get('textarea').setValue('Updated question?');await wrapper.get('input:not([type=checkbox])').setValue('Judgment in practice');
 await wrapper.findAll('button').find(b=>b.text()==='Save job defaults').trigger('click');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/hiring/interview-hub/jobs/45/guide',{agencyId:6,questions:[{key:'q1',text:'Updated question?'}],criteria:[{key:'judgment',label:'Judgment in practice',weight:1}]});expect(wrapper.emitted('saved')).toHaveLength(1);
});
it('can return the job’s ratings to inherited agency/platform defaults',async()=>{
 await open();await wrapper.get('input[type=checkbox]').setValue(false);await wrapper.findAll('button').find(b=>b.text()==='Save job defaults').trigger('click');await flushPromises();
 expect(api.put.mock.calls[0][1].criteria).toBeNull();
});
it('closes an unsaved guide when the selected job changes',async()=>{
 await open();await wrapper.get('textarea').setValue('Unsaved');await wrapper.setProps({jobDescriptionId:99});expect(wrapper.find('textarea').exists()).toBe(false);expect(api.put).not.toHaveBeenCalled();
});
it('identifies the starter source and fills an editable copy without saving automatically',async()=>{
 api.get.mockResolvedValue({data:{data:{...guide(),starterSource:'platform',starterQuestions:[{key:'motivation',text:'Starter question?'}]}}});await open();
 await wrapper.get('select').setValue('starter');await wrapper.findAll('button').find(b=>b.text()==='Use selected questions').trigger('click');expect(wrapper.get('textarea').element.value).toBe('Starter question?');expect(api.put).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Plotline starter questions');
});
it('shows saved questions without opening the editor and returns pending edits for the posting save',async()=>{
 wrapper=mount(Editor,{props:{agencyId:6,jobDescriptionId:45,embeddedInPosting:true}});await flushPromises();
 expect(wrapper.get('.guide-preview').text()).toContain('Original question?');expect(wrapper.vm.getPendingSettings()).toBeUndefined();
 await wrapper.get('button').trigger('click');await flushPromises();await wrapper.get('textarea').setValue('Outer save question');
 expect(wrapper.vm.hasUnsavedChanges).toBe(true);expect(wrapper.vm.getPendingSettings()).toMatchObject({questions:[{text:'Outer save question'}]});
 expect(wrapper.text()).toContain('Save changes at the bottom');expect(api.put).not.toHaveBeenCalled();
});
it('shows clearly labeled starter questions for legacy jobs without silently saving them',async()=>{
 api.get.mockResolvedValue({data:{data:{...guide(),questionSet:null,questions:[],starterSource:'company',starterQuestions:[{key:'company',text:'Company question'}]}}});
 wrapper=mount(Editor,{props:{agencyId:6,jobDescriptionId:99}});await flushPromises();
 expect(wrapper.get('.guide-preview').text()).toContain('Company question');expect(wrapper.text()).toContain('no saved job default yet');expect(wrapper.vm.getPendingSettings()).toBeUndefined();expect(api.put).not.toHaveBeenCalled();
});
it('retains edited text on a failed save and blocks an accidental empty replacement',async()=>{
 await open();await wrapper.get('textarea').setValue('Keep these edits');api.put.mockRejectedValue(new Error('offline'));
 await wrapper.findAll('button').find(b=>b.text()==='Save job defaults').trigger('click');await flushPromises();
 expect(wrapper.get('textarea').element.value).toBe('Keep these edits');expect(wrapper.vm.hasUnsavedChanges).toBe(true);
 await wrapper.get('textarea').setValue('');expect(()=>wrapper.vm.getPendingSettings()).toThrow('Add at least one question');
});
