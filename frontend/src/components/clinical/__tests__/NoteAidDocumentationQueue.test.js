import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import NoteAidDocumentationQueue from '../NoteAidDocumentationQueue.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgencyId: 7, currentAgency: { id: 7, name: 'ITSCO' },
  userAgencies: [{ id: 7, name: 'ITSCO' }], agencies: [{ id: 7, name: 'ITSCO' }], fetchUserAgencies: vi.fn(async () => {}) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 501, role: 'admin' } }) }));
const rows = [
  { clinicalSessionId: 214, officeEventId: 40, agencyId: 7, clientId: 2104, clientName: 'Synthetic client', providerUserId: 501, providerName: 'Current clinician', serviceCode: 'H0004', dateOfService: '2026-11-15', noteStatus: 'none' },
  { clinicalSessionId: 215, appointmentId: 133, agencyId: 7, clientId: 2104, clientName: 'Synthetic client', providerUserId: 84, providerName: 'Assigned clinician', serviceCode: '90834', dateOfService: '2026-11-16', noteStatus: 'none' },
  { agencyId: 7, clientId: 2104, clientName: 'Client-only placeholder', providerUserId: 501, serviceCode: '90834', dateOfService: '2026-11-17', noteStatus: 'none' }
];
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { items: rows } }); });

describe('actual session documentation queue', () => {
  it('shows actual sessions only, hides unlinked entry actions, and preserves the selected row identity', async () => {
    const wrapper = mount(NoteAidDocumentationQueue, { props: { agencyId: 7, clientId: 2104, sessionOnly: true } });
    await flushPromises();
    expect(wrapper.findAll('.na-doc-queue-row')).toHaveLength(2);
    expect(wrapper.text()).not.toContain('Continue unlinked');
    expect(wrapper.text()).not.toContain('Pick client first');
    expect(api.get).toHaveBeenCalledWith('/clinical-data/documentation-queue', expect.objectContaining({ params: expect.objectContaining({ agencyId: 7, clientId: 2104 }) }));
    expect(api.get.mock.calls[0][1].params).not.toHaveProperty('providerUserId');
    await wrapper.find('.na-doc-queue-row').trigger('click');
    expect(wrapper.emitted('select')[0][0]).toMatchObject({ clinicalSessionId: 214, officeEventId: 40, serviceCode: 'H0004', dateOfService: '2026-11-15' });
    const other = wrapper.findAll('.na-doc-queue-row')[1];
    expect(other.attributes('disabled')).toBeDefined();
    expect(other.text()).toContain('Assigned to Assigned clinician');
    wrapper.unmount();
  });

  it('retains the current-provider filter for the general My Work session chooser', async () => {
    const wrapper = mount(NoteAidDocumentationQueue, { props: { agencyId: 7, sessionOnly: true } });
    await flushPromises();
    expect(api.get.mock.calls[0][1].params.providerUserId).toBe(501);
    wrapper.unmount();
  });
});
