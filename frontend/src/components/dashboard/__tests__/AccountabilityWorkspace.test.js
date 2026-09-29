import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: m }));
import AccountabilityWorkspace from '../AccountabilityWorkspace.vue';
const settings = { recipient: 'melissa@plottwistco.com', officeAddress: 'Approved office', policy: 'Approved plan', attestation: 'I certify these expenses.', mileageRate: 0.7, categories: [{ key: 'phone', label: 'Phone', percent: 50 }] };
let wrapper, enabled, manager, report;
beforeEach(() => {
  vi.clearAllMocks(); enabled = true; manager = false;
  report = { id: 1, month: '2026-09', version: 1, status: 'draft', settings, receipts: [], data: { expenses: [], mileage: [] }, deliveryStatus: 'not_sent' };
  m.get.mockImplementation(async path => ({ data: path.endsWith('/access') ? { enabled, manager, settings } : path.endsWith('/settings') ? { users: [{ id: 3, first_name: 'Rachel', last_name: 'Finch', email: 'rachel@example.com' }], grants: [] } : [] }));
  m.post.mockImplementation(async path => ({ data: path.endsWith('/reports') ? structuredClone(report) : {} }));
  m.put.mockImplementation(async (_path, body) => ({ data: { ...structuredClone(report), version: 2, data: body.data } }));
});
afterEach(() => wrapper?.unmount());
async function open() {
  wrapper = mount(AccountabilityWorkspace, { props: { agencyId: 1 }, global: { stubs: { SignaturePad: true } } });
  await flushPromises(); await wrapper.find('.workspace-toggle').trigger('click'); await flushPromises();
}
async function openMonth() { await wrapper.find('input[type="month"]').setValue('2026-09'); await wrapper.findAll('button').find(b => b.text() === 'Open month').trigger('click'); await flushPromises(); }
describe('monthly accountability workspace', () => {
  it('is hidden from accounts without a grant or management permission', async () => {
    enabled = false; wrapper = mount(AccountabilityWorkspace, { props: { agencyId: 1 } }); await flushPromises(); expect(wrapper.find('section').exists()).toBe(false);
  });
  it('requires a verified account and explicit parameters before granting access', async () => {
    enabled = false; manager = true; await open(); expect(wrapper.text()).toContain('Permissions & parameters');
    await wrapper.find('.settings select').setValue('3'); expect(wrapper.find('input[type="email"]').element.value).toBe('melissa@plottwistco.com'); expect(wrapper.find('input[type="checkbox"]').element.checked).toBe(false); expect(m.put).not.toHaveBeenCalled();
  });
  it('previews a tracker import and saves the trips in the selected monthly draft', async () => {
    await open(); await openMonth(); await wrapper.find('.view-picker select').setValue('mileage');
    await wrapper.find('.import-box textarea').setValue('Date,From,To,Purpose,Miles\n2026-09-02,Office,School,Meeting,12.5');
    await wrapper.findAll('button').find(b => b.text() === 'Preview import').trigger('click'); expect(wrapper.findAll('.import-preview tbody tr')).toHaveLength(1); expect(m.put).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(b => b.text() === 'Add previewed trips').trigger('click');
    expect(wrapper.text()).toContain('Unsaved changes');
    await wrapper.findAll('button').find(b => b.text() === 'Save monthly draft').trigger('click'); await flushPromises();
    expect(m.put).toHaveBeenCalledWith('/accountability/1/reports/1', expect.objectContaining({ version: 1, data: { expenses: [], mileage: [expect.objectContaining({ date: '2026-09-02', miles: 12.5, purpose: 'Meeting' })] } }));
    expect(wrapper.text()).toContain('Draft saved');
  });
  it('displays a failed delivery separately from a locked signed report', async () => {
    report.status = 'signed'; report.deliveryStatus = 'failed'; report.deliveryDetail = 'Email was not sent.';
    await open(); await openMonth(); await wrapper.find('.view-picker select').setValue('submit');
    expect(wrapper.text()).toContain('Signed — locked'); expect(wrapper.text()).toContain('Email was not sent.'); expect(wrapper.text()).toContain('Retry email'); expect(wrapper.text()).not.toContain('Sign & email PDF'); expect(wrapper.text()).not.toContain('Save monthly draft');
  });
  it('preserves edits on a failed save and allows discarding them to reload the server draft', async () => {
    await open(); await openMonth();
    await wrapper.findAll('button').find(b => b.text() === 'Add expense').trigger('click');
    m.put.mockRejectedValueOnce({ response: { data: { error: { message: 'This report changed in another window.' } } } });
    await wrapper.findAll('button').find(b => b.text() === 'Save monthly draft').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('This report changed in another window.'); expect(wrapper.text()).toContain('Unsaved changes');
    await wrapper.findAll('button').find(b => b.text() === 'Discard changes & reload').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Draft saved'); expect(wrapper.findAll('.expense')).toHaveLength(0);
  });
  it('clears the previous company report when changing organizations', async () => {
    await open(); await openMonth(); await wrapper.setProps({ agencyId: 9 }); await flushPromises();
    expect(m.get).toHaveBeenCalledWith('/accountability/9/access'); expect(wrapper.find('.report-bar').exists()).toBe(false);
  });
  it('prints an unfinished worksheet, keeps its cells editable, then saves further adjustments', async () => {
    const preview = { document: {}, location: {}, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(preview);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:working-copy'), revokeObjectURL: vi.fn() }));
    await open(); await openMonth();
    await wrapper.findAll('button').find(b => b.text() === 'Add expense').trigger('click');
    await wrapper.findAll('button').find(b => b.text() === 'Print / preview PDF').trigger('click'); await flushPromises();
    expect(preview.location.href).toBe('blob:working-copy');
    expect(wrapper.text()).toContain('Your draft remains editable and has not been submitted.');
    expect(m.post.mock.calls.some(([path]) => /\/(sign|send)$/.test(path))).toBe(false);
    expect(wrapper.find('input[aria-label="Vendor"]').element.disabled).toBe(false);
    await wrapper.find('input[aria-label="Vendor"]').setValue('Updated vendor');
    await wrapper.findAll('button').find(b => b.text() === 'Save monthly draft').trigger('click'); await flushPromises();
    expect(m.put.mock.calls.at(-1)[1].data.expenses[0].vendor).toBe('Updated vendor');
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
});
