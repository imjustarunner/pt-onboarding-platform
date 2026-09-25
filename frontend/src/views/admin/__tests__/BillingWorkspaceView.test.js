import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BillingWorkspaceView from '../BillingWorkspaceView.vue';
import api from '../../../services/api';
import { billingTotals } from '../../../utils/billingWorkspace';
import { canAccessBillingWorkspace } from '../../../config/medicalBillingAccess';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 1, name: 'Management Agency' } }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 5, role: 'support', first_name: 'Test', last_name: 'Biller' } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('../../../components/admin/ClaimMdWorkspace.vue', () => ({ default: { template: '<div>Claim tools</div>', methods: { showHistory: vi.fn() } } }));
vi.mock('../../../components/admin/MedicalBillingReportsPanel.vue', () => ({ default: { template: '<div>Company reports</div>' } }));
vi.mock('../MedicalBillingView.vue', () => ({ default: { template: '<div>Company settings</div>' } }));
const data = () => ({ organizations: [{ id: 1, name: 'Company One', colors: { primary: '#23564f' }, counts: { ready: 4, submitted: 2 }, connection: { configured: true, mode: 'disabled' }, enrollments: [] }, { id: 3, name: 'Company Three', counts: { rejected: 2 }, connection: { configured: false }, enrollments: [] }], claims: [{ id: 8, agency_id: 1, client_id: 12, clinical_note_id: 10, claim_lifecycle: 'submitted', amount_cents: 10000 }], total: 1, capabilities: { claims: true, enrollments: true, paymentPosting: false }, updatedAt: '2026-09-24T12:00:00Z' });
const button = (w, text) => w.findAll('button').find(b => b.text() === text);
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); api.get.mockResolvedValue({ data: data() }); });
describe('billing workspace', () => {
  it('starts with all authorized companies and distinguishes accepted claims from payment', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    expect(api.get.mock.calls[0][1].params.agencyId).toBeUndefined();
    expect(w.text()).toContain('Cross-company work queue'); expect(w.text()).toContain('Company Three');
    expect(w.text()).toContain('Accepted does not mean paid'); expect(w.text()).not.toContain('Payments posted');
    expect(w.text()).toContain('Signed in as Test Biller'); w.unmount();
  });
  it('keeps company details in the cross-company context, then drills into a selected company', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    await w.find('[aria-label="View Company One billing details"]').trigger('click');
    expect(w.find('[aria-label="Company billing details"]').exists()).toBe(true);
    expect(w.find('[data-testid="organization-scope"]').element.value).toBe('all');
    await button(w, 'Work in Company One').trigger('click'); await flushPromises();
    expect(api.get.mock.calls.filter(([path])=>path==='/medical-billing/workspace').at(-1)[1].params.agencyId).toBe('1');
    expect(w.attributes('style')).toContain('--bw-brand: #23564f'); w.unmount();
  });
  it('discards stale scope responses instead of replacing the current agency data', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    let resolveOld; api.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    await w.find('[data-testid="organization-scope"]').setValue('1'); await flushPromises();
    api.get.mockResolvedValue({ data: { ...data(), claims: [{ id: 99, agency_id: 3, client_id: 90, claim_lifecycle: 'draft' }] } });
    await w.find('[data-testid="organization-scope"]').setValue('3'); await flushPromises();
    resolveOld({ data: data() }); await flushPromises();
    expect(w.text()).toContain('Claim #99'); expect(w.text()).not.toContain('Claim #8'); w.unmount();
  });
  it('uses the scoped ERA endpoint and never treats directory entries as posted payments', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    await w.find('[data-testid="organization-scope"]').setValue('1'); await flushPromises();
    await button(w, 'Payments').trigger('click');
    api.get.mockResolvedValue({ data: { eras: [{ eraid: 'test-era', payer_name: 'Test payer' }] } });
    await button(w, 'Check ERA directory').trigger('click'); await flushPromises();
    expect(api.get).toHaveBeenLastCalledWith('/medical-billing/claimmd/eras', { params: { agencyId: 1 } });
    expect(w.text()).toContain('test-era'); expect(w.text()).toContain('Payment posting is not enabled yet'); w.unmount();
  });
  it('clears financial results after an authorization failure', async () => {
    const w = mount(BillingWorkspaceView); await flushPromises();
    api.get.mockRejectedValue({ response: { data: { error: { message: 'Access denied' } } } });
    await button(w, 'Refresh').trigger('click'); await flushPromises();
    expect(w.text()).toContain('Access denied'); expect(w.text()).not.toContain('Claim #8'); w.unmount();
  });
  it('unknown claim data stays unknown and submitted is never counted as paid', () => {
    expect(billingTotals([{ counts: null }])).toBeNull();
    expect(billingTotals(data().organizations)).toMatchObject({ paid: 0, progress: 2 });
  });
  it('allows a delegated management biller to enter without billing permission on the login organization', () => {
    expect(canAccessBillingWorkspace({ role: 'support', billingAgencyIds: [377] })).toBe(true);
    expect(canAccessBillingWorkspace({ role: 'support', billingAgencyIds: [] })).toBe(false);
    expect(canAccessBillingWorkspace({ role: 'provider', billingAgencyIds: [377] })).toBe(false);
    expect(canAccessBillingWorkspace({ role: 'provider_plus', billingAgencyIds: [377] })).toBe(false);
  });
});
