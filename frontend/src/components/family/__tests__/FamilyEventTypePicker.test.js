import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Picker from '../FamilyEventTypePicker.vue';
describe('picture search and selection',()=>{
 it('filters the visual library and selects the same type as the native selector',async()=>{
   const wrapper=mount(Picker,{props:{modelValue:'family'}});
   await wrapper.find('input[type=search]').setValue('zoo');
   wrapper.find('details').element.open=true;await wrapper.find('details').trigger('toggle');
   const buttons=wrapper.findAll('.picture-grid button');expect(buttons).toHaveLength(1);
   expect(buttons[0].find('img').attributes('src')).toBe('/assets/family-events/zoo.jpg');
   await buttons[0].trigger('click');expect(wrapper.emitted('update:modelValue')).toEqual([['zoo']]);
   expect(wrapper.emitted('change')[0][0]).toMatchObject({id:'zoo',icon:'🦒',artwork:'/assets/family-events/zoo.jpg'});
   wrapper.unmount();
 });
 it('does not mount hidden images and bounds the gallery to pages of 24',async()=>{
   const wrapper=mount(Picker);expect(wrapper.findAll('img')).toHaveLength(0);
   wrapper.find('details').element.open=true;await wrapper.find('details').trigger('toggle');
   expect(wrapper.findAll('img')).toHaveLength(24);
   await wrapper.find('.more-pictures').trigger('click');expect(wrapper.findAll('img')).toHaveLength(48);
   await wrapper.find('input[type=search]').setValue('zoo');expect(wrapper.findAll('img')).toHaveLength(1);
   wrapper.find('details').element.open=false;await wrapper.find('details').trigger('toggle');expect(wrapper.findAll('img')).toHaveLength(0);
   wrapper.unmount();
 });

});
