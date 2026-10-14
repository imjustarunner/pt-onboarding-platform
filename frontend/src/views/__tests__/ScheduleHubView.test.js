import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScheduleHubView from '../ScheduleHubView.vue';

const state = vi.hoisted(() => ({}));
vi.mock('../../store/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => state.agency }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({}) }));
vi.mock('../../services/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: {} }) } }));
vi.mock('../../composables/useHubTopCards', () => ({ useHubTopCards: () => ({ sortCardsByVisits: cards => cards }) }));

beforeEach(() => {
  state.auth = reactive({ user: { role: 'super_admin', capabilities: {} } });
  state.agency = reactive({ currentAgency: { id: 17, name: 'Example Practice', slug: 'example', organization_type: 'agency' } });
});
async function openHub() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:organizationSlug/workforce-operations', component: ScheduleHubView }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
  await router.push('/example/workforce-operations');
  await router.isReady();
  const wrapper = mount(ScheduleHubView, { global: { plugins: [router], stubs: { HubTopCardsBar: true } } });
  await flushPromises();
  return wrapper;
}
const category = (w, name) => w.findAll('.hub-satellite--section').find(el => el.find('.hub-satellite-title').text() === name);
const shortcut = w => w.find('.billing-shortcut');

describe('AuricWell in Workforce Operations', () => {
  it('opens the existing workspace for the current practice and links directly to claims', async () => {
    const w = await openHub();
    expect(shortcut(w).attributes('href')).toBe('/example/admin/medical-billing?billingSection=workspace&billingScope=17');
    expect(category(w, 'Billing & Claims').text()).toContain('AuricWell');
    await category(w, 'Billing & Claims').trigger('click');
    const claims = w.findAll('.hub-satellite--card').find(el => el.find('.hub-satellite-title').text() === 'Claims');
    expect(claims.attributes('href')).toBe('/example/admin/medical-billing?billingSection=claims&billingScope=17');
    expect(claims.find('.auricwell-brand').exists()).toBe(true);
    w.unmount();
  });
  it('shows delegated billing without payroll permission, using only its authorized organization scope', async () => {
    state.auth.user = { role: 'staff', capabilities: {}, billingAgencyIds: [17] };
    const w = await openHub();
    expect(category(w, 'Payroll & Expenses')).toBeUndefined();
    expect(shortcut(w).attributes('href')).toContain('billingScope=17');
    state.agency.currentAgency = { id: 21, name: 'Other Practice' };
    await flushPromises();
    expect(shortcut(w).attributes('href')).toContain('billingScope=all');
    expect(shortcut(w).attributes('href')).not.toContain('billingScope=21');
    w.unmount();
  });
  it.each([{ role: 'staff', capabilities: { canManagePayroll: true }, payrollAgencyIds: [17] }, { role: 'provider_plus', billingAgencyIds: [17] }])('does not grant billing through payroll or provider access: $role', async user => {
    state.auth.user = user;
    const w = await openHub();
    expect(shortcut(w).exists()).toBe(false);
    expect(category(w, 'Billing & Claims')).toBeUndefined();
    expect(w.findAll('a').some(a => a.attributes('href')?.includes('medical-billing'))).toBe(false);
    w.unmount();
  });
  it('brands clinical client and compliance tools without labeling other services or payroll as AuricWell', async () => {
    const w = await openHub();
    expect(category(w, 'Clients & Guardians').text()).toContain('AuricWell');
    expect(category(w, 'Compliance & Oversight').text()).toContain('AuricWell');
    const mobileCard = title => w.findAll('.hub-mobile-card').find(el => el.find('.hub-mobile-title').text() === title);
    for (const title of ['Clients', 'Guardians', 'Credentialing', 'Psychotherapy Compliance']) expect(mobileCard(title).find('.auricwell-brand').exists()).toBe(true);
    for (const title of ['Master Tutoring', 'Payroll', 'Audit Center']) expect(mobileCard(title).find('.auricwell-brand').exists()).toBe(false);
    w.unmount();
  });
});
