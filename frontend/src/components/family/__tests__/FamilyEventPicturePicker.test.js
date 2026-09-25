import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Picker from '../FamilyEventPicturePicker.vue';
import {familyEventTypes,eventArtworkChoices} from '../../../utils/familyCommandCenter';
describe('independent event picture library',()=>{
 it('shows the selected picture immediately and searches all images only when opened',async()=>{
  const w=mount(Picker,{props:{modelValue:{eventType:'scheels-shopping',autoTheme:true,color:'#123456'}}});
  expect(w.find('.fcc-art-preview').attributes('src')).toContain('scheels-shopping.jpg');
  expect(w.findAll('.image-library-grid img')).toHaveLength(0);
  await w.find('.picture-heading button').trigger('click');
  expect(w.findAll('.image-library-grid img')).toHaveLength(24);
  await w.find('input[type=search]').setValue('rooftop');
  expect(w.findAll('.image-library-grid button')).toHaveLength(1);
  await w.find('.image-library-grid button').trigger('click');
  const value=w.emitted('update:modelValue')[0][0];
  expect(value).toMatchObject({eventType:'scheels-shopping',autoTheme:true,color:'#123456',artworkType:'camping',artworkVariant:'camping-tundra-rooftop',artwork:null});
  await w.setProps({modelValue:JSON.parse(JSON.stringify(value))});
  expect(w.find('.fcc-art-preview').attributes('src')).toContain('camping-tundra-rooftop');
  await w.find('input[type=search]').setValue('scheels');
  expect(w.findAll('.image-library-grid img')).toHaveLength(1);
  await w.find('input[type=search]').setValue('zzzznomatch');expect(w.text()).toContain('try another search');
  await w.find('.picture-heading button').trigger('click');expect(w.findAll('.image-library-grid img')).toHaveLength(0);
 });
 it('includes every distinct loaded picture, including all camping versions and national parks',async()=>{
  const w=mount(Picker,{props:{modelValue:{eventType:'family'}}});await w.find('.picture-heading button').trigger('click');
  while(w.findAll('button').some(b=>b.text()==='Show more pictures'))await w.findAll('button').find(b=>b.text()==='Show more pictures').trigger('click');
  const expected=new Set(familyEventTypes.flatMap(t=>eventArtworkChoices(t.id).map(c=>c.artwork)));
  expect(new Set(w.findAll('.image-library-grid img').map(i=>i.attributes('src')))).toEqual(expected);
 });
});
