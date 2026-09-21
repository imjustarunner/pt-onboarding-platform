import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const http=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:http}));
import Rubric from '../JobEvaluationRubricEditor.vue';
import Preview from '../JobApplicationPagePreview.vue';
import Sections from '../JobDescriptionSections.vue';
import Editor from '../JobDescriptionSectionsEditor.vue';
const rubric={title:'Role rubric',sections:[{key:'core',title:'Core duties',hasActionItems:true,criteria:[{key:'care',label:'Support clients',anchors:{1:'Needs support',2:'Developing',3:'Consistent',4:'Exemplary'}}]}],reflectionPrompts:[]};
let wrapper;
beforeEach(()=>{vi.clearAllMocks();http.get.mockResolvedValue({data:{templates:[]}});});
afterEach(()=>wrapper?.unmount());
const button=text=>wrapper.findAll('button').find(b=>b.text()===text);
describe('job editing experience',()=>{
 it('renders and edits compensation separately from benefits',async()=>{
  wrapper=mount(Editor,{props:{modelValue:{compensation:['$40/hour'],benefits:['Health insurance']}}});
  const input=wrapper.findAll('textarea').find(t=>t.element.value==='$40/hour');
  await input.setValue('$45/hour\nWeekly payroll');
  expect(wrapper.emitted('update:modelValue').at(-1)[0]).toMatchObject({compensation:['$45/hour','Weekly payroll'],benefits:['Health insurance']});
  await wrapper.findAll('button').find(b=>b.text()==='Move to Compensation').trigger('click');
  expect(wrapper.emitted('update:modelValue').at(-1)[0]).toMatchObject({compensation:['$40/hour','Health insurance'],benefits:[]});
  wrapper.unmount();wrapper=mount(Sections,{props:{sections:{compensation:['$45/hour']}}});
  expect(wrapper.text()).toContain('Compensation');expect(wrapper.text()).toContain('$45/hour');expect(wrapper.text()).not.toContain('Benefits');
 });
 it('sends an object body for generation, then supports editing and saving a version',async()=>{
  http.post.mockResolvedValue({data:{templates:[{templateId:7,name:'Role rubric',version:1,isPrimary:true,rubric}]}});
  http.put.mockResolvedValue({data:{templates:[{templateId:8,name:'Updated rubric',version:2,isPrimary:true,rubric}]}});
  wrapper=mount(Rubric,{props:{jobId:4,agencyId:1,jobTitle:'Counselor'}});await flushPromises();
  await button('Generate from saved responsibilities').trigger('click');await flushPromises();
  expect(http.post).toHaveBeenCalledWith('/evaluations/jobs/4/generate-template',{},expect.any(Object));
  expect(wrapper.text()).toContain('Edit rubric');
  await wrapper.get('input[maxlength="255"]').setValue('Updated rubric');
  await button('Save rubric for this job').trigger('click');await flushPromises();
  expect(http.put).toHaveBeenCalledWith('/evaluations/jobs/4/rubric',expect.objectContaining({templateId:7,rubric:expect.objectContaining({title:'Updated rubric'})}),expect.any(Object));
  expect(wrapper.text()).toContain('Version 2');
 });
 it('retains the draft and exposes validation failures',async()=>{
  wrapper=mount(Rubric,{props:{jobId:4,agencyId:1,jobTitle:'Counselor'}});await flushPromises();await button('Create rubric').trigger('click');
  http.put.mockRejectedValue({response:{data:{error:{message:'Enter a criterion.'}}}});
  await button('Save rubric for this job').trigger('click');await flushPromises();
  expect(wrapper.text()).toContain('Enter a criterion.');expect(wrapper.find('fieldset').exists()).toBe(true);
 });
 it('previews inheritance, unsaved job changes, section locations and saved application link',async()=>{
  wrapper=mount(Preview,{props:{config:{lead:'Unsaved introduction',featureCards:[{title:'',body:''}]},defaults:{secureTitle:'Agency assurance',featureCards:[{title:'Agency highlight',body:'Flexible hours'}]},job:{title:'Counselor',descriptionSections:{compensation:['$45/hour']}},publicUrl:'https://app.itsco.health/intake/test'}});
  expect(wrapper.text()).toContain('Agency assurance');expect(wrapper.text()).toContain('Unsaved introduction');expect(wrapper.text()).toContain('Agency highlight');expect(wrapper.text()).toContain('$45/hour');
  expect(wrapper.get('a').attributes('href')).toBe('https://app.itsco.health/intake/test');
  await wrapper.setProps({config:{lead:'Updated live preview',featureCards:[{title:'Job highlight',body:'Part time'}]}});
  expect(wrapper.text()).toContain('Updated live preview');expect(wrapper.text()).not.toContain('Agency highlight');
  expect(wrapper.findAll('[data-region]')).toHaveLength(6);
  await button('Mobile preview').trigger('click');expect(wrapper.get('.preview-canvas').classes()).toContain('mobile');
 });
});
