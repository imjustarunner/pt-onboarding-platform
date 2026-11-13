import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Editor from '../ChildcareRateScheduleEditor.vue';
import Roles from '../ContractServiceRolesEditor.vue';
const policy = { category1: [17, 18, 19, 20, 20], category2AndAbove: [22, 23, 24, 24, 24], additionalChildAmounts: [0, 4, 6, 8] };
describe('individual childcare band schedule', () => {
  it('resolves the actual selected childcare placement and updates independent bands', async () => {
    const wrapper = mount(Editor, { props: { category: 2, level: 3, policy, modelValue: { 2: 35 } } });
    expect(wrapper.get('[data-testid=childcare-resolved-1]').text()).toBe('$24.00');
    expect(wrapper.get('[data-testid=childcare-resolved-2]').text()).toBe('$35.00');
    expect(wrapper.get('[data-testid=childcare-resolved-4]').text()).toBe('$32.00');
    await wrapper.get('input[aria-label="3-child hourly-rate override"]').setValue('38.50');
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual({ 2: 35, 3: '38.50' });
    await wrapper.setProps({ category: 1, level: 1 });
    expect(wrapper.get('[data-testid=childcare-resolved-1]').text()).toBe('$17.00');
  });
  it('preserves legacy flat overrides and removes a cleared band without changing the others', async () => {
    const wrapper = mount(Editor, { props: { category: 2, level: 3, policy, flatRate: 31, modelValue: { 4: 40 } } });
    expect(wrapper.get('[data-testid=childcare-resolved-1]').text()).toBe('$31.00');
    expect(wrapper.get('[data-testid=childcare-resolved-4]').text()).toBe('$40.00');
    await wrapper.get('input[aria-label="4-child hourly-rate override"]').setValue('');
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual({});
  });
  it('does not invent rates when the organization schedule is unavailable', () => {
    const wrapper = mount(Editor, { props: { category: 2, level: 3 } });
    expect(wrapper.get('[data-testid=childcare-resolved-1]').text()).toBe('Review required');
  });
  it('saves four-band terms without replacing the employee general level or other roles', async () => {
    const wrapper = mount(Roles, { props: { compensationCategory: 2, serviceCompensation: { childcare: policy }, modelValue: { compensationLevel: 5, serviceRoles: ['tutoring', 'childcare'], serviceRoleDetails: { childcare: { payLevel: 3, compensationTerms: 'Synthetic QA terms' } } } } });
    await wrapper.get('input[aria-label="1-child hourly-rate override"]').setValue('29');
    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toMatchObject({ compensationLevel: 5, serviceRoles: ['tutoring', 'childcare'], serviceRoleDetails: { childcare: { payLevel: 3, ratesByBand: { 1: '29' }, compensationTerms: 'Synthetic QA terms' } } });
  });
  it('uses the resolved NLU schedule automatically and labels additional childcare text optional', async () => {
    const wrapper=mount(Roles,{props:{compensationCategory:2,serviceCompensation:{childcare:policy},modelValue:{serviceRoles:['bachelors_counseling','tutoring','childcare'],serviceRoleDetails:{childcare:{payLevel:3}}}}});
    expect(wrapper.text()).toContain('included in the contract automatically');
    expect(wrapper.text()).toContain('Additional childcare compensation terms — optional');
    expect(wrapper.text()).not.toContain('Individual compensation schedule — required before generation');
    expect(wrapper.get('[data-testid=childcare-resolved-4]').text()).toBe('$32.00');
    await wrapper.setProps({modelValue:{serviceRoles:['childcare'],serviceRoleDetails:{childcare:{}}}});
    expect(wrapper.text()).toContain('Individual compensation schedule — required before generation');
    wrapper.unmount();
  });
  it('keeps written compensation mandatory when an individual agreement supplies the pay terms',()=>{
    const wrapper=mount(Roles,{props:{requireCompensationForAllRoles:true,compensationCategory:2,serviceCompensation:{childcare:policy},modelValue:{serviceRoles:['childcare'],serviceRoleDetails:{childcare:{payLevel:3}}}}});
    expect(wrapper.text()).toContain('Individual compensation schedule — required before generation');
    expect(wrapper.text()).not.toContain('included in the contract automatically');
    wrapper.unmount();
  });
});
