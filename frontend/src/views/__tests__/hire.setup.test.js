import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));
vi.mock('../../services/api', () => ({ default: http }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 1 } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { userId: 2, organizationSlug: 'itsco' }, query: {} }), useRouter: () => ({ push: vi.fn() }), onBeforeRouteLeave: vi.fn() }));
import { onBeforeRouteLeave } from 'vue-router';
import StartPreHire from '../admin/StartPreHireView.vue';
import PromoteToOnboarding from '../../components/hiring/PromoteToOnboardingModal.vue';
let wrapper;
const officeDefaults = {
  agency: { address: '100 Headquarters Rd, Denver, CO' },
  offices: [{ id: 1, name: 'Windchime', city: 'Colorado Springs', state: 'CO', address: '437 Windchime Place, Colorado Springs, CO' }]
};
beforeEach(() => {
  vi.clearAllMocks(); http.patch.mockResolvedValue({ data: {} });
  http.get.mockImplementation(async url => ({ data:
    url === '/hiring/candidates/2' ? { user: { first_name: 'Elena', last_name: 'Cruz', email: 'elena@example.org' }, profile: {}, jobDescription: { title: 'Counselor', descriptionText: 'School counseling' } }
    : url === '/hiring/settings' ? { handbook_full_url: 'https://docs.google.com/document/d/handbook/edit', portal_workflow: { resources: [{ id: 'video', title: 'Welcome video', phase: 'pre_hire', kind: 'video', url: 'https://example.org/welcome' }, { id: 'w4', title: 'W4', phase: 'onboarding', kind: 'document' }] } }
    : url.includes('wizard-context') ? { ...officeDefaults, tokens: { COMPANY_NAME: 'Agency' }, configs: [{ id: 3, name: 'Hourly agreement' }], suggested: { configId: 3, officeLocationId: 1 } }
    : url.endsWith('prehire-link') ? { portalLink: 'https://app.itsco.health/pre-hire/existing' }
    : url === '/onboarding-packages' ? [{ id: 8, name: 'Pre-hire documents', package_type: 'pre_hire', is_active: true }, { id: 9, name: 'Employee onboarding', package_type: 'onboarding', is_active: true }]
    : url === '/onboarding-packages/9' ? { id: 9, name: 'Employee onboarding', documents: [{ document_name: 'Payroll form' }] }
    : [] }));
  http.put.mockImplementation(async (_url, body) => ({ data: { revision: body.revision + 1 } }));
  http.post.mockResolvedValue({ data: { html: '<p>Elena Cruz agreement</p>', unresolvedTokens: [] } });
});
afterEach(() => wrapper?.unmount());
const button = text => wrapper.findAll('button').find(b => b.text().includes(text));
describe('hire setup wizards', () => {
  it('uses the person’s saved onboarding collection and steps when preparing promotion', async () => {
    const original = http.get.getMockImplementation();
    http.get.mockImplementation(async url => url.endsWith('hire-packages') ? { data: { phases: { onboarding: { packageId: 9, workflow: { resources: [{ id: 'orientation', phase: 'onboarding', title: 'Personal orientation', kind: 'link', url: 'https://example.org/orientation' }], excludedResourceIds: ['w4'] } } } } } : original(url));
    wrapper = mount(PromoteToOnboarding, { props: { candidate: { id: 2, first_name: 'Elena', status: 'PREHIRE_REVIEW' }, agencyId: 1 }, global: { stubs: { Teleport: true, OnboardingAccessSetup: true } } });
    await flushPromises();
    expect(wrapper.find('select.pto-select').element.value).toBe('9');
    expect(wrapper.text()).toContain('Personal orientation');
    expect(wrapper.findComponent({ name: 'HireWorkflowEditor' }).props('modelValue').excludedResourceIds).toEqual(['w4']);
  });

  it('builds one student agreement with a selected starting phase and invalidates review when it changes', async () => {
    const defaultGet = http.get.getMockImplementation();
    http.get.mockImplementation(async url => url.includes('wizard-context') ? { data: {
      ...officeDefaults, tokens: { UNIVERSITY_NAME: 'Training University' },
      configs: [{ id: 3, name: 'Old provider config' }, { id: 5, name: 'Old unpaid practicum config', pay_mode: 'none' }],
      suggested: { configId: 5, officeLocationId: 1 },
      agreementBuilder: { suggestedVariant: 'student', suggestedTrainingStartPhase: 'practicum', options: [
        { value: 'provider', label: 'Employment agreement — Provider', configId: 3, roleLabel: 'Provider' },
        { value: 'student', label: 'Student training agreement', configId: 5, roleLabel: 'Student' }
      ] },
      compensationLevels: [{ category: 2, level: 1, direct_rate: 42, indirect_rate: 22, ffs_rate: 42, serviceRates: [{ code: '90837', rate: '$42.00', unit: 'per entered unit' }] }]
    } } : defaultGet(url));
    wrapper = mount(StartPreHire, { global: { stubs: { RouterLink: true } } }); await flushPromises();
    const role = wrapper.findAll('label').find(l => l.text().startsWith('Agreement role')).get('select');
    expect(role.element.value).toBe('student');
    expect(wrapper.findAll('label').some(l => l.text().startsWith('Contract configuration'))).toBe(false);
    const phase = wrapper.findAll('label').find(l => l.text().startsWith('Starting training phase')).get('select');
    expect(phase.element.value).toBe('practicum');
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay category')).get('select').setValue('2');
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay level')).get('select').setValue('1');
    expect(wrapper.get('table').text()).toContain('90837$42.00');
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.at(-1)[1]).toMatchObject({ configId: 5, tokens: { AGREEMENT_SELECTION_DRIVEN: '1', AGREEMENT_VARIANT: 'student', TRAINING_START_PHASE: 'practicum', UNIVERSITY_NAME: 'Training University' } });
    const reviewed = wrapper.findAll('label').find(l => l.text().includes('I reviewed this agreement')).get('input');
    await reviewed.setValue(true);
    await phase.setValue('internship');
    expect(wrapper.findAll('label').some(l => l.text().includes('I reviewed this agreement'))).toBe(false);
    expect(wrapper.text()).toContain('Values changed. Update the preview');
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.at(-1)[1]).toMatchObject({ configId: 5, tokens: { TRAINING_START_PHASE: 'internship' } });
    expect(wrapper.findAll('label').find(l => l.text().includes('I reviewed this agreement')).get('input').element.checked).toBe(false);
    await role.setValue('provider');
    expect(wrapper.findAll('label').some(l => l.text().startsWith('Starting training phase'))).toBe(false);
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.at(-1)[1]).toMatchObject({ configId: 3, tokens: { AGREEMENT_VARIANT: 'provider', ROLE_LABEL: 'Provider' } });
  });
  it('defaults the employer address from the agency and requires an office choice for a multiple-city posting', async () => {
    const defaultGet = http.get.getMockImplementation();
    http.get.mockImplementation(async url => url.includes('wizard-context') ? { data: {
      ...officeDefaults, offices: [...officeDefaults.offices, { id: 2, name: 'Denver Office', city: 'Denver', state: 'CO', address: '200 Office St, Denver, CO' }],
      tokens: { COMPANY_ADDRESS: '', ASSIGNED_OFFICE_SOURCE: 'This posting covers multiple cities. Select the office where this person will be assigned.' },
      configs: [{ id: 3, name: 'Internship' }], suggested: { configId: 3, officeLocationId: null }
    } } : defaultGet(url));
    wrapper = mount(StartPreHire, { global: { stubs: { RouterLink: true } } }); await flushPromises();
    const employerAddress = wrapper.findAll('label').find(l => l.text() === 'Employer address').get('input');
    expect(employerAddress.element.value).toBe(officeDefaults.agency.address);
    expect(employerAddress.attributes('readonly')).toBeDefined();
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay category')).get('select').setValue('2');
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay level')).get('select').setValue('1');
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Select the assigned office before previewing.');
    const office = wrapper.findAll('label').find(l => l.text().startsWith('Assigned office') && l.find('select').exists()).get('select');
    expect(office.findAll('optgroup').map(group => group.attributes('label'))).toEqual(['Colorado Springs, CO', 'Denver, CO']);
    await office.setValue('2');
    expect(wrapper.findAll('label').find(l => l.text() === 'Office address').get('input').element.value).toBe('200 Office St, Denver, CO');
    expect(employerAddress.element.value).toBe(officeDefaults.agency.address);
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post.mock.calls[0][1]).toMatchObject({ officeLocationId: 2, tokens: { COMPANY_ADDRESS: officeDefaults.agency.address, ASSIGNED_OFFICE_NAME: 'Denver Office', ASSIGNED_OFFICE_ADDRESS: '200 Office St, Denver, CO' } });
  });
  it.each([true, false])('shows school days only for an ITSCO school focus (ITSCO: %s)', async schoolDaysEnabled => {
    const defaultGet = http.get.getMockImplementation();
    http.get.mockImplementation(async url => url.includes('wizard-context') ? { data: {
      ...officeDefaults, tokens: { SERVICE_FOCUS: 'Office-Based Counseling' }, configs: [{ id: 3, name: 'Agreement' }], suggested: { configId: 3, officeLocationId: 1 },
      schoolDaysEnabled, serviceFocusOptions: ['School-Based Counseling', 'Office-Based Counseling', 'Skill Builders Program']
    } } : defaultGet(url));
    wrapper = mount(StartPreHire, { global: { stubs: { RouterLink: true } } }); await flushPromises();
    const days = () => wrapper.findAll('label').find(l => l.text().startsWith('Expected school days / week'));
    expect(days()).toBeUndefined();
    await button('Add another service focus').trigger('click');
    await wrapper.get('select[aria-label="Service focus 2"]').setValue('School-Based Counseling');
    expect(Boolean(days())).toBe(schoolDaysEnabled);
    if (schoolDaysEnabled) {
      expect(days().text()).toContain('8:00 a.m.–3:00 p.m.');
      expect(days().text()).toContain('roughly seven clients');
      await days().get('input').setValue('2');
    }
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay category')).get('select').setValue('2');
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay level')).get('select').setValue('1');
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.at(-1)[1].tokens).toMatchObject({ SERVICE_FOCUS: 'Office-Based Counseling; School-Based Counseling', MIN_DAYS_PER_WEEK: schoolDaysEnabled ? 2 : '' });
    await wrapper.get('button[aria-label="Remove service focus 2"]').trigger('click');
    expect(days()).toBeUndefined();
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.at(-1)[1].tokens).toMatchObject({ SERVICE_FOCUS: 'Office-Based Counseling', MIN_DAYS_PER_WEEK: '' });
  });
  it('shows the selected level service rates and updates them when the level changes', async () => {
    const defaultGet = http.get.getMockImplementation();
    http.get.mockImplementation(async url => url.includes('wizard-context') ? { data: {
      ...officeDefaults, tokens: {}, configs: [{ id: 3, name: 'FFS agreement', pay_mode: 'ffs' }], suggested: { configId: 3, officeLocationId: 1 },
      compensationLevels: [1, 2].map(level => ({ category: 2, level, direct_rate: level === 1 ? 42 : 44, indirect_rate: 22, ffs_rate: level === 1 ? 42 : 44,
        serviceRates: ['90791', '90837'].map(code => ({ code, rate: level === 1 ? '$42.00' : '$44.00', unit: 'per unit' })) }))
    } } : defaultGet(url));
    wrapper = mount(StartPreHire, { global: { stubs: { RouterLink: true } } }); await flushPromises();
    await wrapper.findAll('label').find(l => l.text().startsWith('Pay category')).get('select').setValue('2');
    const level = wrapper.findAll('label').find(l => l.text().startsWith('Pay level')).get('select');
    await level.setValue('1');
    expect(wrapper.get('table').text()).toContain('90791$42.00');
    expect(wrapper.get('table').text()).toContain('90837$42.00');
    expect(wrapper.get('table').text()).not.toContain('$40.00');
    await level.setValue('2');
    expect(wrapper.get('table').text()).toContain('90791$44.00');
    expect(wrapper.get('table').text()).not.toContain('$42.00');
  });
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
    await wrapper.findAll('label').find(l => l.text().startsWith('Min hours / week')).get('input').setValue('6');
    expect(wrapper.text()).toContain('Required available-to-book time: 8 hours / week. Expected to schedule: 8 hours / week');
    expect(wrapper.findAll('label').some(l => l.text().startsWith('Weekly session goal'))).toBe(false);
    await button('Update contract preview').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.find(([url]) => url.endsWith('/preview'))[1].tokens.JOB_TITLE).toBe('School Counselor');
    expect(http.post.mock.calls.find(([url]) => url.endsWith('/preview'))[1]).toMatchObject({ compensationCategory: '2', compensationLevel: '2' });
    expect(http.post.mock.calls.find(([url]) => url.endsWith('/preview'))[1].tokens).toMatchObject({ MIN_HOURS: 6 });
    expect(wrapper.find('iframe[title="Candidate employment agreement preview"]').attributes('srcdoc')).toContain('Elena Cruz');
    const reviewed = wrapper.findAll('label').find(l => l.text().includes('I reviewed this agreement')).get('input');
    await reviewed.setValue(true);
    await wrapper.findAll('.sph-steps button')[3].trigger('click');
    expect(button('Prepare and send').attributes('disabled')).toBeUndefined();
    await wrapper.findAll('.sph-steps button')[2].trigger('click');
    await wrapper.findAll('label').find(l => l.text().startsWith('Min hours / week')).get('input').setValue('10');
    expect(wrapper.text()).toContain('Required available-to-book time: 13 hours / week. Expected to schedule: 13 hours / week');
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
    expect(wrapper.findAll('[role="status"]').map(node => node.text()).join(" ")).toContain('invitation was not sent');
    expect(wrapper.findAll('[role="status"]').map(node => node.text()).join(" ")).not.toContain('Invitation emailed');
    http.post.mockResolvedValueOnce({ data: { passwordlessTokenLink: 'https://app.itsco.health/pre-hire/refreshed', email: { status: 'sent', redirected: true, deliveredTo: 'testing@itsco.health' } } });
    await button('Email portal link again').trigger('click'); await flushPromises();
    expect(http.post.mock.calls.filter(([url]) => url.endsWith('/send-prehire'))).toHaveLength(1);
    expect(http.post.mock.calls.at(-1)[0]).toBe('/hiring/candidates/2/email-prehire-link');
    expect(wrapper.findAll('[role="status"]').map(node => node.text()).join(" ")).toContain('Invitation emailed to testing@itsco.health');
    expect(wrapper.findAll('[role="status"]').map(node => node.text()).join(" ")).toContain('Test address redirected');
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

