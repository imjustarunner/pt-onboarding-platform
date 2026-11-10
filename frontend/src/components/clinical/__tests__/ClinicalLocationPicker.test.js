import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Picker from '../ClinicalLocationPicker.vue';
const choices=[{value:'service:1',name:'Assigned office',placeOfService:'11',serviceLocationId:1,billingOfficeLocationId:2},{value:'service:2',name:'Assigned school',placeOfService:'03',serviceLocationId:2,schoolOrganizationId:40},{value:'service:3',name:'Telehealth',placeOfService:'10',serviceLocationId:3,billingOfficeLocationId:2},{value:'service:4',name:'Telehealth',placeOfService:'02',serviceLocationId:4,billingOfficeLocationId:2}];
async function choose(w,value,label='Location'){await w.get(`select[aria-label="${label}"]`).setValue(value);await w.setProps({modelValue:w.emitted('update:modelValue').at(-1)[0]});}
describe('one encounter location selector',()=>{
 it('derives coherent office, remote and home details and asks the remote home question only when needed',async()=>{
  const w=mount(Picker,{props:{choices,modelValue:{}}});expect(w.emitted()).toEqual({});
  await choose(w,'service:1');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({modality:'in_person',placeOfService:'11',serviceLocationId:1});expect(w.findAll('select')).toHaveLength(1);
  await choose(w,'__telehealth_video__');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({modality:'video',placeOfService:''});expect(w.findAll('select')).toHaveLength(2);
  await choose(w,'10','Client’s location during telehealth');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({modality:'video',placeOfService:'10',serviceLocationId:3});
  await choose(w,'__telehealth_phone__');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({modality:'phone',placeOfService:'10'});
  await choose(w,'__home__');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({modality:'in_person',placeOfService:'12'});expect(w.findAll('select')).toHaveLength(1);w.unmount();
 });
 it('restores saved choices without emitting edits, preserves historical labels and does not expose unassigned sites',async()=>{
  const w=mount(Picker,{props:{choices,modelValue:{locationLabel:'Former office name',serviceLocationId:1,placeOfService:'11',modality:'in_person'}}});
  expect(w.get('select').element.value).toBe('saved');expect(w.text()).toContain('Former office name');expect(w.emitted()).toEqual({});
  await w.setProps({modelValue:{locationLabel:'Telehealth',placeOfService:'02',modality:'phone'}});expect(w.get('select[aria-label="Location"]').element.value).toBe('__telehealth_phone__');expect(w.get('select[aria-label="Client’s location during telehealth"]').element.value).toBe('02');expect(w.emitted()).toEqual({});
  await choose(w,'service:2');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({schoolOrganizationId:40,placeOfService:'03',modality:'in_person'});w.unmount();
 });
 it('preserves the known billing office through the home-location question without selecting a different office template',async()=>{
  const w=mount(Picker,{props:{choices:[...choices,{value:'service:20',name:'Other telehealth template',placeOfService:'10',serviceLocationId:20,billingOfficeLocationId:7}],modelValue:{locationLabel:'Assigned office',placeOfService:'11',serviceLocationId:1,billingOfficeLocationId:2,modality:'in_person'}}});
  await choose(w,'__telehealth_video__');expect(w.emitted('update:modelValue').at(-1)[0].billingOfficeLocationId).toBe(2);
  await choose(w,'10','Client’s location during telehealth');expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({billingOfficeLocationId:2,serviceLocationId:3});w.unmount();
 });
});
