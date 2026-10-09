import {it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Editor from '../ProviderFocusEditor.vue';
import {FOCUS_GROUPS,missingFocusGroups,validateFocus} from '../../../navigation/providerFocus.js';
const complete=()=>({top:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,g.options.slice(0,3)])),excluded:Object.fromEntries(FOCUS_GROUPS.map(g=>[g.key,[]]))});
it('rejects missing top choices across every category and accepts exactly three valid choices',()=>{
 const value=complete();expect(validateFocus(value,FOCUS_GROUPS,{requireThree:true}).reviewed).toBe(true);
 for(const group of FOCUS_GROUPS){const partial=complete();partial.top[group.key]=group.options.slice(0,2);expect(missingFocusGroups(partial).map(g=>g.key)).toEqual([group.key]);expect(()=>validateFocus(partial,FOCUS_GROUPS,{requireThree:true})).toThrow(group.label);}
 const duplicate=complete();duplicate.top.specialties=[...duplicate.top.specialties.slice(0,2),duplicate.top.specialties[0]];expect(()=>validateFocus(duplicate,FOCUS_GROUPS,{requireThree:true})).toThrow('exactly three');
});
it('highlights only missing groups, prevents a fourth choice, and removes an excluded choice from the top three',async()=>{
 const value=complete();value.top.populations=value.top.populations.slice(0,2);
 const w=mount(Editor,{props:{modelValue:value,groups:FOCUS_GROUPS,requireThree:true}});
 expect(w.findAll('.focus-missing')).toHaveLength(1);expect(w.get('.focus-missing').attributes('data-focus-group')).toBe('populations');expect(w.get('.focus-missing').text()).toContain('select 1 more top choice');
 const options=w.get('[data-focus-group="specialties"]').findAll('.focus-option');expect(options[3].findAll('input')[1].element.disabled).toBe(true);
 await options[0].findAll('input')[0].setValue(false);const changed=w.emitted('update:modelValue')[0][0];expect(changed.top.specialties).toHaveLength(2);expect(changed.excluded.specialties).toContain(FOCUS_GROUPS[0].options[0]);w.unmount();
});

it('limits highlights to three and visibly excludes deselected options',async()=>{
 const props={modelValue:{top:{populations:['A','B','C']},excluded:{populations:[]}},groups:[{key:'populations',label:'Populations',options:['A','B','C','D']}]};const w=mount(Editor,{props});expect(w.findAll('.highlighted')).toHaveLength(3);
 expect(w.findAll('.focus-option')[3].findAll('input')[1].attributes('disabled')).toBeDefined();await w.findAll('.focus-option')[0].findAll('input')[0].setValue(false);const next=w.emitted('update:modelValue')[0][0];expect(next).toEqual({top:{populations:['B','C']},excluded:{populations:['A']}});await w.setProps({modelValue:next});expect(w.findAll('.excluded')).toHaveLength(1);expect(w.findAll('.highlighted')).toHaveLength(2);expect(w.findAll('.focus-option')[3].findAll('input')[1].attributes('disabled')).toBeUndefined();
});
