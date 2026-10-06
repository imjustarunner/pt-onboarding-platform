import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../services/api', () => ({ default: http }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 1 } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { userId: 2, organizationSlug: 'itsco' }, query: {} }), useRouter: () => ({ push: vi.fn() }) }));
import StartPreHire from '../admin/StartPreHireView.vue';
import PromoteToOnboarding from '../../components/hiring/PromoteToOnboardingModal.vue';
let wrapper;
beforeEach(() => {
  vi.clearAllMocks(); http.patch.mockResolvedValue({ data: {} });
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
  it('requires a deliberate pay-level choice before previewing', async () => {
    wrapper = mount(StartPreHire, { global: { stubs: { RouterLink: true } } }); await flushPromises();
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('Choose a pay category and level before previewing.');
  });
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
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay category')).get('select').setValue('2');
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay level')).get('select').setValue('2');
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.find(([url]) => url.endsWith('/preview'))[1].tokens.JOB_TITLE).toBe('School Counselor');
    expect(http.post.mock.calls.find(([url]) => url.endsWith('/preview'))[1]).toMatchObject({ compensationCategory: '2', compensationLevel: '2' });
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
  it('shows failed delivery and retries just the email without recreating the prehire packet', async () => {
    wrapper = mount(StartPreHire, { global: { stubs: { RouterLink: true } } }); await flushPromises();
    await wrapper.findAll('.sph-steps button')[2].trigger('click');
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay category')).get('select').setValue('2');
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay level')).get('select').setValue('2');
    await button('Update contract preview').trigger('click'); await flushPromises();
    await wrapper.findAll('label').find(l => l.text().includes('I reviewed this agreement')).get('input').setValue(true);
    await wrapper.findAll('.sph-steps button')[3].trigger('click');
    http.post.mockResolvedValueOnce({ data: { passwordlessTokenLink: 'https://app.itsco.health/pre-hire/created', email: { status: 'failed', reason: 'send_failed' } } });
    await button('Prepare and send').trigger('click'); await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('invitation was not sent');
    expect(wrapper.get('[role="status"]').text()).not.toContain('Invitation emailed');
    http.post.mockResolvedValueOnce({ data: { passwordlessTokenLink: 'https://app.itsco.health/pre-hire/refreshed', email: { status: 'sent', redirected: true, deliveredTo: 'testing@itsco.health' } } });
    await button('Email portal link again').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.filter(([url]) => url.endsWith('/send-prehire'))).toHaveLength(1);
    expect(http.post.mock.calls.at(-1)[0]).toBe('/hiring/candidates/2/email-prehire-link');
    expect(wrapper.get('[role="status"]').text()).toContain('Invitation emailed to testing@itsco.health');
    expect(wrapper.get('[role="status"]').text()).toContain('Test address redirected');
  });
  it('onboarding offers only onboarding collections and requires review before promotion', async () => {
    wrapper = mount(PromoteToOnboarding, { props: { candidate: { id: 2, first_name: 'Elena', work_email: 'elena@agency.org' }, agencyId: 1 }, global: { stubs: { teleport: true } } }); await flushPromises();
    const options = wrapper.findAll('.pto-select option').map(o => o.text());
    expect(options).toContain('Employee onboarding'); expect(options).not.toContain('Pre-hire documents');
    expect(button('Confirm & Move')).toBeUndefined();
    expect(button('Continue →').attributes('disabled')).toBeDefined();
    await wrapper.get('.pto-select').setValue('9'); await flushPromises();
    await button('Continue →').trigger('click'); await button('Continue →').trigger('click'); await flushPromises();
    expect(wrapper.find('.pto-summary').text()).toContain('Payroll form');
    expect(button('Confirm & Move')).toBeDefined(); expect(http.post).not.toHaveBeenCalled();
  });
  it('creates and selects an agency onboarding collection without defaulting to another role', async () => {
    wrapper = mount(PromoteToOnboarding, { props: { candidate: { id: 2, first_name: 'Elena', applied_role: 'Provider' }, agencyId: 1 }, global: { stubs: { teleport: true } } }); await flushPromises();
    expect(wrapper.get('.pto-select').element.value).toBe('');
    http.post.mockResolvedValueOnce({ data: { id: 10, name: 'Provider onboarding', agency_id: 1, package_type: 'onboarding', is_active: true } });
    await button('Create collection').trigger('click');
    await wrapper.get('.pto-new-collection input').setValue('Provider onboarding');
    await wrapper.get('.pto-new-collection').trigger('submit'); await flushPromises();
    expect(http.post).toHaveBeenCalledWith('/onboarding-packages', { name: 'Provider onboarding', description: '', agencyId: 1, packageType: 'onboarding', isActive: true });
    expect(wrapper.get('.pto-select').element.value).toBe('10');
  });

});
