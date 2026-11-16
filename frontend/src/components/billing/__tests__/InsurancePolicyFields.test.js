import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import InsurancePolicyFields from '../InsurancePolicyFields.vue';

const patient = { firstName: 'Synthetic', lastName: 'Student', dateOfBirth: '2012-11-19', sex: 'M', addressLine1: '123 Synthetic St', city: 'Example', state: 'CO', postalCode: '80000' };

it('automatically selects and locks Self for saved Medicaid with the client subscriber identity', async () => {
  const w = mount(InsurancePolicyFields, { props: { patient, modelValue: { programType: 'medicaid', relationshipToSubscriber: 'child' } } });
  const emitted = w.emitted('update:modelValue').at(-1)[0];
  expect(emitted).toMatchObject({ relationshipToSubscriber: 'self', subscriberFirstName: 'Synthetic', subscriberLastName: 'Student', subscriberDob: '2012-11-19', subscriberSex: 'M' });
  await w.setProps({ modelValue: emitted });
  expect(w.findAll('select')[1].attributes('disabled')).toBeDefined();
  expect(w.text()).toContain('primary and secondary coverage');
  expect(w.text()).not.toContain('Subscriber legal first name');
  w.unmount();
});

it('updates Medicaid to Self when staff checks the Medicaid option and preserves commercial choice', async () => {
  const w = mount(InsurancePolicyFields, { props: { patient, modelValue: { programType: 'commercial', relationshipToSubscriber: 'child' } } });
  expect(w.findAll('select')[1].attributes('disabled')).toBeUndefined();
  await w.get('input[type="checkbox"]').setValue(true);
  expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({ isMedicaid: true, programType: 'medicaid', relationshipToSubscriber: 'self', subscriberFirstName: 'Synthetic' });
  w.unmount();
});
