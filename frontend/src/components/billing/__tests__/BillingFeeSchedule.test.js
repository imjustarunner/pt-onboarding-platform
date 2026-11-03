import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BillingFeeSchedule from '../BillingFeeSchedule.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const endpoint = '/medical-billing/fee-schedule/canonical';
const service = (code = '90837', extra = {}) => ({ serviceCode: code, description: code === '90837' ? 'Psychotherapy' : 'Screening', isActive: true, isHidden: false, unitCalcMode: 'SINGLE', rateCents: 10000, rateUnit: 'unit', customRateCents: null, inheritedRateCents: 10000, inheritedSource: 'platform', source: 'platform', sourceLabel: 'Platform default', ...extra });
const payload = (extra = {}) => ({ agencyId: 2, mode: 'insurance', scope: 'practice', revision: 7, readOnly: false, canManagePlatform: false, payers: [{ id: 'payer-a', name: 'Payer A' }, { id: 'payer-b', name: 'Payer B' }], providers: [{ id: 51, name: 'Licensed Avery', categoryKey: 'category_3', eligiblePayerIds: ['payer-a'] }, { id: 52, name: 'Licensed Morgan', categoryKey: 'category_3', eligiblePayerIds: ['payer-b'] }, { id: 53, name: 'Associate Quinn', categoryKey: 'category_2', eligiblePayerIds: [] }], categories: [{ key: 'category_2', label: 'Associate' }, { key: 'category_3', label: 'Fully licensed' }], rows: [service(), service('H0002', { rateCents: 3000, inheritedRateCents: 3000 })], warnings: [], ...extra });
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text);
const selectFor = (wrapper, text) => wrapper.findAll('label').find(item => item.text().startsWith(text)).find('select');
const row = (wrapper, code = '90837') => wrapper.find(`[data-service-code="${code}"]`);
const amount = (wrapper, code = '90837') => row(wrapper, code).find('input');
async function open(extra = {}) { const wrapper = mount(BillingFeeSchedule, { props: { agencyId: 2, agencyName: 'Demo Practice', serviceCodesPath: '/demo/admin/settings?section=service-codes', ...extra } }); await flushPromises(); return wrapper; }
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: payload() }); api.post.mockResolvedValue({ data: payload({ revision: 8 }) }); });

