import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
// Vite rewrites asset URLs to HTTP in jsdom; load the real reviewed JSON directly.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  const { default: rights } = await import('../../../../../backend/src/data/outcomeMeasureRights.json');
  const readFileSync = () => JSON.stringify(rights);
  return { ...actual, readFileSync, default: { ...actual.default, readFileSync } };
});
import Form from '../OutcomeMeasureForm.vue';
import Panel from '../OutcomeMeasuresPanel.vue';
import { outcomeMeasures, measureRights, getOutcomeMeasure } from '../../../../../backend/src/data/outcomeMeasures.js';
import { scoreOutcomeMeasure } from '../../../../../backend/src/services/outcomeMeasureScoring.js';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
const catalog={measures:outcomeMeasures,rights:measureRights,availableCount:9,reviewedCount:33,checkedAt:'2026-10-10'};
const button=(w,text)=>w.findAll('button').find(b=>b.text().includes(text));
beforeEach(()=>{vi.resetAllMocks();window.confirm=vi.fn().mockReturnValue(true);api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('catalog')?catalog:{responses:[]}}));});
describe('instrument forms',()=>{
  it('renders all nine as disabled blank previews with sources and no save control',()=>{
    for(const measure of outcomeMeasures){const w=mount(Form,{props:{measure,preview:true}});expect(w.findAll('fieldset')).toHaveLength(measure.items.length);expect(w.findAll('fieldset').every(f=>f.attributes('disabled')!==undefined)).toBe(true);expect(w.text()).toContain(measure.rights.attribution);expect(w.find('button[type=submit]').exists()).toBe(false);w.unmount();}
  });
  it('flags PHQ-9 item 9 immediately, even when other answers are missing',()=>{const w=mount(Form,{props:{measure:getOutcomeMeasure('phq-9'),modelValue:{q9:'1'}}});expect(w.get('[role=alert]').text()).toContain('Direct safety follow-up');w.unmount();});
  it('keeps LEC does-not-apply exclusive while allowing multiple exposure types',async()=>{
    const w=mount(Form,{props:{measure:getOutcomeMeasure('lec-5'),modelValue:{q1:['5']}}});await w.get('[data-question=q1] input[value="0"]').setValue(true);expect(w.emitted('update:modelValue').at(-1)[0].q1).toEqual(['0']);
    await w.setProps({modelValue:{q1:['0','1']}});await w.get('[data-question=q1] input[value="5"]').setValue(true);expect(w.emitted('update:modelValue').at(-1)[0].q1).toEqual(['5']);w.unmount();
  });
  it('clears hidden TAPS answers when their parent response changes',async()=>{
    const w=mount(Form,{props:{measure:getOutcomeMeasure('taps'),modelValue:{alcohol_branch:'female',tobacco:'1',tobacco_0:'1',tobacco_1:'1'}}});expect(w.find('[data-question=tobacco_1]').exists()).toBe(true);
    await w.get('[data-question=tobacco] input[value="0"]').setValue();expect(w.emitted('update:modelValue').at(-1)[0]).toEqual({alcohol_branch:'female',tobacco:'0'});w.unmount();
  });
  it('shows FTND symptom questions only for current cigarette smoking',async()=>{const w=mount(Form,{props:{measure:getOutcomeMeasure('ftnd')}});expect(w.findAll('fieldset')).toHaveLength(1);await w.setProps({modelValue:{current_smoking:'1'}});expect(w.findAll('fieldset')).toHaveLength(7);w.unmount();});
});
describe('catalog and client workflow',()=>{
  it('searches and previews without requesting any clinical record',async()=>{const w=mount(Panel);await flushPromises();expect(w.findAll('.measure-cards button')).toHaveLength(9);await w.get('input[type=search]').setValue('depression');expect(w.findAll('.measure-cards button')).toHaveLength(1);await w.get('.measure-cards button').trigger('click');expect(w.getComponent(Form).props('preview')).toBe(true);expect(api.get).toHaveBeenCalledTimes(1);expect(w.find('.record-controls').exists()).toBe(false);w.unmount();});
  it('records server-scored results and preserves submission ID after a network error',async()=>{
    const w=mount(Panel,{props:{clientId:41}});await flushPromises();await button(w,'PHQ-9').trigger('click');
    await w.get('[data-question=q1] input[value="1"]').setValue();await w.get('.record-controls input[type=checkbox]').setValue(true);
    api.post.mockRejectedValueOnce(new Error('Network error'));await w.get('.record-controls').trigger('submit');await flushPromises();
    expect(w.get('[data-question=q1] input[value="1"]').element.checked).toBe(true);
    const request=api.post.mock.calls[0][1];const measure=getOutcomeMeasure('phq-9');const {answers,result}=scoreOutcomeMeasure(measure,request.answers);
    api.post.mockResolvedValueOnce({data:{response:{id:1,measureId:measure.id,version:measure.version,questionnaire:measure,answers,result,administration:'self',recordedAt:'2026-10-10T12:00:00Z'}}});
    await w.get('.record-controls').trigger('submit');await flushPromises();expect(api.post.mock.calls[1][1].requestId).toBe(request.requestId);expect(w.find('.record-controls').exists()).toBe(false);expect(w.get('.result-card').text()).toContain('Incomplete responses');expect(w.get('.result-card').text()).toContain('No total score');w.unmount();
  });
  it('protects unsaved answers and refuses clinical forms for unauthorized clients',async()=>{
    const w=mount(Panel,{props:{clientId:41}});await flushPromises();await button(w,'GAD-7').trigger('click');await w.get('[data-question=q1] input[value="0"]').setValue();window.confirm.mockReturnValue(false);expect(w.vm.canLeave()).toBe(false);w.unmount();
    api.get.mockImplementation(path=>path.endsWith('catalog')?Promise.resolve({data:catalog}):Promise.reject({response:{status:403,data:{error:{message:'Access denied to this client.'}}}}));
    const denied=mount(Panel,{props:{clientId:99}});await flushPromises();expect(denied.findAll('.measure-cards button').every(b=>b.attributes('disabled')!==undefined)).toBe(true);expect(denied.text()).toContain('Access denied');denied.unmount();
  });
  it('ignores results arriving after a client switch',async()=>{
    let resolveOld;api.get.mockImplementation(path=>path.endsWith('catalog')?Promise.resolve({data:catalog}):path.endsWith('/41')?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve({data:{responses:[]}}));
    const w=mount(Panel,{props:{clientId:41}});await flushPromises();await w.setProps({clientId:42});await flushPromises();resolveOld({data:{responses:[{id:1,questionnaire:{title:'Other client private result'}}]}});await flushPromises();expect(w.text()).not.toContain('Other client private result');w.unmount();
  });
  it('requires clinical follow-up confirmation before recording review of a safety flag',async()=>{
    const m=getOutcomeMeasure('phq-9'),scored=scoreOutcomeMeasure(m,{q9:'1'});
    const response={id:1,measureId:m.id,version:m.version,questionnaire:m,...scored,administration:'self',recordedAt:'2026-10-10T12:00:00Z'};
    api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('catalog')?catalog:{responses:[response]}}));api.post.mockResolvedValue({data:{reviewed:true}});
    const w=mount(Panel,{props:{clientId:41}});await flushPromises();expect(w.get('.result-flag.urgent').text()).toContain('direct suicide/self-harm assessment');
    expect(w.get('.review-form input[type=checkbox]').attributes('required')).toBeDefined();
    await w.get('.review-form textarea').setValue('Synthetic direct follow-up and next steps.');
    await w.get('.review-form input[type=checkbox]').setValue(true);
    await w.get('.review-form form').trigger('submit');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/outcome-measures/clients/41/1/review',{note:'Synthetic direct follow-up and next steps.',safetyFollowUpConfirmed:true});
    w.unmount();
  });
});
