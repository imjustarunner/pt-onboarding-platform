import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import Combined from '../PublicIntakeInsurancePaymentStep.vue';
import Insurance from '../PublicIntakeInsuranceStep.vue';
import Shell from '../../digital-form/DigitalFormShell.vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const props = () => ({ insuranceInfo: { primary: { insurerName: 'Commercial' }, secondary: { insurerName: 'Health First Colorado', isMedicaid: true } }, clientNames: ['Sample Client'], guardianName: 'Sample Parent' });
const mountForm = overrides => mount(Combined, { props: { ...props(), ...overrides }, global: { stubs: { PublicIntakePaymentStep: { template: '<div data-card-form>Secure card form</div>' } } } });
describe('insurance enrollment', () => {
  it('settles controlled parent updates without a render loop or lost secondary coverage', async () => {
    let value; let updates = 0;
    const Host = defineComponent({ setup() {
      value = ref(props().insuranceInfo);
      return () => h(Combined, { insuranceInfo: value.value, clientNames: ['Sample Client'], 'onUpdate:insuranceInfo': next => { updates++; value.value = next; } });
    } });
    const w = mount(Host, { global: { stubs: { PublicIntakePaymentStep: true } } });
    await flushPromises(); expect(updates).toBeLessThan(10); expect(value.value.secondary.isMedicaid).toBe(true);
    value.value = { ...value.value, secondary: { insurerName: 'Medicaid', isMedicaid: true, memberId: 'RESTORED' } };
    await flushPromises(); expect(updates).toBeLessThan(15); expect(value.value.secondary.memberId).toBe('RESTORED'); w.unmount();
  });
  it('uses tenant branding and actual step progress in the compact shell', async () => {
    const w = mount(Shell, { props: { billingLayout: true, branding: { agencyName: 'Sample Institute', colorPalette: { primary: '#245c43' } }, progressSteps: [{ label: 'Client' }, { label: 'Insurance' }, { label: 'Review' }], progressIndex: 1 } });
    expect(w.text()).toContain('Sample Institute');
    expect(w.find('progress').attributes('value')).toBe('1');
    expect(w.find('progress').attributes('max')).toBe('3');
    expect(w.attributes('style')).toContain('#245c43');
    await w.setProps({ billingLayout: false }); expect(w.find('.df-billing-header').exists()).toBe(false); w.unmount();
  });
  it('secondary Medicaid hides card form, package prices, and financial liability language', () => {
    const w = mountForm({ selectedPackage: { name: 'Care package', priceCents: 120000 } });
    expect(w.find('[data-card-form]').exists()).toBe(false);
    expect(w.text()).not.toContain('$1,200');
    expect(w.text()).not.toContain('financially responsible');
    expect(w.text()).toContain('No card is requested');
    expect(w.text()).toContain('Secondary subscriber');
    w.unmount();
  });
  it('commercial, self-pay and nonclinical enrollment keep real card collection', () => {
    for (const override of [{ insuranceInfo: { primary: { insurerName: 'Commercial' } } }, { insuranceInfo: { isSelfPay: true } }, { paymentOnly: true }]) {
      const w = mountForm(override); expect(w.find('[data-card-form]').exists()).toBe(true); w.unmount();
    }
  });
  it('summary works without a package and does not fabricate a zero-dollar estimate', () => {
    const w = mountForm({ insuranceInfo: { isSelfPay: true } });
    expect(w.text()).toContain('What happens next?'); expect(w.text()).toContain('Pending service selection'); expect(w.text()).not.toContain('$0.00'); w.unmount();
  });
  it('changing to self-pay preserves declared Medicaid coverage', async () => {
    const w = mountForm();
    const btn = w.findAll('button').find(b => b.text().includes('Self-Pay'));
    await btn.trigger('click'); const update = w.emitted('update:insuranceInfo').at(-1)[0];
    expect(update.secondary.isMedicaid).toBe(true); expect(update.isSelfPay).toBe(true);
    await w.setProps({ insuranceInfo: update }); await flushPromises();
    expect(w.find('[data-card-form]').exists()).toBe(false);
    expect(w.emitted('update:insuranceInfo').at(-1)[0].secondary.isMedicaid).toBe(true); w.unmount();
  });
  it('requires explicit agreement and signature', async () => {
    const w = mountForm(); expect(w.vm.validateAuthorization()).toBe(false);
    await w.find('.pi-ip-auth-check input').setValue(true);
    expect(w.vm.validateAuthorization()).toBe(false);
    await w.find('.pi-ip-sign input').setValue('Sample Parent');
    expect(w.vm.validateAuthorization()).toBe(true); w.unmount();
  });
  it('keeps an empty secondary policy open and applies externally restored coverage', async () => {
    let w;
    w = mount(Insurance, { props: { modelValue: { primary: { insurerName: 'Commercial' } }, clientNames: ['Sample Client'], 'onUpdate:modelValue': value => w?.setProps({ modelValue: value }) } });
    await w.find('.pi-ins-secondary-toggle input').setValue(true); await flushPromises();
    expect(w.text()).toContain('Secondary subscriber');
    await w.setProps({ modelValue: { ...w.props('modelValue'), secondary: { insurerName: 'Health First Colorado', isMedicaid: true, memberId: 'SECONDARY-TEST' } } });
    await flushPromises();
    expect(w.findAll('input').some(input => input.element.value === 'SECONDARY-TEST')).toBe(true);
    expect(w.props('modelValue').secondary.isMedicaid).toBe(true); w.unmount();
  });
  it('supports keyboard uploads, rejects invalid files, and previews PDF names without broken images', async () => {
    const w = mount(Insurance, { props: { modelValue: props().insuranceInfo, clientNames: ['Sample Client'] } });
    const area = w.find('[aria-label="Upload primary front of insurance card"]');
    const input = w.find('input[type="file"]'); const click = vi.spyOn(input.element, 'click');
    await area.trigger('keydown', { key: 'Enter' }); expect(click).toHaveBeenCalled();
    await area.trigger('drop', { dataTransfer: { files: [new File(['bad'], 'bad.html', { type: 'text/html' })] } });
    expect(w.text()).toContain('no larger than 5 MB'); expect(w.vm.getPhotoFiles().primary_front).toBeNull();
    const file = new File(['synthetic PDF'], 'insurance.pdf', { type: 'application/pdf' });
    await area.trigger('drop', { dataTransfer: { files: [file] } }); await flushPromises();
    expect(w.vm.getPhotoFiles().primary_front).toBe(file); expect(area.text()).toContain('insurance.pdf'); expect(area.find('img').exists()).toBe(false); w.unmount();
  });
});