describe('saved pre-hire progress', () => {
  it('restores the selections and hours while keeping agency addresses current and review unapproved', async () => {
    const normalGet = http.get.getMockImplementation();
    http.get.mockImplementation(async url => url.endsWith('/prehire-draft') ? { data: { revision: 4, draft: {
      contract: { minHours: 6, compensationCategory: 2, compensationLevel: 1, startDate: '2026-11-01' },
      contractOverrides: { COMPANY_ADDRESS: 'Old address', SERVICE_FOCUS: 'Office-Based Counseling' },
      officeLocationId: 1, contractConfigId: 3, setupStep: 2, prehirePackageId: 8,
      contractReviewed: true, contractPreview: { html: 'obsolete preview' }
    } } } : normalGet(url));
    wrapper = mount(StartPreHire, { global: { stubs: { RouterLink: true } } }); await flushPromises();
    expect(wrapper.findAll('label').find(l => l.text().startsWith('Min hours')).get('input').element.value).toBe('6');
    expect(wrapper.text()).toContain('Expected to schedule: 8 hours');
    expect(wrapper.findAll('label').find(l => l.text() === 'Employer address').get('input').element.value).toBe(officeDefaults.agency.address);
    expect(wrapper.text()).not.toContain('obsolete preview');
    expect(wrapper.findAll('label').some(l=>l.text().includes('I reviewed this agreement'))).toBe(false);
    expect(http.put).not.toHaveBeenCalled();
    await wrapper.findAll('label').find(l => l.text().startsWith('Min hours')).get('input').setValue('7');
    const leave = onBeforeRouteLeave.mock.calls.at(-1)[0];
    expect(await leave()).toBe(true);
    expect(http.put.mock.calls.at(-1).slice(0,2)).toMatchObject(['/hiring/candidates/2/prehire-draft', { revision:4, draft:{contract:{minHours:7,compensationCategory:2,compensationLevel:1},officeLocationId:1} }]);
  });
  it('keeps unsaved progress visible and blocks navigation when saving fails', async () => {
    wrapper = mount(StartPreHire, { global: { stubs: { RouterLink: true } } }); await flushPromises();
    http.put.mockRejectedValue({response:{data:{error:{message:'This draft changed in another window.'}}}});
    await wrapper.findAll('label').find(l => l.text().startsWith('Min hours')).get('input').setValue('6');
    const leave = onBeforeRouteLeave.mock.calls.at(-1)[0];
    expect(await leave()).toBe(false);await flushPromises();
    expect(wrapper.text()).toContain('This draft changed in another window.');
    expect(wrapper.findAll('label').find(l => l.text().startsWith('Min hours')).get('input').element.value).toBe('6');
  });
});
