import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import Desk from '../FamilyBillingDesk.vue';
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { agencyId: '1' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({}) }));
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(async () => ({ data: { balances: [
  { allocationId: 1, clientId: 100, sourceKey: 'unpaid-claim', balanceCents: 2500, status: 'open' },
  { allocationId: 2, clientId: 100, sourceKey: 'zero-claim', balanceCents: 0, status: 'paid', billingState: 'closed' },
  { allocationId: 3, clientId: 100, sourceKey: 'credit-claim', balanceCents: 0, status: 'paid', billingState: 'closed', refundReviewCents: 1000 }
] } })) } }));
describe('billing desk open balances', () => {
  it('defaults to unpaid work and keeps zero balances and refunds accessible separately', async () => {
    const w = mount(Desk); await flushPromises();
    expect(w.text()).toContain('unpaid-claim'); expect(w.text()).not.toContain('zero-claim'); expect(w.text()).not.toContain('credit-claim');
    await w.find('[aria-label="Balance view"]').setValue('closed');
    expect(w.text()).toContain('zero-claim'); expect(w.text()).toContain('Closed — no patient responsibility'); expect(w.text()).not.toContain('unpaid-claim');
    await w.find('[aria-label="Balance view"]').setValue('refunds');
    expect(w.text()).toContain('credit-claim'); expect(w.text()).not.toContain('zero-claim'); expect(w.text()).toContain('$10.00'); w.unmount();
  });
});
