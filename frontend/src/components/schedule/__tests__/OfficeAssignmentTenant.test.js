import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, post: m.post, patch: vi.fn() }, isApiRateLimited: () => false }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/dashboard', params: {}, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), resolve: () => ({ href: '/dashboard' }) }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'super_admin' }, isAuthenticated: true }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2, name: 'Test', slug: 'test', organization_type: 'agency', feature_flags: {} }, agencies: [], userAgencies: [] }) }));
import Grid from '../ScheduleAvailabilityGrid.vue';
let wrapper;
beforeEach(async () => {
  setActivePinia(createPinia()); localStorage.clear(); vi.clearAllMocks();
  m.get.mockImplementation(async url => ({ data: url.includes('agencies') ? [] : {} }));
  m.post.mockResolvedValue({ data: { ok: true } });
  wrapper = shallowMount(Grid, { props: { userId: 7, agencyId: 2 }, global: { stubs: { RouterLink: true } } });
  await flushPromises();
});
afterEach(() => wrapper?.unmount());
it('includes the current tenant in the person-first admin room assignment', async () => {
  const s = wrapper.vm.$.setupState;
  s.adminAssignOfficeLocationId = 1; s.adminAssignRoomId = 4;
  s.adminAssignMode = 'provider'; s.adminAssignPersonId = 538;
  s.officeAssignStartHour = 13; s.officeAssignEndHour = 17;
  s.modalContext = { dateYmd: '2026-11-16', hour: 13, roomId: 4 };
  await s.submitAdminAssign();
  expect(m.post).toHaveBeenCalledWith('/office-slots/1/open-slots/assign', expect.objectContaining({ agencyId: 2, assignedUserId: 538, hour: 13, endHour: 17 }));
});
it('includes the current tenant in the provider office assignment', async () => {
  const s = wrapper.vm.$.setupState;
  s.officeAssignBuildingId = 1; s.officeAssignRoomId = 4;
  s.officeAssignDay = 'Monday'; s.officeAssignStartHour = 13; s.officeAssignEndHour = 17;
  await s.submitOfficeAssign();
  expect(m.post).toHaveBeenCalledWith('/office-slots/1/open-slots/assign', expect.objectContaining({ agencyId: 2, assignedUserId: 7, hour: 13, endHour: 17 }));
});
