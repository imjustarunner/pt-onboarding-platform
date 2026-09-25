import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import BillingCostPlanner from '../BillingCostPlanner.vue';
describe('billing cost planner', () => {
  it('starts with the confirmed Basic plan and compares both policies without activating billing', async () => {
    const w=mount(BillingCostPlanner);
    expect(w.find('select').element.value).toBe('basic');
    expect(w.find('tbody tr').text()).toContain('$30.00');
    expect(w.text()).toContain('does not enable background checks');
    await w.find('select').setValue('unlimited');
    const field=label=>w.findAll('label').find(l=>l.text().startsWith(label)).find('input');
    await field('Active insured clients').setValue(1000);
    await field('Clients with secondary coverage').setValue(100);
    const monthly=w.find('tbody tr').text();
    expect(monthly).toContain('1,100');expect(monthly).toContain('$122.00–$130.00');
    await field('Additional tax ID fees').setValue('30.50');
    expect(w.find('tbody tr').text()).toContain('$152.50–$160.50');
    expect(w.findAll('button')).toHaveLength(0);
    w.unmount();
  });
  it('hides estimates when secondary counts exceed the eligible population', async () => {
    const w=mount(BillingCostPlanner);await w.find('select').setValue('basic');
    const inputs=w.findAll('input');await inputs[0].setValue(10);await inputs[1].setValue(11);
    expect(w.find('[role="status"]').text()).toContain('clients with secondary coverage');
    expect(w.find('table').exists()).toBe(false);w.unmount();
  });
});
