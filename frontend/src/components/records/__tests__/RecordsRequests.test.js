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
    expect(w.find('.request-form > button').attributes('disabled')).toBeDefined();
    await w.get('[role=combobox]').trigger('click');
    await w.get('[role=option]').trigger('click');
    expect(w.find('.request-form > button').attributes('disabled')).toBeUndefined();
    expect(w.get('.destination').text()).toContain('Practice');
  });
  it('updates the destination branding and sends only to the chosen practice', async () => {
    api.mockImplementation(async path => path === '/practices' ? [{id:2,name:'ITSCO',logoUrl:'/assets/itsco/logo.png',brandColor:'#669878'},{id:6,name:'Next Level Up',logoUrl:'/assets/nlu/logo.png',brandColor:'#6fcfbe'}] : {message:'Received'});
    const w=mount(RecordsRequests,options);await flushPromises();
    await w.get('[role=combobox]').trigger('click');await w.findAll('[role=option]')[0].trigger('click');
    expect(w.get('.destination').text()).toContain('ITSCO');
    await w.get('[role=combobox]').trigger('click');await w.findAll('[role=option]')[1].trigger('click');
    expect(w.get('.destination').text()).toContain('Next Level Up');
    expect(w.get('.destination img').attributes('src')).toBe('/assets/nlu/logo.png');
    await w.get('form').trigger('submit');await flushPromises();
    expect(api.mock.calls.some(([path,options])=>path==='/public/6' && options.method==='POST')).toBe(true);
    expect(w.find('form').exists()).toBe(false);
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
