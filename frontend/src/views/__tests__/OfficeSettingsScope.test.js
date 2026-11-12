import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';

const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), replace: vi.fn(), route: null, agency: null, user: null }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ replace: m.replace }) }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ user: m.user }) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => m.agency }));
vi.mock('../../services/api', () => ({ default: { get: m.get, post: m.post } }));
import OfficeSettings from '../OfficeSettingsView.vue';

const agencies = [
  { id: 450, slug: 'auricwell-qa-demo', name: 'Clinical QA', organization_type: 'agency' },
  { id: 453, slug: 'nlu-qa-demo', name: 'NLU QA', organization_type: 'agency' }
];
const render = () => mount(OfficeSettings, { global: { stubs: {
  KioskBuildingSelector: true, OfficeKioskAccessSettings: true,
  OfficeRoomPhotoButton: true, OfficeRoomPhotoGalleryModal: true
} } });
const addButton = w => w.findAll('button').find(button => button.text() === 'Add building');
beforeEach(() => {
  vi.clearAllMocks();
  m.route = reactive({ params: { organizationSlug: 'nlu-qa-demo' }, query: {} });
  m.agency = reactive({ currentAgency: agencies[0] });
  m.user = { id: 1435, role: 'admin' };
  m.get.mockImplementation(async url => ({ data: url === '/agencies' ? agencies : [] }));
  m.post.mockResolvedValue({ data: { id: 90, agency_id: 453 } });
  m.replace.mockResolvedValue();
});

it('creates a first building in the authorized route agency rather than the administrator’s first agency', async () => {
  const w = render(); await flushPromises();
  expect(w.text()).toContain('This building will belong to NLU QA.');
  await w.find('input[placeholder="Building name"]').setValue('Synthetic tutoring office');
  await addButton(w).trigger('click'); await flushPromises();
  expect(m.post).toHaveBeenCalledTimes(1);
  expect(m.post).toHaveBeenCalledWith('/offices', expect.objectContaining({ agencyId: 453, name: 'Synthetic tutoring office' }));
  expect(m.post.mock.calls.some(([, body]) => body.agencyId === 450)).toBe(false);
  expect(m.user.role).toBe('admin');
  w.unmount();
});

it('uses the newly selected authorized agency after a flat-route agency switch', async () => {
  m.route.params = {};
  const w = render(); await flushPromises();
  expect(w.text()).toContain('This building will belong to Clinical QA.');
  m.agency.currentAgency = agencies[1]; await flushPromises();
  await w.find('input[placeholder="Building name"]').setValue('Synthetic tutoring office');
  await addButton(w).trigger('click'); await flushPromises();
  expect(m.post).toHaveBeenCalledWith('/offices', expect.objectContaining({ agencyId: 453 }));
  w.unmount();
});

it('does not fall back to an unrelated authorized agency when the requested tenant is unavailable', async () => {
  m.route.params.organizationSlug = 'unrelated-agency';
  const w = render(); await flushPromises();
  await w.find('input[placeholder="Building name"]').setValue('Synthetic tutoring office');
  expect(addButton(w).attributes('disabled')).toBeDefined();
  await addButton(w).trigger('click');
  expect(m.post).not.toHaveBeenCalled();
  expect(w.text()).toContain('Select an authorized agency');
  w.unmount();
});

it('keeps a backend scope denial visible without retrying the write in the first agency', async () => {
  m.post.mockRejectedValue({ response: { status: 403, data: { error: { message: 'Access denied for this agency' } } } });
  const w = render(); await flushPromises();
  await w.find('input[placeholder="Building name"]').setValue('Synthetic tutoring office');
  await addButton(w).trigger('click'); await flushPromises();
  expect(m.post).toHaveBeenCalledTimes(1);
  expect(w.get('[role="alert"]').text()).toContain('Access denied for this agency');
  expect(m.replace).not.toHaveBeenCalled();
  w.unmount();
});

it('does not navigate a newly selected tenant to a building returned for the prior tenant', async () => {
  let resolveCreate;
  m.post.mockImplementation(() => new Promise(resolve => { resolveCreate = resolve; }));
  const w = render(); await flushPromises();
  await w.find('input[placeholder="Building name"]').setValue('Synthetic tutoring office');
  await addButton(w).trigger('click');
  m.route.params.organizationSlug = 'auricwell-qa-demo';
  resolveCreate({ data: { id: 90, agency_id: 453 } }); await flushPromises();
  expect(m.post).toHaveBeenCalledTimes(1);
  expect(m.replace).not.toHaveBeenCalled();
  w.unmount();
});
