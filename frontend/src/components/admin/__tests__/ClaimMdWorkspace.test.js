import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClaimMdWorkspace from '../ClaimMdWorkspace.vue';
import { canAccessMedicalBilling } from '../../../config/medicalBillingAccess.js';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
const props = { agencyId: 1, connection: { configured: true, mode: 'test' } };
const claim = { claimId: 11, clinicalSessionId: 3, clinicalNoteId: 7, lifecycle: 'ready', reviewHash: 'a'.repeat(64),
  readiness: { ready: true, blockers: [], warnings: [] }, history: [], payload: { pat_name_f: 'Test', pat_name_l: 'Patient', payer_name: 'Test Payer', ins_number: 'SYNTHETIC', total_charge: '125.00', charge: [{ proc_code: '90834', units: '1', charge: '125.00' }] } };
const button = (wrapper, text) => wrapper.findAll('button').find(b => b.text().includes(text));
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(async url => ({ data: url.endsWith('/review') ? claim : url.endsWith('/history') ? { history: [] } : { items: [] } }));
  api.post.mockResolvedValue({ data: { message: 'Acknowledged' } });
});
describe('Claim.MD billing desk', () => {
  it('runs an actual AI review and clears prior approval when refreshed', async () => {
    api.get.mockImplementation(async url=>({data:url.endsWith('/review')?{...claim,aiReview:{status:'required',findings:[]}}:{items:[]}}));
    const w=mount(ClaimMdWorkspace,{props});await flushPromises();await w.vm.reviewClaim(11);await flushPromises();await w.find('input[type="checkbox"]').setValue(true);
    await button(w,'Run AI consistency review').trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/claimmd/claims/11/ai-review',{agencyId:1});expect(w.find('input[type="checkbox"]').element.checked).toBe(false);expect(button(w,'Approve and submit').attributes('disabled')).toBeDefined();w.unmount();
  });
  it('requires agency billing permission and always hides billing from provider roles', () => {
    expect(canAccessMedicalBilling({ role: 'provider', billingAgencyIds: [1] }, 1)).toBe(false);
    expect(canAccessMedicalBilling({ role: 'provider_plus', billingAgencyIds: [1] }, 1)).toBe(false);
    expect(canAccessMedicalBilling({ role: 'support', billingAgencyIds: [1] }, 1)).toBe(true);
    expect(canAccessMedicalBilling({ role: 'support', billingAgencyIds: [1] }, 2)).toBe(false);
    expect(canAccessMedicalBilling({ role: 'admin' }, 1)).toBe(true);
  });
  it('requires explicit approval and submits the reviewed hash and account mode', async () => {
    const w = mount(ClaimMdWorkspace, { props }); await flushPromises();
    await w.vm.reviewClaim(11); await flushPromises();
    expect(w.text()).toContain('Test Patient');
    expect(button(w, 'Approve and submit').attributes('disabled')).toBeDefined();
    await w.find('input[type="checkbox"]').setValue(true);
    await button(w, 'Approve and submit').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/claimmd/claims/11/submit', { agencyId: 1, approved: true, reviewHash: 'a'.repeat(64), accountMode: 'test' });
    expect(w.text()).toContain('Acknowledged'); expect(w.emitted('updated')).toHaveLength(1); w.unmount();
  });
  it('cannot submit when transmission is disabled', async () => {
    const w = mount(ClaimMdWorkspace, { props: { ...props, connection: { configured: true, mode: 'disabled' } } }); await flushPromises();
    await w.vm.reviewClaim(11); await flushPromises();
    await w.find('input[type="checkbox"]').setValue(true);
    expect(button(w, 'Approve and submit').attributes('disabled')).toBeDefined();
    expect(api.post).not.toHaveBeenCalled(); w.unmount();
  });
  it('does not issue an automatic retry after an uncertain submission', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Reconcile before retrying' } } } });
    const w = mount(ClaimMdWorkspace, { props }); await flushPromises(); await w.vm.reviewClaim(11); await flushPromises();
    await w.find('input[type="checkbox"]').setValue(true); await button(w, 'Approve and submit').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledTimes(1); expect(w.text()).toContain('Reconcile before retrying'); w.unmount();
  });
  it('discards a pending claim review after leaving the agency workspace', async () => {
    let resolve; const w = mount(ClaimMdWorkspace, { props }); await flushPromises();
    api.get.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = w.vm.reviewClaim(11); w.unmount(); resolve({ data: claim }); await pending; await flushPromises();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('requires a saved billing office and sends its ID instead of a typed NPI', async () => {
    api.get.mockImplementation(async url => ({ data: url.endsWith('/billing-offices') ? { items: [{ id: 8, name: 'Windchime', practice_name: 'Test Group', practice_npi: '1306688650' }] } : url.endsWith('/payers') ? { payers: [{ payerid: 'COCHA', payer_name: 'CCHA' }] } : { items: [] } }));
    const popup = { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    api.post.mockResolvedValue({ data: { url: 'https://www.claim.md/enroll/example/' } });
    const w = mount(ClaimMdWorkspace, { props }); await flushPromises();
    await w.find('form input').setValue('Colorado');
    await w.find('form').trigger('submit'); await flushPromises();
    expect(button(w, 'Open enrollment').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="billing-office"]').setValue('8');
    await button(w, 'Open enrollment').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/claimmd/enrollments', { agencyId: 1, payerId: 'COCHA', billingOfficeLocationId: 8, enrollmentType: '1500', acknowledgeEraRouting: false });
    expect(popup.location.replace).toHaveBeenCalledWith('https://www.claim.md/enroll/example/');
    expect(popup.opener).toBeNull(); w.unmount(); open.mockRestore();
  });
});
