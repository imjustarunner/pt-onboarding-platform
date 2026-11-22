// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('node:fs',async original=>{const actual=await original();const {default:rights}=await import('../../../../../backend/src/data/outcomeMeasureRights.json');const readFileSync=()=>JSON.stringify(rights);return {...actual,readFileSync,default:{...actual.default,readFileSync}};});
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Live from '../AppointmentLiveAssessments.vue';
import Form from '../OutcomeMeasureForm.vue';
import { getOutcomeMeasure } from '../../../../../backend/src/data/outcomeMeasures.js';
import { scoreOutcomeMeasure } from '../../../../../backend/src/services/outcomeMeasureScoring.js';
let wrapper;
const measures=['phq-2','phq-9-parent'].map(getOutcomeMeasure);
const button=text=>wrapper.findAll('button').find(item=>item.text().includes(text));
beforeEach(()=>{
  vi.clearAllMocks();window.confirm=vi.fn().mockReturnValue(true);
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  api.get.mockImplementation(async path=>({data:path.endsWith('/catalog')?{measures}:{guardians:[{id:88,label:'Synthetic Guardian',relationship:'Parent'}],responses:[]}}));
  api.post.mockImplementation(async(path,input)=>{const questionnaire=getOutcomeMeasure(input.measureId);return {data:{response:{id:1,clientId:41,measureId:questionnaire.id,version:questionnaire.version,questionnaire,...scoreOutcomeMeasure(questionnaire,input.answers),respondent:input.respondent,administration:input.administration,appointment:{id:99},source:'live_session',recordedAt:'2026-11-22T12:00:00Z'}}};});
});
afterEach(()=>wrapper?.unmount());
async function open(id='phq-2'){wrapper=mount(Live,{props:{clientId:41,appointmentId:99,clientName:'Synthetic Client'}});await flushPromises();await button(getOutcomeMeasure(id).title).trigger('click');await flushPromises();}
it('opens the selected assessment as a full-screen dialog and does not submit incomplete questions',async()=>{
  await open();expect(wrapper.get('dialog').attributes('open')).toBeDefined();expect(wrapper.get('#live-assessment-title').text()).toContain('PHQ-2');
  expect(api.get).toHaveBeenCalledWith('/outcome-measures/clients/41/live',{params:{appointmentId:99}});
  await wrapper.get('.confirm input').setValue(true);await wrapper.get('dialog form').trigger('submit');expect(api.post).not.toHaveBeenCalled();
  expect(button('Mark complete').attributes('disabled')).toBeDefined();
});
it('saves complete answers with the actual respondent, method and appointment, then reopens saved results',async()=>{
  await open();wrapper.getComponent(Form).vm.$emit('update:modelValue',{q1:'1',q2:'2'});await wrapper.get('.confirm input').setValue(true);
  await wrapper.get('dialog form').trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/outcome-measures/clients/41',expect.objectContaining({appointmentId:99,respondent:{type:'client'},administration:'clinician_assisted',answers:{q1:'1',q2:'2'},clinicalFitConfirmed:true}));
  expect(wrapper.get('dialog').text()).toContain('Assessment results');expect(wrapper.get('dialog').text()).toContain('client’s Assessments & Evaluations');
  await button('Back to appointment').trigger('click');expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
  await wrapper.get('.saved-result').trigger('click');await flushPromises();expect(wrapper.get('dialog').text()).toContain('Assessment results');expect(api.post).toHaveBeenCalledTimes(1);
});
it('requires a guardian selection for parent forms and supports completing the form on screen',async()=>{
  await open('phq-9-parent');expect(wrapper.get('.respondent-controls select').find('option[value=client]').exists()).toBe(false);
  await wrapper.get('.respondent-controls select').setValue('guardian');
  await wrapper.findAll('.respondent-controls select')[1].setValue('88');
  expect(wrapper.getComponent(Form).props('modelValue').informant).toBe('Synthetic Guardian');
  await wrapper.findAll('.respondent-controls select')[2].setValue('screen');
  wrapper.getComponent(Form).vm.$emit('update:modelValue',{informant:'Synthetic Guardian',...Object.fromEntries(Array.from({length:9},(_,i)=>[`q${i+1}`,'0'])),past_year:'0',difficulty:'0',past_month:'0',lifetime_attempt:'0'});
  await wrapper.get('.confirm input').setValue(true);await wrapper.get('dialog form').trigger('submit');await flushPromises();
  expect(api.post.mock.calls[0][1]).toMatchObject({respondent:{type:'guardian',userId:88},administration:'caregiver',appointmentId:99});
});
it('identifies other respondents and preserves answers if a save fails',async()=>{
  await open();await wrapper.get('.respondent-controls select').setValue('other');const fields=wrapper.findAll('.respondent-controls input');await fields[0].setValue('Relative A');await fields[1].setValue('Aunt');
  wrapper.getComponent(Form).vm.$emit('update:modelValue',{q1:'0',q2:'0'});await wrapper.get('.confirm input').setValue(true);api.post.mockRejectedValueOnce(new Error('Offline'));
  await wrapper.get('dialog form').trigger('submit');await flushPromises();expect(wrapper.getComponent(Form).props('modelValue')).toEqual({q1:'0',q2:'0'});expect(wrapper.get('dialog [role=alert]').text()).toContain('answers remain');
  expect(api.post.mock.calls[0][1].respondent).toEqual({type:'other',label:'Relative A',relationship:'Aunt'});
});
it('ignores a late save response after switching appointments or clients',async()=>{
  await open();let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));wrapper.getComponent(Form).vm.$emit('update:modelValue',{q1:'0',q2:'0'});await wrapper.get('.confirm input').setValue(true);await wrapper.get('dialog form').trigger('submit');
  await wrapper.setProps({clientId:42,appointmentId:100});await flushPromises();finish({data:{response:{id:999,appointment:{id:99}}}});await flushPromises();expect(wrapper.find('.saved-result').exists()).toBe(false);expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
});
