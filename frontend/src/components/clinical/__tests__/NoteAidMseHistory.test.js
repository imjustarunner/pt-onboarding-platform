import {mount,flushPromises} from '@vue/test-utils';
import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(async()=>({data:{interventions:[]}})),post:vi.fn()}}));
import Builder from '../NoteAidCsNoteBuildPanel.vue';
import Chart from '../NoteAidStructuredChartPanel.vue';
import Picker from '../NoteAidMseHistoryPicker.vue';
import {MSE_DOMAIN_DEFS} from '../../../utils/noteAidMseCatalog.js';
import {createEmptyCsNoteBuildState,CS_MSE_FIELDS} from '../../../utils/csNoteBuild.js';
const history=[{id:17,dateOfService:'2026-11-15',mse:{domains:{Mood:{status:'selected',option:'Anxious',detail:'Observed in prior encounter'},Appearance:{status:'selected',option:'Appropriate',detail:''}}}}];
let wrapper;
afterEach(()=>wrapper?.unmount());
const button=(w,text)=>w.findAll('button').find(item=>item.text()===text);
it('uses Narriva’s full option catalog while leaving every field unassessed until an explicit action',()=>{
 wrapper=mount(Builder,{props:{modelValue:createEmptyCsNoteBuildState()}});
 expect(CS_MSE_FIELDS).toHaveLength(MSE_DOMAIN_DEFS.length);
 expect(wrapper.findAll('.csnb-mse-grid input').every(input=>input.element.value==='')).toBe(true);
 expect(wrapper.find('datalist').findAll('option').length).toBeGreaterThan(3);
});
it('marks all MSE domains normal without claiming that risk was assessed or denied',async()=>{
 wrapper=mount(Builder,{props:{modelValue:createEmptyCsNoteBuildState()}});
 await button(wrapper,'All Normal').trigger('click');await flushPromises();
 const model=wrapper.emitted('update:modelValue').at(-1)[0];
 expect(Object.values(model.mse).every(Boolean)).toBe(true);expect(model.mse.mood).toBe('Euthymic');expect(model.riskLevel).toBe('');expect(model.riskDetails).toBe('');
 await button(wrapper,'All Not Assessed').trigger('click');
 expect(wrapper.emitted('update:modelValue').at(-1)[0].mse.mood).toBe('Not assessed');
});
it('does not apply old findings merely by selecting a prior note',async()=>{
 wrapper=mount(Builder,{props:{modelValue:createEmptyCsNoteBuildState(),mseHistory:history}});
 const picker=wrapper.findComponent(Picker);await picker.find('select').setValue('17');
 expect(button(picker,'Apply reviewed findings').attributes('disabled')).toBeDefined();
 expect(wrapper.find('[aria-label="Mood"]').element.value).toBe('');
 await picker.find('input[type=checkbox]').setValue(true);await button(picker,'Apply reviewed findings').trigger('click');await flushPromises();
 const model=wrapper.emitted('update:modelValue').at(-1)[0];
 expect(model.mse.mood).toBe('Anxious');expect(model.mseSource).toMatchObject({noteId:17,sourceDate:'2026-11-15',confirmedForCurrentSession:true});
 expect(wrapper.text()).toContain('Reviewed findings from 2026-11-15');expect(history[0].mse.domains.Mood.option).toBe('Anxious');
});
it('clears MSE data when the parent opens a different empty note',async()=>{
 wrapper=mount(Builder,{props:{modelValue:{...createEmptyCsNoteBuildState(),mse:{mood:'Anxious'}}}});
 expect(wrapper.find('[aria-label="Mood"]').element.value).toBe('Anxious');
 await wrapper.setProps({modelValue:createEmptyCsNoteBuildState()});
 expect(wrapper.find('[aria-label="Mood"]').element.value).toBe('');
});
it('offers the same explicit history review in the structured chart MSE',async()=>{
 wrapper=mount(Chart,{props:{mse:{domains:{}},mseHistory:history,includeRisk:false}});
 const picker=wrapper.findComponent(Picker);await picker.find('select').setValue('17');
 expect(wrapper.emitted('update:mse')).toBeUndefined();
 await picker.find('input[type=checkbox]').setValue(true);await button(picker,'Apply reviewed findings').trigger('click');
 expect(wrapper.emitted('update:mse').at(-1)[0]).toMatchObject({domains:{Mood:{option:'Anxious'}},source:{sourceDate:'2026-11-15',confirmedForCurrentSession:true}});
});
it('requires renewed confirmation if the selected history data changes',async()=>{
 wrapper=mount(Picker,{props:{history}});await wrapper.find('select').setValue('17');await wrapper.find('input').setValue(true);
 await wrapper.setProps({history:[{...history[0],mse:{mood:'Calm'}}]});
 expect(button(wrapper,'Apply reviewed findings').attributes('disabled')).toBeDefined();expect(wrapper.emitted('apply')).toBeUndefined();
});
it('keeps history out of the disabled demonstration preview',()=>{
 wrapper=mount(Builder,{props:{previewOnly:true,mseHistory:history,modelValue:{mse:{mood:'Anxious'}}}});
 expect(wrapper.find('.mse-history').exists()).toBe(false);expect(wrapper.find('[aria-label="Mood"]').element.value).toBe('');
});
