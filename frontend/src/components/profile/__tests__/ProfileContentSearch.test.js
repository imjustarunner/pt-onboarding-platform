import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Search from '../ProfileContentSearch.vue';
const targets=[{id:'cards',label:'Business cards',tabId:'account',sectionId:'cards',breadcrumb:'Account',kind:'Section'},{id:'modality',label:'Treatment modalities',tabId:'clinical',fieldId:2,sectionId:'field-2',breadcrumb:'Clinical Information › Approaches',content:'Cognitive Behavioral Therapy (CBT)',kind:'Profile field'}];
describe('profile content search control',()=>{
 it('supports keyboard search, destination selection, and content breadcrumbs',async()=>{
  const w=mount(Search,{props:{targets}});const input=w.get('input');await input.trigger('focus');await input.setValue('CBT');
  expect(w.text()).toContain('Treatment modalities');expect(w.text()).toContain('Clinical Information › Approaches');expect(w.text()).toContain('Content match');
  await input.trigger('keydown',{key:'ArrowDown'});await input.trigger('keydown',{key:'Enter'});
  expect(w.emitted('select')[0][0]).toMatchObject({fieldId:2,sectionId:'field-2'});expect(w.find('[role=listbox]').exists()).toBe(false);w.unmount();
 });
 it('clears results across people or agencies and supports Escape',async()=>{
  const w=mount(Search,{props:{targets,scopeKey:'user1-agency1'}});await w.get('input').setValue('bus');expect(w.find('[role=option]').exists()).toBe(true);
  await w.get('input').trigger('keydown',{key:'Escape'});expect(w.find('[role=listbox]').exists()).toBe(false);
  await w.setProps({scopeKey:'user2-agency2'});expect(w.get('input').element.value).toBe('');w.unmount();
 });
 it('keeps page navigation available when content loading fails',async()=>{
  const w=mount(Search,{props:{targets,error:'Some content could not be loaded.'}});await w.get('input').setValue('business');
  expect(w.text()).toContain('Some content could not be loaded');expect(w.findAll('[role=option]')).toHaveLength(1);w.unmount();
 });
});
