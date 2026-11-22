import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import ClientTypeEditor from '../clientChart/ClientTypeEditor.vue';

it('keeps an assignment active, allows staff to retain it after unlinking, and opens its source', async () => {
  const profile = { revision:3, selected:[], minorDefault:true, suppressMinorDefault:false, evidence:{
    school:[{label:'Pine School',tab:'assignments'}],
    dependent:[{label:'Current minor without a personal portal',tab:'guardians',minorDefault:true}]
  }};
  const w = mount(ClientTypeEditor,{props:{profile,canEdit:true,label:'School · Dependent'}});
  const checkbox = (label) => w.findAll('label').find(el => el.text() === label).get('input');
  expect(checkbox('School').element.checked).toBe(true);
  expect(checkbox('School').element.disabled).toBe(true);
  expect(checkbox('Dependent').element.checked).toBe(true);
  await checkbox('Retain School after its linked assignment ends').setValue(true);
  expect(checkbox('Clinical').element.disabled).toBe(true);
  await checkbox('Retain Clinical after its linked assignment ends').setValue(true);
  await checkbox('Dependent').setValue(false);
  await w.findAll('button').find(button => button.text() === 'Save types').trigger('click');
  const [change] = w.emitted('save')[0];
  expect(change.types.sort()).toEqual(['clinical','school']);
  expect(change).toMatchObject({revision:3,suppressMinorDefault:true});
  await w.findAll('button').find(button => button.text() === 'Pine School').trigger('click');
  expect(w.emitted('manage')[0]).toEqual(['assignments']);
  w.unmount();
});

it('derives Clinical immediately while School is selected and releases it when School is cleared', async () => {
  const profile = { revision:0, selected:[], evidence:{}, suppressMinorDefault:false };
  const w = mount(ClientTypeEditor, {props:{profile, canEdit:true}});
  const box = label => w.findAll('label').find(el => el.text() === label).get('input');
  await box('School').setValue(true);
  expect(box('Clinical').element.checked).toBe(true);
  expect(box('Clinical').element.disabled).toBe(true);
  await w.get('button').trigger('click');
  expect(w.emitted('save')[0][0].types).toEqual(['school']);
  await box('School').setValue(false);
  expect(box('Clinical').element.checked).toBe(false);
  expect(box('Clinical').element.disabled).toBe(false);
  w.unmount();
});
