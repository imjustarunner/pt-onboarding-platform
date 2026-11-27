import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ContractView from '../admin/ContractGeneratorView.vue';
import Handbook from '../../components/handbook/WorkplaceHandbookWorkspace.vue';

const state = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(),
  company: { id: 463, name: 'Juniper Consulting QA', slug: 'juniper-qa', feature_flags: { plotlineOnly: true } }
}));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'juniper-qa' }, query: { agencyId: 464 } }) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: state.company, userAgencies: [state.company] }) }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ user: { role: 'admin' } }) }));
vi.mock('../../store/branding', () => ({ useBrandingStore: () => ({}) }));
vi.mock('../../composables/useDocumentBranding.js', () => ({ useDocumentBranding: () => ({}) }));
vi.mock('../../services/api', () => ({ default: { get: state.get, post: state.post, patch: state.patch } }));
vi.mock('../../components/handbook/WorkplaceHandbookBook.vue', () => ({ default: { template: '<div>Handbook preview</div>' } }));
vi.mock('../../components/handbook/HandbookSectionEditor.vue', () => ({ default: { template: '<div>Section editor</div>' } }));

beforeEach(() => vi.resetAllMocks());
const button = (view, name) => view.findAll('button').find(element => element.text() === name);

it('previews a company agreement before assignment and invalidates review when terms change', async () => {
  state.get.mockImplementation(async path => ({ data: path === '/contracts/library'
    ? { configs: [{ id: 4, slug: 'plotline_general_employment_v1', is_active: 1 }], agency: state.company }
    : path.endsWith('/wizard-context') ? { tokens: { CANDIDATE_NAME: 'Jamie Example', JOB_TITLE: 'Consultant' } }
    : { candidates: [{ id: 42, firstName: 'Jamie', lastName: 'Example' }] } }));
  state.post.mockImplementation(async path => ({ data: path.endsWith('/preview')
    ? { previewHash: 'reviewed', html: '<h1>Juniper Consulting QA</h1>', unresolvedTokens: [] } : { task: { id: 121 } } }));
  const view = mount(ContractView, { global: { stubs: { RouterLink: true } } });
  try {
    await flushPromises();
    expect(state.get).toHaveBeenCalledWith('/contracts/library', { params: { agencyId: 463 } });
    await view.get('.general-contract select').setValue('42');
    await flushPromises();
    expect(view.get('input[maxlength="255"]').element.value).toBe('Jamie Example');
    await view.get('input[type="date"]').setValue('2026-12-01');
    await view.get('textarea[placeholder^="Role responsibilities"]').setValue('Support client workshops from home.');
    await view.get('textarea[placeholder^="Approved pay"]').setValue('USD 65 per hour.');
    expect(button(view, 'Assign for signature').element.disabled).toBe(true);
    await button(view, 'Preview agreement').trigger('click');
    await flushPromises();
    expect(view.get('iframe').attributes('srcdoc')).toContain('Juniper Consulting QA');
    expect(button(view, 'Assign for signature').element.disabled).toBe(false);
    await view.get('textarea[placeholder^="Approved pay"]').setValue('USD 70 per hour.');
    expect(button(view, 'Assign for signature').element.disabled).toBe(true);
    await button(view, 'Preview agreement').trigger('click');
    await flushPromises();
    await button(view, 'Assign for signature').trigger('click');
    await flushPromises();
    expect(state.post).toHaveBeenLastCalledWith('/contracts/candidates/42/generate', expect.objectContaining({
      agencyId: 463, configId: 4, expectedPreviewHash: 'reviewed', tokens: expect.objectContaining({ PAY_TERMS: 'USD 70 per hour.' })
    }));
  } finally { view.unmount(); }
});

it('offers guided or blank handbook setup and keeps pending prompts from being published', async () => {
  const source = { revision: 'starter', sections: [] };
  const published = { version: null, sections: [] };
  state.get.mockResolvedValueOnce({ data: { source, published, changes: [] } }).mockResolvedValueOnce({
    data: { source, published, changes: [], draft: { version: { id: 12, version_number: 1 },
      sections: [], requiredCompanySections: [{ slug: 'workplace-contacts', title: 'Where to get help' }] } }
  });
  state.post.mockResolvedValue({ data: { versionId: 12 } });
  const view = mount(Handbook, { props: { agencyId: 463, plotlineSelfService: true } });
  try {
    await flushPromises();
    expect(button(view, 'Start a blank draft')).toBeDefined();
    await button(view, 'Start with guided sections').trigger('click');
    await flushPromises();
    expect(state.post).toHaveBeenCalledWith('/provider-update/handbook/source/stage', { agencyId: 463, sourceRevision: 'starter', expectedPublishedVersionId: null });
    expect(view.text()).toContain('Section editor');
    expect(button(view, 'Publish handbook').element.disabled).toBe(true);
  } finally { view.unmount(); }
});
