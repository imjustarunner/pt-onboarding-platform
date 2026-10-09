import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Form from '../HireSchoolAvailability.vue';
const step = { values: { available: null, blocks: [], notes: '' } };
const form = props => mount(Form, { props: { step, ...props } });
describe('school service onboarding availability', () => {
  it('requires an explicit choice and a weekday before saving', async () => {
    const w = form();
    expect(w.findAll('input:checked')).toHaveLength(0);
    await w.find('form').trigger('submit'); expect(w.emitted('save')).toBeUndefined();
    await w.findAll('input[type=radio]')[0].setValue(true);
    await w.find('form').trigger('submit'); expect(w.get('[role=alert]').text()).toContain('at least one');
    expect(w.emitted('save')).toBeUndefined();
  });
  it('defaults selected weekdays to 8–3, allows changes, and emits only selected days', async () => {
    const w = form(); await w.findAll('input[type=radio]')[0].setValue(true);
    await w.findAll('.day-name input')[0].setValue(true);
    await w.findAll('.day-name input')[2].setValue(true);
    expect(w.findAll('input[type=time]').map(i => i.element.value)).toEqual(['08:00','15:00','08:00','15:00']);
    await w.get('[aria-label="Wednesday end time"]').setValue('14:00');
    await w.find('form').trigger('submit');
    expect(w.emitted('save')[0][0]).toEqual({ complete: true, values: { available: true, notes: '', blocks: [
      { dayOfWeek:'Monday', startTime:'08:00', endTime:'15:00' }, { dayOfWeek:'Wednesday', startTime:'08:00', endTime:'14:00' }
    ] } });
  });
  it('rejects reversed hours and allows explicit no availability without stale blocks', async () => {
    const w = form({ step: { values: { available: true, notes: 'Starts next term', blocks: [{dayOfWeek:'Monday',startTime:'15:00',endTime:'08:00'}] } } });
    await w.find('form').trigger('submit'); expect(w.emitted('save')).toBeUndefined();
    await w.findAll('input[type=radio]')[1].setValue(true); await w.find('form').trigger('submit');
    expect(w.emitted('save')[0][0].values).toEqual({available:false,blocks:[],notes:'Starts next term'});
  });
  it('restores saved hours and prevents edits to closed onboarding', async () => {
    const w = form({ readonly: true, step: { values: { available:true,notes:'Travel',blocks:[{dayOfWeek:'Friday',startTime:'09:30',endTime:'13:00'}] } } });
    expect(w.get('[aria-label="Friday start time"]').element.value).toBe('09:30');
    expect(w.get('fieldset').attributes('disabled')).toBeDefined();
    await w.find('form').trigger('submit'); expect(w.emitted('save')).toBeUndefined();
  });
});
