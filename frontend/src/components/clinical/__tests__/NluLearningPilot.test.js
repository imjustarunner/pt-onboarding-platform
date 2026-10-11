import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nluLearningMeasures } from '../../../../../backend/src/data/nluLearningMeasures.js';
import { scoreOutcomeMeasure } from '../../../../../backend/src/services/outcomeMeasureScoring.js';
import { nluLearningTrends } from '../../../utils/nluLearningTrends.js';
import Form from '../OutcomeMeasureForm.vue';
import Panel from '../OutcomeMeasuresPanel.vue';
import Progress from '../NluLearningProgress.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
const fill=v=>Object.fromEntries(Array.from({length:12},(_,i)=>[`q${i+1}`,v]));
const caregiver=nluLearningMeasures[1];
const record=(id,day,value,extra={})=>({id,measureId:caregiver.id,version:caregiver.version,administration:'caregiver',questionnaire:caregiver,recordedAt:`2026-01-${day}T12:00:00Z`,pilotContext:{observedOn:`2026-01-${day}`,age:12,respondentSeries:'caregiver_1'},...scoreOutcomeMeasure(caregiver,fill(value)),...extra});
beforeEach(()=>{vi.resetAllMocks();window.confirm=vi.fn().mockReturnValue(true);api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('catalog')?{measures:nluLearningMeasures,rights:[],availableCount:3}:{responses:[]}}));});
describe('NLU pilot forms',()=>{
 it('shows 12 items with no-opportunity options and explicit pilot limits',()=>{
  const w=mount(Form,{props:{measure:nluLearningMeasures[0],preview:true}});
  expect(w.findAll('fieldset')).toHaveLength(12);expect(w.text()).toContain('Not validated');expect(w.findAll('input[value=not_observed]')).toHaveLength(12);w.unmount();
 });
 it('renders count inputs and records numeric zero without dropping it',async()=>{
  const w=mount(Form,{props:{measure:nluLearningMeasures[2]}});
  await w.get('[data-question=attempted] input').setValue('0');expect(w.emitted('update:modelValue').at(-1)[0].attempted).toBe('0');w.unmount();
 });
 it('requests the client-scoped catalog and submits caregiver identity without changing the answers',async()=>{
  const w=mount(Panel,{props:{clientId:41}});await flushPromises();
  expect(api.get).toHaveBeenCalledWith('/outcome-measures/catalog',{params:{clientId:41}});
  await w.findAll('.measure-cards button')[1].trigger('click');
  expect(w.get('.record-controls select').element.value).toBe('caregiver');
  await w.get('[data-question=q1] input[value="2"]').setValue();
  await w.get('.pilot-context input[type=number]').setValue('12');
  await w.get('.pilot-context input[type=date]').setValue('2026-01-15');
  await w.get('.pilot-context select').setValue('caregiver_1');
  await w.get('.pilot-context input[type=checkbox]').setValue(true);
  await w.get('.record-controls > label.confirmation input').setValue(true);
  api.post.mockRejectedValueOnce(new Error('offline'));
  await w.get('.record-controls').trigger('submit');await flushPromises();
  expect(api.post.mock.calls[0][1]).toMatchObject({measureId:caregiver.id,administration:'caregiver',answers:{q1:'2'},pilotContext:{age:12,observedOn:'2026-01-15',respondentSeries:'caregiver_1',programConfirmed:true}});
  expect(w.get('.pilot-context input[type=number]').element.value).toBe('12');w.unmount();
 });
});
describe('separate progress perspectives',()=>{
 it('does not compare different caregivers, versions, assistance methods or same-day reports',()=>{
  const first=record(1,'01','1'),last=record(2,'08','3');
  const separate=[record(3,'08','4',{version:'different'}),record(4,'08','4',{administration:'caregiver_assisted'}),record(5,'08','4',{pilotContext:{...last.pilotContext,respondentSeries:'caregiver_2'}})];
  const groups=nluLearningTrends([last,first,...separate]);expect(groups).toHaveLength(4);expect(groups[0].metrics[0].change).toBe(2);
  expect(groups.slice(1).every(g=>g.metrics.every(m=>m.change===null))).toBe(true);
  expect(nluLearningTrends([first,record(8,'01','3')])[0].metrics[0].change).toBeNull();
 });
 it('shows both tracks without a combined outcome or invented academic scores',()=>{
  const w=mount(Progress,{props:{responses:[record(1,'01','2')]}});
  expect(w.text()).toContain('Feeling and functioning');expect(w.text()).toContain('Academic task performance');expect(w.text()).toContain('No observed reading or math tasks');expect(w.text()).toContain('Not validated');w.unmount();
 });
});
