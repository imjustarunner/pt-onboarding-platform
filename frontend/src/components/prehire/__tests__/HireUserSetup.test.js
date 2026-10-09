import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import HireUserSetup from '../HireUserSetup.vue';
const step={clinical:true,demographicFields:[{key:'provider_marketing_gender',label:'Optional gender'}],focusGroups:[{key:'specialties',label:'Specialties',options:['Anxiety','Depression','Family','Grief']}],values:{contact:{},demographics:{},languages:[],credential:'',blurb:'',typicalAvailability:[],clinicalFocus:{top:{specialties:[]},excluded:{specialties:[]}}}};
describe('onboarding shared profile setup',()=>{
 it('shows the shared focus editor with empty initial availability',()=>{
  const w=mount(HireUserSetup,{props:{step}});expect(w.text()).toContain('Top three');expect(w.text()).toContain('Consider matches');
  expect(w.findAll('input[type=checkbox]').filter(i=>i.element.checked)).toHaveLength(4);
 });
 it('saves changed introduction and focus using the same canonical shape',async()=>{
  const w=mount(HireUserSetup,{props:{step}});await w.find('textarea').setValue('Hello families');
  const options=w.findAll('.focus-option');await options[0].findAll('input')[1].setValue(true);
  await options[1].findAll('input')[0].setValue(false);await w.find('form').trigger('submit');
  expect(w.emitted('save')[0][0].values).toMatchObject({blurb:'Hello families',typicalAvailability:[],clinicalFocus:{top:{specialties:['Anxiety']},excluded:{specialties:['Depression']}}});
 });
 it('retained setup is readonly even for a programmatic submit',async()=>{
  const w=mount(HireUserSetup,{props:{step,readonly:true}});await w.find('form').trigger('submit');expect(w.emitted('save')).toBeUndefined();
 });
});
