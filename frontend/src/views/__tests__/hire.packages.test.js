import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), replace: vi.fn(), route: { params: { userId: '8', organizationSlug: 'itsco' }, query: { agencyId: '2' } } }));
vi.mock('../../services/api', () => ({ default: m }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 } }) }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ replace: m.replace }), onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }));
import Workspace from '../admin/HirePackagesView.vue';
import Editor from '../../components/admin/HireWorkflowEditor.vue';
let wrapper, data;
beforeEach(() => {
  vi.clearAllMocks(); m.route.query = { agencyId: '2' };
  data = { candidate: { id: 8, first_name: 'Jordan', last_name: 'Example', status: 'PREHIRE_OPEN' }, revision: 'r1', phases: {
    pre_hire: { packageId: null, closed: false, preparing: false, workflow: { resources: [] }, completedResourceIds: [], tasks: [{ id: 1, title: 'Agreement', status: 'completed' }] },
    onboarding: { packageId: null, closed: false, preparing: true, workflow: { resources: [] }, completedResourceIds: [], tasks: [] }
  } };
  m.get.mockImplementation(async url => ({ data: url.endsWith('hire-packages') ? structuredClone(data) : [] }));
  m.put.mockResolvedValue({ data: { revision: 'r2' } });
});
afterEach(() => wrapper?.unmount());
const open = async () => { wrapper = mount(Workspace, { global: { stubs: { RouterLink: { props: ['to'], template: '<a><slot /></a>' }, HirePackageContents: true, PromoteToOnboardingModal: true } } }); await flushPromises(); };
const button = text => wrapper.findAll('button').find(b => b.text().includes(text));
describe('person package switcher', () => {
  it('switches packages without losing the person, changing status, or discarding either draft', async () => {
    await open();
    wrapper.getComponent(Editor).vm.$emit('update:modelValue', { resources: [{ id: 'pre', title: 'Visit', phase: 'pre_hire', kind: 'link' }] });
    await button('Onboarding').trigger('click');
    expect(wrapper.text()).toContain('Jordan Example'); expect(wrapper.text()).toContain('Prepare and save onboarding now');
    wrapper.getComponent(Editor).vm.$emit('update:modelValue', { resources: [{ id: 'on', title: 'Orientation', phase: 'onboarding', kind: 'link' }] });
    await button('Pre-hire').trigger('click');
    expect(wrapper.getComponent(Editor).props('modelValue').resources[0].id).toBe('pre');
    await button('Onboarding').trigger('click');
    expect(wrapper.getComponent(Editor).props('modelValue').resources[0].id).toBe('on');
    expect(m.put).not.toHaveBeenCalled();
    expect(m.replace).toHaveBeenCalledWith({ query: { agencyId: '2', phase: 'onboarding' } });
  });
  it('saves only the selected person and phase and links to the matching defaults', async () => {
    m.route.query.phase = 'onboarding'; await open();
    wrapper.getComponent(Editor).vm.$emit('update:modelValue', { resources: [{ id: 'on', title: 'Orientation', phase: 'onboarding', kind: 'link' }] });
    await flushPromises(); await button('Save onboarding package').trigger('submit'); await flushPromises();
    expect(m.put).toHaveBeenCalledWith('/hiring/candidates/8/hire-packages/onboarding', expect.objectContaining({ revision: 'r1', workflow: { resources: [expect.objectContaining({ id: 'on' })] } }), { params: { agencyId: 2 } });
    expect(wrapper.text()).toContain('Onboarding package saved.');
    expect(wrapper.findAll('a').find(a => a.text().includes('Edit onboarding defaults')).attributes('href')).toContain('item=onboarding-setup');
  });
  it('keeps submitted packages read only and prevents premature promotion', async () => {
    data.phases.pre_hire.closed = true; await open();
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined(); expect(button('Save pre-hire package')).toBeUndefined();
    await button('Onboarding').trigger('click'); expect(button('Review & move').attributes('disabled')).toBeDefined();
  });
  it('keeps edits available after a stale-save conflict', async () => {
    m.put.mockRejectedValue({ response: { data: { error: { message: 'Package changed. Reload before saving.' } } } });
    await open(); wrapper.getComponent(Editor).vm.$emit('update:modelValue', { resources: [{ id: 'pre', title: 'Visit', phase: 'pre_hire' }] });
    await flushPromises(); await button('Save pre-hire package').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Package changed');
    expect(wrapper.getComponent(Editor).props('modelValue').resources[0].title).toBe('Visit');
  });
});

it('shows the inherited job onboarding package while preparing this person’s package', async () => {
  m.route.query.phase = 'onboarding'; data.phases.onboarding.suggestedPackageId = 42;
  m.get.mockImplementation(async url => ({ data: url.endsWith('hire-packages') ? structuredClone(data) : [{ id: 42, name: 'Provider onboarding', package_type: 'onboarding', is_active: 1, agency_id: 2 }] }));
  await open(); expect(wrapper.get('select').element.value).toBe('42');
  expect(m.put).not.toHaveBeenCalled();
});
