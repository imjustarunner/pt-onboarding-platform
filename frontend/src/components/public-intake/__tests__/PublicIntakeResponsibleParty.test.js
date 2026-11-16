import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { expect, it } from 'vitest';
import ResponsibleParty from '../PublicIntakeResponsibleParty.vue';

function form(options = {}) {
  const value = ref(options.value || null);
  const Host = defineComponent({ setup: () => () => h(ResponsibleParty, { modelValue: value.value, name: 'Synthetic Parent', email: 'parent@example.test', phone: '7195550101', 'onUpdate:modelValue': next => { value.value = next; } }) });
  const w = mount(Host, { global: { provide: { intakeLocale: ref(options.locale || 'en') } } });
  return { w, value, component: w.findComponent(ResponsibleParty) };
}

it('leaves missing responsibility on the portal todo list and never silently selects a payer', () => {
  const { w, value, component } = form();
  expect(value.value).toBeNull(); expect(component.vm.validate()).toBe(true);
  expect(w.text()).toContain('portal to-do list'); w.unmount();
});

it('selects the current applicant using their displayed account information', async () => {
  const { w, value, component } = form(); await w.get('select').setValue('applicant');
  expect(value.value).toEqual({ kind: 'applicant' });
  expect(w.text()).toContain('Synthetic Parent · parent@example.test · 7195550101');
  expect(component.vm.validate()).toBe(true); w.unmount();
});

it('requires another responsible party’s full address, phone and email before proceeding', async () => {
  const { w, value, component } = form(); await w.get('select').setValue('other');
  expect(component.vm.validate()).toBe(false);
  const fields = ['Synthetic Contact', 'billing@example.test', '7195550102', '123 Synthetic St', 'Example', 'CO', '80000'];
  for (const [index, input] of w.findAll('input').entries()) await input.setValue(fields[index]);
  expect(component.vm.validate()).toBe(true); expect(value.value.contact).toMatchObject({ fullName: fields[0], postalCode: '80000' });
  expect(w.text()).toContain('Portal access and payment authorization are selected separately'); w.unmount();
});

it('presents the selection and required contact labels in Spanish', () => {
  const { w } = form({ locale: 'es', value: { kind: 'other', contact: {} } });
  expect(w.text()).toContain('Persona responsable de la facturación');
  expect(w.text()).toContain('Dirección postal'); expect(w.text()).toContain('Correo electrónico de facturación'); w.unmount();
});
