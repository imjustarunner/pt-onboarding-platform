import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/api', () => ({ default: http }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 1 } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { userId: 2, organizationSlug: 'itsco' }, query: {} }), useRouter: () => ({ push: vi.fn() }) }));
import StartPreHire from '../admin/StartPreHireView.vue';
import PromoteToOnboarding from '../../components/hiring/PromoteToOnboardingModal.vue';
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  http.get.mockImplementation(async url => ({ data:
    url === '/hiring/candidates/2' ? { user: { first_name: 'Elena', last_name: 'Cruz', email: 'elena@example.org' }, profile: {}, jobDescription: { title: 'Counselor', descriptionText: 'School counseling' } }
    : url === '/hiring/settings' ? { handbook_full_url: 'https://docs.google.com/document/d/handbook/edit', portal_workflow: { resources: [{ id: 'video', title: 'Welcome video', phase: 'pre_hire', kind: 'video', url: 'https://example.org/welcome' }, { id: 'w4', title: 'W4', phase: 'onboarding', kind: 'document' }] } }
    : url.includes('wizard-context') ? { tokens: { COMPANY_NAME: 'Agency' }, configs: [{ id: 3, name: 'Hourly agreement' }], suggested: { configId: 3 } }
    : url.endsWith('prehire-link') ? { portalLink: 'https://app.itsco.health/pre-hire/existing' }
    : url === '/onboarding-packages' ? [{ id: 8, name: 'Pre-hire documents', package_type: 'pre_hire', is_active: true }, { id: 9, name: 'Employee onboarding', package_type: 'onboarding', is_active: true }]
    : url === '/onboarding-packages/9' ? { id: 9, name: 'Employee onboarding', documents: [{ document_name: 'Payroll form' }] }
    : [] }));
  http.post.mockResolvedValue({ data: { html: '<p>Elena Cruz agreement</p>', unresolvedTokens: [] } });
});
afterEach(() => wrapper?.unmount());
const button = text => wrapper.findAll('button').find(b => b.text().includes(text));
describe('hire setup wizards', () => {
  it('isolates prehire, previews the contract and invalidates approval after an edit', async () => {
    wrapper = mount(StartPreHire, { global: { stubs: { RouterLink: true } } }); await flushPromises();
    expect(wrapper.findAll('.sph-steps button')).toHaveLength(4);
    expect(wrapper.text()).not.toContain('Onboarding package');
    expect(wrapper.findAll('a').some(a => a.attributes('href') === 'https://app.itsco.health/pre-hire/existing')).toBe(true);
    await wrapper.findAll('.sph-steps button')[1].trigger('click');
    expect(wrapper.find('.workflow-editor').text()).toContain('Welcome video');
    expect(wrapper.find('.workflow-editor').text()).not.toContain('W4');
    await wrapper.findAll('.sph-steps button')[2].trigger('click');
    const jobTitleInput = wrapper.findAll('label').find(label => label.text() === 'Job title').get('input');
    expect(jobTitleInput.element.value).toBe('Counselor');
    await jobTitleInput.setValue('School Counselor');
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.find(([url]) => url.endsWith('/preview'))[1].tokens.JOB_TITLE).toBe('School Counselor');
    expect(wrapper.find('iframe[title="Candidate employment agreement preview"]').attributes('srcdoc')).toContain('Elena Cruz');
    const reviewed = wrapper.findAll('label').find(l => l.text().includes('I reviewed this agreement')).get('input');
    await reviewed.setValue(true);
    await wrapper.findAll('.sph-steps button')[3].trigger('click');
    expect(button('Prepare and send').attributes('disabled')).toBeUndefined();
    await wrapper.findAll('.sph-steps button')[2].trigger('click');
    const name = wrapper.findAll('label').find(l => l.text() === 'Employer name').get('input'); await name.setValue('Another employer');
    expect(wrapper.text()).toContain('Values changed. Update the preview');
    await wrapper.findAll('.sph-steps button')[3].trigger('click');
    expect(button('Prepare and send').attributes('disabled')).toBeDefined();
    expect(http.post).toHaveBeenCalledTimes(1); // navigating never sends an invitation
  });
  it('onboarding offers only onboarding collections and requires review before promotion', async () => {
    wrapper = mount(PromoteToOnboarding, { props: { candidate: { id: 2, first_name: 'Elena', work_email: 'elena@agency.org' }, agencyId: 1 }, global: { stubs: { teleport: true } } }); await flushPromises();
    const options = wrapper.findAll('.pto-select option').map(o => o.text());
    expect(options).toContain('Employee onboarding'); expect(options).not.toContain('Pre-hire documents');
    expect(button('Confirm & Move')).toBeUndefined();
    await button('Continue →').trigger('click'); await button('Continue →').trigger('click');
    expect(wrapper.find('.pto-summary').text()).toContain('Payroll form');
    expect(button('Confirm & Move')).toBeDefined(); expect(http.post).not.toHaveBeenCalled();
  });
});
