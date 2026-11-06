import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
import Editor from '../JobInterviewGuideEditor.vue';
let wrapper;
const guide=()=>({job:{id:45,title:'Counselor'},questions:[{key:'q1',text:'Original question?'}],criteria:[{key:'judgment',label:'Clinical judgment',weight:1}],criteriaSource:'job'});
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
