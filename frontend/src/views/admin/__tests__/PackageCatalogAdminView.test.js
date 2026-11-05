import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import View from '../PackageCatalogAdminView.vue';
import api from '../../../services/api';
import * as catalog from '../../../services/unifiedPackages';

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'sample-coach' }, query: {} }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 7001, slug: 'sample-coach' } }) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../../services/unifiedPackages', () => ({
  listPackages: vi.fn(), createPackage: vi.fn(), updatePackage: vi.fn(), duplicatePackage: vi.fn(),
  formatMoney: cents => `$${(Number(cents) / 100).toFixed(2)}`
}));

const packageRow = (minutes = 90) => ({
  id: 45, name: 'Sample Coaching Session', description: 'A focused session.', businessType: 'coaching',
  packageType: 'prepaid_bundle', sessionCount: 1, priceCents: 12000, consumeOn: 'reserve',
  isActive: true, isPublic: true, allowedTenantServiceIds: [7],
  billingOptions: { modes: ['pay_in_full'] },
  policies: { cancellationNoticeHours: 24, lateCancelPolicy: 'free_rebook', noShowPolicy: 'free_rebook', customTerm: 'Keep agreed terms' },
  domainConfig: { sessionMinutes: minutes, deliveryMode: '1:1', autoEnrollSubject: false,
    website: { key: 'sample-session', subtitle: 'One-session support', items: ['Action plan'], icon: 'leaf' },
    customSetting: 'Preserve this setting', pricing: { mode: 'fixed' } }
});
const label = (wrapper, prefix) => wrapper.findAll('label').find(item => item.text().startsWith(prefix));
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text);
const open = async () => { const wrapper = mount(View); await flushPromises(); return wrapper; };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async path => ({ data: path.endsWith('business-types')
    ? { businessTypes: [{ business_type: 'coaching' }] }
    : path.endsWith('tenant-services')
      ? { services: [{ id: 7, name: 'Coaching', businessType: 'coaching', isActive: true }] }
      : { classes: [] } }));
  catalog.listPackages.mockResolvedValue([packageRow()]);
  catalog.updatePackage.mockResolvedValue({});
  catalog.createPackage.mockResolvedValue({});
});

describe('coaching package catalog', () => {
  it.each([30, 90])('preserves a fixed-price %i-minute package and website terms when editing its name', async minutes => {
    catalog.listPackages.mockResolvedValue([packageRow(minutes)]);
    const wrapper = await open();
    expect(wrapper.text()).toContain(`1 session unit · ${minutes} minutes each`);
    expect(wrapper.text()).toContain('Late cancellation: keep the session unit');
    await button(wrapper, 'Edit').trigger('click');
    expect(label(wrapper, 'Minutes per session').find('input').element.value).toBe(String(minutes));
    await label(wrapper, 'Name').find('input').setValue('Updated package');
    await button(wrapper, 'Save package').trigger('click'); await flushPromises();
    expect(catalog.updatePackage).toHaveBeenCalledWith(7001, 45, expect.objectContaining({
      name: 'Updated package', sessionCount: 1,
      domainConfig: expect.objectContaining({ sessionMinutes: minutes, autoEnrollSubject: false,
        customSetting: 'Preserve this setting', website: expect.objectContaining({ key: 'sample-session', icon: 'leaf', items: ['Action plan'] }) }),
      policies: expect.objectContaining({ lateCancelPolicy: 'free_rebook', noShowPolicy: 'free_rebook', customTerm: 'Keep agreed terms' })
    }));
    wrapper.unmount();
  });

  it('creates coaching units with separate late-cancellation and no-show clauses', async () => {
    const wrapper = await open(); await button(wrapper, '+ New package').trigger('click');
    await label(wrapper, 'Name').find('input').setValue('Focused progress');
    await label(wrapper, 'Session units included').find('input').setValue(6);
    await label(wrapper, 'Minutes per session').find('input').setValue(45);
    await label(wrapper, 'List price').find('input').setValue(450);
    await label(wrapper, 'Cancel notice').find('input').setValue(48);
    await label(wrapper, 'Late cancellation').find('select').setValue('free_rebook');
    await label(wrapper, 'No-show').find('select').setValue('fee');
    await label(wrapper, 'Missed-appointment fee').find('input').setValue(25);
    await label(wrapper, 'Included free misses').find('input').setValue(1);
    await label(wrapper, 'Bonus sessions').find('input').setValue(2);
    await wrapper.find('.svc-check input').setValue(true);
    await button(wrapper, 'Save package').trigger('click'); await flushPromises();
    expect(catalog.createPackage).toHaveBeenCalledWith(7001, expect.objectContaining({
      businessType: 'coaching', sessionCount: 6, priceCents: 45000, allowedTenantServiceIds: [7],
      domainConfig: expect.objectContaining({ sessionMinutes: 45, autoEnrollSubject: false }),
      policies: expect.objectContaining({ cancellationNoticeHours: 48, lateCancelPolicy: 'free_rebook', noShowPolicy: 'fee', missedFeeCents: 2500, freeMisses: 1, bonusSessions: 2 })
    }));
    wrapper.unmount();
  });

  it('keeps the duration when changing provider pricing to a fixed package total', async () => {
    const pkg = packageRow(); pkg.domainConfig.pricing = { mode: 'provider-discount', minutes: 90, discountPercent: 10, format: 'virtual' };
    catalog.listPackages.mockResolvedValue([pkg]);
    const wrapper = await open(); await button(wrapper, 'Edit').trigger('click');
    await label(wrapper, 'Pricing').find('select').setValue('fixed');
    await label(wrapper, 'List price').find('input').setValue(150);
    await button(wrapper, 'Save package').trigger('click'); await flushPromises();
    expect(catalog.updatePackage).toHaveBeenCalledWith(7001, 45, expect.objectContaining({
      priceCents: 15000, domainConfig: expect.objectContaining({ sessionMinutes: 90, pricing: { mode: 'fixed' } })
    }));
    wrapper.unmount();
  });

  it('preserves the existing zero-discount provider price instead of making it a free package', async () => {
    const pkg = packageRow(60); pkg.priceCents = null; pkg.sessionCount = 3;
    pkg.domainConfig.pricing = { mode: 'provider-discount', minutes: 60, discountPercent: 0, format: 'virtual' };
    catalog.listPackages.mockResolvedValue([pkg]);
    const wrapper = await open(); await button(wrapper, 'Edit').trigger('click');
    await label(wrapper, 'Name').find('input').setValue('Three-session Coaching Bundle');
    await button(wrapper, 'Save package').trigger('click'); await flushPromises();
    expect(catalog.updatePackage).toHaveBeenCalledWith(7001, 45, expect.objectContaining({
      sessionCount: 3,
      domainConfig: expect.objectContaining({ pricing: { mode: 'provider-discount', discountPercent: 0, minutes: 60, format: 'virtual' } })
    }));
    wrapper.unmount();
  });

  it('rejects partial units without submitting the package', async () => {
    const wrapper = await open(); await button(wrapper, 'Edit').trigger('click');
    await label(wrapper, 'Session units included').find('input').setValue(1.5);
    await button(wrapper, 'Save package').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Enter 1–10000 whole session units.');
    expect(catalog.updatePackage).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
