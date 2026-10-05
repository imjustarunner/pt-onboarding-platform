import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RecordsRequests from '../RecordsRequests.vue';
import { api } from '../api.js';
vi.mock('../api.js', () => ({ api: vi.fn() }));
const options = { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } };
beforeEach(() => vi.resetAllMocks());
describe('records request interface', () => {
  it('loads practice choices and explains first-party identity review', async () => {
    api.mockResolvedValue([{ id: 10, slug: 'practice', name: 'Practice' }]);
    const w = mount(RecordsRequests, options); await flushPromises();
    expect(w.text()).toContain('contact information already on file');
    expect(w.find('button').attributes('disabled')).toBeDefined();
    await w.find('select').setValue('10');
    expect(w.find('button').attributes('disabled')).toBeUndefined();
  });
  it('does not show staff controls in the patient portal', async () => {
    api.mockResolvedValue([{ id: 'request', createdAt: '2026-10-05', data: { patientName: 'Patient', status: 'pending_review', scope: 'All records' } }]);
    const w = mount(RecordsRequests, { ...options, props: { base: '/practices/test' } }); await flushPromises();
    expect(w.text()).toContain('My requests');
    expect(w.text()).not.toContain('Next status');
  });
  it('requires separate identity review before approval controls become available', async () => {
    api.mockImplementation(async path => path.endsWith('/options') ? { managers: [] } : [{ id: 'request', createdAt: '2026-10-05', data: { patientName: 'Patient', status: 'pending_verification', scope: 'All records' } }]);
    const w = mount(RecordsRequests, { ...options, props: { base: '/practices/test', manage: true } }); await flushPromises();
    expect(w.findAll('option').map(x => x.attributes('value'))).not.toContain('approved');
    await w.findAll('select')[1].setValue('pending_review');
    expect(w.text()).toContain('independently retrieved from the chart');
    expect(w.find('input[type="checkbox"]').attributes('required')).toBeDefined();
  });
  it('shows request errors without claiming success', async () => {
    api.mockRejectedValue(new Error('Practice unavailable'));
    const w = mount(RecordsRequests, options); await flushPromises();
    expect(w.get('[role="alert"]').text()).toBe('Practice unavailable');
    expect(w.text()).not.toContain('was submitted');
  });
  it('routes assignment to an eligible manager without approving the request', async () => {
    const record = { id: 'request', createdAt: '2026-10-05', data: { patientName: 'Patient', status: 'pending_review', scope: 'All records', unassigned: true, overdue: true } };
    api.mockImplementation(async path => path.endsWith('/options') ? { managers: [{ id: 'melissa-account', name: 'Melissa Mendez' }] } : path.endsWith('/assignment') ? { saved: true } : [record]);
    const w = mount(RecordsRequests, { ...options, props: { base: '/practices/test', manage: true, requestId: 'request' } }); await flushPromises();
    expect(w.text()).toContain('Follow-up overdue');
    expect(w.find('.focused').exists()).toBe(true);
    await w.find('select').setValue('melissa-account');
    await w.find('form').trigger('submit'); await flushPromises();
    expect(api).toHaveBeenCalledWith('/practices/test/requests/request/assignment', { method: 'PUT', body: { accountId: 'melissa-account' } });
    expect(api.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });

});
