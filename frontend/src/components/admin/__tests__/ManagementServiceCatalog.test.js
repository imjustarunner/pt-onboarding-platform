import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Catalog from '../ManagementServiceCatalog.vue';
import api from '../../../services/api';
import { DEFAULT_MANAGEMENT_SERVICE_CATALOG, MANAGEMENT_SERVICE_CATEGORIES } from '../../../../../backend/src/services/managementServiceCatalog.js';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
const response = (canEdit = true) => ({ catalog: structuredClone(DEFAULT_MANAGEMENT_SERVICE_CATALOG), revision: 3, categories: MANAGEMENT_SERVICE_CATEGORIES, canEdit });
const button = (w, label) => w.findAll('button').find(b => b.text() === label);
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: response() }); api.put.mockImplementation(async (_url, input) => ({ data: { ...response(), catalog: input.catalog, revision: 4 } })); });
describe('management service catalog', () => {
  it('shows managed prices, filters categories and adds the exact selected price without changing saved contracts', async () => {
    const w = mount(Catalog, { props: { canSelect: true, serviceMonth: '2026-11' } }); await flushPromises();
    expect(w.text()).toContain('$300.00 / month'); expect(w.text()).toContain('$179.40 one-time');
    await w.find('select').setValue('management');
    expect(w.text()).not.toContain('Initial credentialing');
    await button(w, 'Add Full management package to this agreement').trigger('click');
    expect(w.emitted('select')[0][0]).toMatchObject({ name: 'Full management package', amountCents: 30000, cadence: 'monthly' });
    expect(api.put).not.toHaveBeenCalled(); w.unmount();
  });
  it('saves edited catalog with its revision and shows conflicts without losing edits', async () => {
    const w = mount(Catalog); await flushPromises();
    await button(w, 'Edit service prices').trigger('click');
    const price = w.findAll('input[type=number]')[1]; await price.setValue('100');
    api.put.mockRejectedValueOnce({ response: { data: { error: { message: 'Service prices changed. Reload before saving your edits.' } } } });
    await button(w, 'Save service prices').trigger('click'); await flushPromises();
    expect(w.text()).toContain('Service prices changed'); expect(price.element.value).toBe('100');
    expect(api.put).toHaveBeenCalledWith('/business-lifecycle/service-catalog', expect.objectContaining({ revision: 3, catalog: expect.objectContaining({ services: expect.arrayContaining([expect.objectContaining({ id: 'organization-platform', amountCents: 10000 })]) }) }));
    w.unmount();
  });
  it('keeps price editing unavailable to a client company owner', async () => {
    api.get.mockResolvedValue({ data: response(false) }); const w = mount(Catalog); await flushPromises();
    expect(button(w, 'Edit service prices')).toBeUndefined(); expect(button(w, 'Save service prices')).toBeUndefined(); w.unmount();
  });
});
