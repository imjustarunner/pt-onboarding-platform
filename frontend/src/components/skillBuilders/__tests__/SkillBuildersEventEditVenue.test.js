import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import EventEditModal from '../SkillBuildersEventEditModal.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { role: 'admin' } }) }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => ({}) }));
let wrapper;
afterEach(() => { wrapper?.unmount(); vi.clearAllMocks(); });
const address = '123 Main St, Denver, CO 80202';
async function open(overrides = {}) {
  const event = { id: 15, title: 'Testing', eventType: 'school_outreach',
    startsAt: '2026-10-26T23:00:00Z', endsAt: '2026-10-27T01:00:00Z', timezone: 'America/Denver', ...overrides };
  api.get.mockImplementation(async url => ({ data: url.endsWith('/company-event-edit') ? { event } : {} }));
  api.put.mockResolvedValue({ data: { ok: true } });
  wrapper = mount(EventEditModal, { props: { modelValue: true, agencyId: 2, eventId: 15 },
    global: { stubs: { Teleport: true, SkillBuildersEventProgramMeetingsCard: true, StaffEventInviteePanel: true } } });
  await flushPromises();
}
async function save() {
  await wrapper.findAll('button').find(b => b.text() === 'Save changes').trigger('click');
  await flushPromises();
}
describe('venue in the general event editor', () => {
  it('edits an address from the main details tab without publishing the event', async () => {
    await open();
    await wrapper.get('#sb-ce-venue-address').setValue(address);
    await save();
    expect(api.put).toHaveBeenCalledWith('/skill-builders/events/15/company-event-edit', expect.objectContaining({
      agencyId: 2, eventLocationAddress: address, inPersonPublic: false
    }), expect.any(Object));
  });
  it('uses one saved address for both travel and public venue directions', async () => {
    await open({ inPersonPublic: true, publicLocationAddress: 'Old address' });
    expect(wrapper.get('#sb-ce-venue-address').element.value).toBe('Old address');
    await wrapper.get('#sb-ce-venue-address').setValue(address);
    await save();
    expect(api.put.mock.calls[0][1]).toMatchObject({ eventLocationAddress: address, publicLocationAddress: address });
  });
});
