import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
import Picker from '../InterviewQuestionPicker.vue';
const q=(key,text)=>({key,text,fingerprint:`fp-${text}`});
const guide=()=>({questionSet:{id:4},starterSource:'platform',starterQuestions:[q('starter','Starter question?')],questionSets:[
 {id:4,title:'Operations',job_description_id:45,questions_json:[q('q1','Role question one?'),q('q2','Role question two?')]},
 {id:8,title:'Shared teamwork',job_description_id:null,questions_json:[q('q1','Team question?')]}
]});
let wrapper;
const button=text=>wrapper.findAll('button').find(b=>b.text()===text);
const selection=()=>wrapper.emitted('update:modelValue').at(-1)[0];
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{data:guide()}});});
afterEach(()=>wrapper?.unmount());
async function open(){wrapper=mount(Picker,{props:{agencyId:6,jobDescriptionId:45}});await flushPromises();}
it('starts with the applied job’s own questions and exposes their source',async()=>{
 await open();expect(selection()).toMatchObject({setId:4,questions:[{setId:4,questionKey:'q1'},{setId:4,questionKey:'q2'}]});
 expect(wrapper.text()).toContain('Operations · Job default');expect(wrapper.get('.iqp-selected').text()).not.toContain('Starter question?');expect(wrapper.emitted('ready').at(-1)).toEqual([true]);
});
it('switches whole sets with the visible arrows without writing to the job',async()=>{
 await open();await wrapper.get('[aria-label="Next question set"]').trigger('click');
 expect(selection()).toMatchObject({setId:8,questions:[{setId:8,questionKey:'q1'}]});expect(api.post).not.toHaveBeenCalled();
 await wrapper.get('[aria-label="Previous question set"]').trigger('click');expect(selection().questions).toHaveLength(2);
});
it('adds one question from another set, prevents duplicates, removes and reorders questions',async()=>{
 await open();await wrapper.get('.iqp-library select').setValue('8');await wrapper.get('[aria-label="Add question: Team question?"]').trigger('click');
 expect(selection().questions.map(q=>q.setId)).toEqual([4,4,8]);expect(wrapper.get('[aria-label="Add question: Team question?"]').element.disabled).toBe(true);
 await wrapper.get('[aria-label="Remove question 1"]').trigger('click');await wrapper.get('[aria-label="Move question 2 up"]').trigger('click');
 expect(selection().questions.map(q=>[q.setId,q.questionKey])).toEqual([[8,'q1'],[4,'q2']]);expect(wrapper.text()).toContain('Customized for this interview');
 expect(selection().questions[0].text).toBeUndefined();expect(selection().questions[0].fingerprint).toContain('Team question?');
});
it('blocks scheduling when no questions remain',async()=>{
 await open();await wrapper.get('[aria-label="Remove question 1"]').trigger('click');await wrapper.get('[aria-label="Remove question 1"]').trigger('click');expect(wrapper.emitted('ready').at(-1)).toEqual([false]);
});
it('does not offer a duplicate question copied into another starter set',async()=>{
 const data=guide();data.questionSets[1].questions_json=[q('copied','Role question one?')];api.get.mockResolvedValue({data:{data}});await open();await wrapper.get('.iqp-library select').setValue('8');
 expect(wrapper.get('[aria-label="Add question: Role question one?"]').element.disabled).toBe(true);
});
it('creates a job-linked alternative without changing the default and uses the result',async()=>{
 await open();api.post.mockResolvedValue({data:{data:{id:9,title:'Second round',questions_json:[q('q_1','Scenario question?')]}}});
 await button('Create a question set').trigger('click');expect(wrapper.emitted('ready').at(-1)).toEqual([false]);
 await wrapper.get('input').setValue('Second round');await wrapper.get('textarea').setValue('Scenario question?');await button('Save and use set').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/hiring/interview-hub/job-question-sets',{agencyId:6,jobDescriptionId:45,title:'Second round',questions:[{key:'q_1',text:'Scenario question?'}]});
 expect(selection()).toMatchObject({setId:9,questions:[{setId:9,questionKey:'q_1'}]});expect(wrapper.emitted('ready').at(-1)).toEqual([true]);
});
it('preserves typed questions on save failure',async()=>{
 await open();api.post.mockRejectedValue(new Error('offline'));await button('Create a question set').trigger('click');await wrapper.get('input').setValue('New');await wrapper.get('textarea').setValue('Keep this text');await button('Save and use set').trigger('click');await flushPromises();
 expect(wrapper.get('textarea').element.value).toBe('Keep this text');expect(wrapper.get('[role="alert"]').text()).toContain('Could not save');expect(wrapper.emitted('ready').at(-1)).toEqual([false]);
});
it('does not apply a late response for a previously selected job',async()=>{
 let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));wrapper=mount(Picker,{props:{agencyId:6,jobDescriptionId:45}});
 await wrapper.setProps({jobDescriptionId:99});await flushPromises();const expected=selection();finish({data:{data:{...guide(),questionSet:null,questionSets:[]}}});await flushPromises();expect(selection()).toEqual(expected);
});
it('shows a load failure and keeps scheduling blocked until retry succeeds',async()=>{
 api.get.mockRejectedValueOnce(new Error('offline'));await open();expect(wrapper.get('[role="alert"]').text()).toContain('Could not load');expect(wrapper.emitted('ready').at(-1)).toEqual([false]);
 await button('Reload questions').trigger('click');await flushPromises();expect(wrapper.emitted('ready').at(-1)).toEqual([true]);
});