describe('canonical billing fee schedules', () => {
  it('shows inherited starter charges and the canonical service-code settings link', async () => {
    const w = await open();
    expect(api.get).toHaveBeenCalledWith(endpoint, { params: { agencyId: 2, mode: 'insurance', scope: 'practice', includeHidden: 1 } });
    expect(row(w).text()).toContain('$100.00'); expect(row(w).text()).toContain('Platform default');
    expect(amount(w).element.value).toBe('100.00');
    expect(w.find('a').attributes('href')).toBe('/demo/admin/settings?section=service-codes');
    expect(w.text()).toContain('Existing claims keep their recorded charges');
    expect(w.findAll('option').some(option => option.text() === 'Platform defaults')).toBe(false);
    w.unmount();
  });

  it('waits for a selected payer and exposes only its eligible billing providers', async () => {
    const w = await open(); api.get.mockClear();
    await selectFor(w, 'Rates to manage').setValue('provider'); await flushPromises();
    expect(api.get).not.toHaveBeenCalled();
    expect(selectFor(w, 'Credentialed billing provider').element.disabled).toBe(true);
    await selectFor(w, 'Payer').setValue('payer-a'); await flushPromises();
    expect(api.get).not.toHaveBeenCalled();
    const providers = selectFor(w, 'Credentialed billing provider');
    expect(providers.text()).toContain('Licensed Avery'); expect(providers.text()).not.toContain('Licensed Morgan'); expect(providers.text()).not.toContain('Associate Quinn');
    await providers.setValue('51'); await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith(endpoint, { params: { agencyId: 2, mode: 'insurance', scope: 'provider', payerId: 'payer-a', providerUserId: 51, includeHidden: 1 } });
    w.unmount();
  });

  it.each([
    [{ initialScope: 'payer' }, 'Payer', 'Payer A'],
    [{ initialScope: 'provider', initialPayerId: 'payer-a' }, 'Credentialed billing provider', 'Licensed Avery'],
    [{ initialMode: 'self_pay', initialScope: 'category' }, 'Provider category', 'Fully licensed']
  ])('restores selector choices after refreshing an incomplete fee URL %j', async (props, label, choice) => {
    const w = await open(props);
    expect(api.get).toHaveBeenCalledWith(endpoint, { params: { agencyId: 2, mode: props.initialMode || 'insurance', scope: 'practice', includeHidden: 1 } });
    expect(selectFor(w, label).text()).toContain(choice);
    expect(w.findAll('[data-service-code]')).toHaveLength(0);
    expect(w.find('.rate-table').exists()).toBe(false);
    expect(selectFor(w, label).element.disabled).toBe(false);
    w.unmount();
  });

  it('saves explicit zero charges in exact cents and retains another unsaved row', async () => {
    const w = await open();
    await amount(w).setValue('0.00'); await amount(w, 'H0002').setValue('31.27');
    await w.find('.reason-label input').setValue('Approved practice rate');
    api.post.mockResolvedValue({ data: payload({ revision: 8, rows: [service('90837', { rateCents: 0, customRateCents: 0, source: 'practice', sourceLabel: 'Practice default' }), service('H0002', { rateCents: 3000, inheritedRateCents: 3000 })] }) });
    await button(row(w), 'Save practice rate').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith(endpoint, { agencyId: 2, mode: 'insurance', scope: 'practice', revision: 7, action: 'set', serviceCode: '90837', rateCents: 0, rateUnit: 'unit', reason: 'Approved practice rate' });
    expect(row(w).text()).toContain('$0.00'); expect(amount(w, 'H0002').element.value).toBe('31.27');
    expect(selectFor(w, 'Rates to manage').element.disabled).toBe(true);
    await button(row(w, 'H0002'), 'Save practice rate').trigger('click'); await flushPromises();
    expect(api.post.mock.calls[1][1]).toMatchObject({ revision: 8, serviceCode: 'H0002', rateCents: 3127 });
    expect(w.emitted('updated')).toHaveLength(2); w.unmount();
  });

  it.each(['', '-1', '12.345', '1e2', 'Infinity', '1000000.01'])('does not turn invalid money %j into a saved rate', async value => {
    const w = await open(); await amount(w).setValue(value);
    await button(row(w), 'Save practice rate').trigger('click'); await flushPromises();
    expect(api.post).not.toHaveBeenCalled(); expect(w.find('[role="alert"]').exists()).toBe(true); w.unmount();
  });

  it('lets an edited payer amount explicitly update the practice default', async () => {
    const w = await open();
    await selectFor(w, 'Rates to manage').setValue('payer'); await selectFor(w, 'Payer').setValue('payer-a'); await flushPromises();
    await amount(w).setValue('123.45');
    await button(row(w), 'Update practice default').trigger('click'); await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({ scope: 'payer', payerId: 'payer-a', action: 'update_practice_default', rateCents: 12345, revision: 7 });
    expect(w.text()).toContain('Saved payer and provider overrides still apply'); w.unmount();
  });

  it('resets an explicit zero override without sending another amount', async () => {
    api.get.mockResolvedValue({ data: payload({ rows: [service('90837', { rateCents: 0, customRateCents: 0, source: 'practice' })] }) });
    const w = await open();
    await button(row(w), 'Use platform default').trigger('click'); await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({ action: 'reset', serviceCode: '90837', revision: 7 });
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('rateCents'); w.unmount();
  });

  it('fills missing defaults through the scoped defaults action and retains custom amounts', async () => {
    api.post.mockResolvedValue({ data: payload({ revision: 8, rows: [service('90837', { rateCents: 15500, customRateCents: 15500, source: 'practice', sourceLabel: 'Practice default' })] }) });
    const w = await open(); await button(w, 'Fill missing practice rates').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith(`${endpoint}/defaults`, { agencyId: 2, mode: 'insurance', revision: 7, reason: '' });
    expect(amount(w).element.value).toBe('155.00'); expect(w.text()).toContain('Existing custom rates were retained'); w.unmount();
  });

  it('hides only the fee row, and offers hidden rows without disabling service definitions', async () => {
    const hidden = service('H0002', { isHidden: true, rateCents: 3000 });
    api.get.mockResolvedValue({ data: payload({ rows: [service(), hidden] }) });
    const w = await open(); expect(row(w, 'H0002').exists()).toBe(false);
    await w.find('.checkbox-label input').setValue(true); expect(row(w, 'H0002').text()).toContain('Hidden');
    await button(row(w), 'Hide from fee schedules').trigger('click'); await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({ action: 'set_visibility', isHidden: true, serviceCode: '90837' });
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('isActive'); w.unmount();
  });

  it('preserves edits after a version conflict until the user reloads current rates', async () => {
    const w = await open(); await amount(w).setValue('117.50');
    api.post.mockRejectedValue({ response: { status: 409, data: { error: { message: 'Another biller saved these rates.' } } } });
    await button(row(w), 'Save practice rate').trigger('click'); await flushPromises();
    expect(amount(w).element.value).toBe('117.50'); expect(w.text()).toContain('Another biller saved these rates');
    expect(button(row(w), 'Save practice rate').element.disabled).toBe(true);
    api.get.mockResolvedValue({ data: payload({ revision: 12, rows: [service('90837', { rateCents: 11900 })] }) });
    await button(w, 'Reload current rates').trigger('click'); await flushPromises();
    expect(amount(w).element.value).toBe('119.00'); expect(button(row(w), 'Save practice rate').element.disabled).toBe(false); w.unmount();
  });

  it('keeps read-only users out of every mutation control', async () => {
    api.get.mockResolvedValue({ data: payload({ readOnly: true }) });
    const w = await open();
    expect(amount(w).element.disabled).toBe(true); expect(button(w, 'Fill missing practice rates')).toBeUndefined();
    expect(button(row(w), 'Save practice rate')).toBeUndefined(); expect(w.text()).toContain('View only'); expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });

  it('does not render a late response from a previous agency', async () => {
    let resolveOld;
    api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const w = mount(BillingFeeSchedule, { props: { agencyId: 2 } }); await flushPromises();
    api.get.mockResolvedValue({ data: payload({ agencyId: 6, rows: [service('NEW06', { description: 'New practice only' })] }) });
    await w.setProps({ agencyId: 6 }); await flushPromises();
    resolveOld({ data: payload({ rows: [service('OLD02', { description: 'Old practice only' })] }) }); await flushPromises();
    expect(w.text()).toContain('New practice only'); expect(w.text()).not.toContain('Old practice only'); w.unmount();
  });

  it('ignores a save response after external agency navigation', async () => {
    const w = await open(); let resolveSave;
    api.post.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    await amount(w).setValue('150.00'); await button(row(w), 'Save practice rate').trigger('click');
    api.get.mockResolvedValue({ data: payload({ agencyId: 6, rows: [service('NEW06')] }) });
    await w.setProps({ agencyId: 6 }); await flushPromises();
    resolveSave({ data: payload({ rows: [service('OLD02')] }) }); await flushPromises();
    expect(row(w, 'NEW06').exists()).toBe(true); expect(row(w, 'OLD02').exists()).toBe(false); expect(w.emitted('updated')).toBeUndefined(); w.unmount();
  });

  it('uses separate self-pay category rates and preserves hourly billing basis', async () => {
    api.get.mockResolvedValue({ data: payload({ mode: 'self_pay', rows: [service('90837', { rateCents: 15000, rateUnit: 'hour', source: 'category', sourceLabel: 'Fully licensed category', inheritedSource: 'practice' })] }) });
    const w = await open({ initialMode: 'self_pay' });
    expect(api.get.mock.calls[0][1].params.mode).toBe('self_pay'); expect(row(w).text()).toContain('Per hour');
    await selectFor(w, 'Rates to manage').setValue('category'); await selectFor(w, 'Provider category').setValue('category_3'); await flushPromises();
    await amount(w).setValue('165.25');
    await row(w).find('select').setValue('session');
    await button(row(w), 'Save category rate').trigger('click'); await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({ mode: 'self_pay', scope: 'category', categoryKey: 'category_3', rateCents: 16525, rateUnit: 'session' });
    w.unmount();
  });

  it('allows all eligible self-pay providers without requiring payer credentialing', async () => {
    const w = await open({ initialMode: 'self_pay' });
    await selectFor(w, 'Rates to manage').setValue('provider'); await flushPromises();
    expect(selectFor(w, 'Provider').text()).toContain('Associate Quinn');
    await selectFor(w, 'Provider').setValue('53'); await flushPromises();
    expect(api.get.mock.calls.at(-1)[1].params).toMatchObject({ mode: 'self_pay', scope: 'provider', providerUserId: 53 });
    expect(api.get.mock.calls.at(-1)[1].params).not.toHaveProperty('payerId'); w.unmount();
  });

  it('opens a provider-profile link directly in the canonical self-pay schedule', async () => {
    const w = await open({ initialMode: 'self_pay', initialScope: 'provider', initialProviderId: 53 });
    expect(api.get.mock.calls[0][1].params).toEqual({ agencyId: 2, mode: 'self_pay', scope: 'provider', providerUserId: 53, includeHidden: 1 });
    expect(selectFor(w, 'Rates to manage').element.value).toBe('provider');
    expect(selectFor(w, 'Provider').element.value).toBe('53');
    expect(w.emitted('context-change')[0][0]).toMatchObject({ mode: 'self_pay', scope: 'provider', providerUserId: 53 });
    w.unmount();
  });

  it('honors a changed provider link during loading and discards the earlier response', async () => {
    let resolveOld;
    api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const w = mount(BillingFeeSchedule, { props: { agencyId: 2, initialMode: 'self_pay', initialScope: 'provider', initialProviderId: 51 } });
    await w.setProps({ initialProviderId: 53 }); await flushPromises();
    resolveOld({ data: payload({ rows: [service('OLD51')] }) }); await flushPromises();
    expect(api.get.mock.calls.at(-1)[1].params.providerUserId).toBe(53);
    expect(row(w, 'OLD51').exists()).toBe(false); w.unmount();
  });

  it('exposes a clearly identified global platform scope only when permitted', async () => {
    api.get.mockResolvedValue({ data: payload({ canManagePlatform: true, revision: 19 }) });
    const w = await open();
    await selectFor(w, 'Rates to manage').setValue('platform'); await flushPromises();
    expect(w.text()).toContain('editing platform defaults for all practices');
    expect(w.findAll('label').some(label => label.text().startsWith('Payer'))).toBe(false);
    await amount(w).setValue('101.01'); await button(row(w), 'Save platform rate').trigger('click'); await flushPromises();
    expect(api.post.mock.calls[0][1]).toMatchObject({ scope: 'platform', revision: 19, rateCents: 10101 });
    expect(button(row(w), 'Update practice default')).toBeUndefined(); w.unmount();
  });

  it('reviews exact payer links and conflicts before applying the bound sync plan', async () => {
    api.get.mockResolvedValue({ data: payload({ credentialingPath: '/demo/admin/credentialing' }) });
    const w = await open();
    const plan = { agencyId: 2, planToken: 'reviewed-plan-token', applied: false, operations: [{ action: 'link_existing', payerId: 'payer-a', name: 'Payer A', definitionId: 4 }, { action: 'create_definition', payerId: 'payer-b', name: 'Payer B' }], conflicts: [{ payerId: 'payer-c', definitionIds: [8, 9], reason: 'Multiple matches require review.' }] };
    api.post.mockResolvedValueOnce({ data: plan }).mockResolvedValueOnce({ data: { ...plan, applied: true, results: plan.operations } });
    await button(w, 'Sync verified payer catalog').trigger('click'); await flushPromises();
    expect(api.post.mock.calls[0]).toEqual(['/medical-billing/fee-schedule/sync-payers', { agencyId: 2, apply: false }]);
    expect(w.find('[aria-label="Review payer catalog sync"]').text()).toContain('1 existing definition to link · 1 new definition · 1 needing manual review');
    expect(w.text()).toContain('Multiple matches require review.'); expect(w.text()).toContain('Definitions 8, 9.');
    expect(api.post).toHaveBeenCalledTimes(1);
    await button(w, 'Apply 2 verified links').trigger('click'); await flushPromises();
    expect(api.post.mock.calls[1]).toEqual(['/medical-billing/fee-schedule/sync-payers', { agencyId: 2, apply: true, planToken: 'reviewed-plan-token' }]);
    expect(w.text()).toContain('2 payer links saved. 1 still need manual review');
    expect(w.find('[aria-label="Review payer catalog sync"]').exists()).toBe(false); w.unmount();
  });

  it('requires a new sync preview after its plan changes', async () => {
    const w = await open();
    api.post.mockResolvedValueOnce({ data: { planToken: 'old-plan', operations: [{ action: 'link_existing', payerId: 'payer-a', name: 'Payer A' }], conflicts: [] } })
      .mockRejectedValueOnce({ response: { status: 409, data: { error: { message: 'The payer catalog changed. Review it again.' } } } });
    await button(w, 'Sync verified payer catalog').trigger('click'); await flushPromises();
    await button(w, 'Apply 1 verified link').trigger('click'); await flushPromises();
    expect(w.text()).toContain('The payer catalog changed');
    expect(w.find('[aria-label="Review payer catalog sync"]').exists()).toBe(false);
    expect(button(w, 'Apply 1 verified link')).toBeUndefined(); w.unmount();
  });

  it('does not apply a payer plan without a binding token or carry it into another practice', async () => {
    const w = await open();
    api.post.mockResolvedValueOnce({ data: { operations: [{ action: 'link_existing', payerId: 'payer-a', name: 'Payer A' }], conflicts: [] } });
    await button(w, 'Sync verified payer catalog').trigger('click'); await flushPromises();
    expect(button(w, 'Apply 1 verified link').element.disabled).toBe(true);
    await w.setProps({ agencyId: 6 }); await flushPromises();
    expect(w.find('[aria-label="Review payer catalog sync"]').exists()).toBe(false);
    expect(api.post).toHaveBeenCalledTimes(1); w.unmount();
  });
});
