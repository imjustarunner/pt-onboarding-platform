import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
const { get, post, route } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), route: { params: { publicKey: 'school-test' }, query: { session: 'test-session' }, path: '/intake/school-test' } }));
vi.mock('../../services/api', () => ({ default: { get, post, put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div />' } }));
const field = (key, label, type = 'text', required = true) => ({ key, label, type, required, scope: 'client' });
const steps = [
  { id: 'questions', type: 'questions', label: 'Questions', fields: [field('client_dob', 'Date of birth', 'date'), field('client_grade', 'Current grade'), field('client_street', 'Street address'), field('client_apt', 'Apartment', 'text', false), field('client_city', 'City'), field('client_state', 'State'), field('client_zip', 'ZIP'), field('prior_support', 'Has this child had counseling?')] },
  { id: 'screener', type: 'clinical_questions', label: 'Screener', fields: [field('psc_1', 'Feels sad')] },
  { id: 'roi', type: 'school_roi', label: 'School ROI' },
  { id: 'communications', type: 'communications', label: 'Communication preferences' }
];
const linkData = { link: { id: 1, form_type: 'intake', scope_type: 'school', organization_id: 2, agency_id: 1, intake_steps: steps, intake_fields: [] }, organization: { id: 2, name: 'Example School', organization_type: 'school' }, agency: { id: 1, name: 'Example Agency' }, roiContext: { staffRoster: [], requiredAcknowledgements: [], waiverItems: [] }, templates: [] };
let wrapper;
beforeEach(() => {
  localStorage.clear(); window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn();
  get.mockReset().mockImplementation(async url => ({ data: url === '/public-intake/school-test' ? structuredClone(linkData) : {} }));
  post.mockReset().mockImplementation(async url => ({ data: url.endsWith('/consent') ? { submission: { id: 100 } } : url.endsWith('/finalize') ? { downloadUrl: '/packet.pdf', packetReady: true } : {} }));
});
afterEach(() => wrapper?.unmount());
async function render() {
  wrapper = mount(PublicIntakeSigningView, { global: { plugins: [createPinia()], stubs: {
    DigitalFormShell: { template: '<main class="public-intake"><slot /></main>' }, SignaturePad: true,
    SmartSchoolRoiFlow: { props: ['sharedChildren'], emits: ['captured'], template: `<div data-roi><span v-for="c in sharedChildren">{{ c.fullName }} {{ c.dateOfBirth }}</span><button data-sign-roi @click="$emit('captured', { smartSchoolRoi: { signatureData: 'data:image/png;base64,test', signerName: 'Pat Example', signedAt: new Date().toISOString() } })">Sign release for listed children</button></div>` }
  } } });
  await flushPromises(); wrapper.vm.step = 1; await flushPromises(); return wrapper;
}
async function setTwoChildren() {
  await render(); wrapper.vm.onSelectMultiClientPlan('multiple'); wrapper.vm.acceptMultiClientConsent(); await flushPromises();
  for (const [i, first, dob] of [[0, 'Alex', '2012-02-03'], [1, 'Blair', '2017-06-07']]) {
    await wrapper.get(`#clientFirstName_${i}`).setValue(first); await wrapper.get(`#clientLastName_${i}`).setValue('Example'); await wrapper.get(`#clientDob_${i}`).setValue(dob); await wrapper.get(`#child_${i}_client_grade`).setValue(i ? '3' : '8');
  }
  for (const [key, value] of Object.entries({ client_street: '10 Test St', client_city: 'Denver', client_state: 'CO', client_zip: '80201' })) await wrapper.get(`#child_0_${key}`).setValue(value);
  wrapper.vm.guardianFirstName = 'Pat'; wrapper.vm.guardianLastName = 'Example'; wrapper.vm.guardianEmail = 'pat@example.com'; wrapper.vm.guardianPhone = '3035550100'; wrapper.vm.otherGuardian.hasLegalRights = 'no'; await flushPromises();
}
describe('school enrollment parent journey', () => {
  it('asks for both DOBs up front and blocks an incomplete second identity at its input', async () => {
    await setTwoChildren(); await wrapper.get('#clientDob_1').setValue(''); await wrapper.vm.submitConsent(); await flushPromises();
    expect(wrapper.vm.step).toBe(1); expect(wrapper.get('#clientDob_1').attributes('aria-invalid')).toBe('true'); expect(post.mock.calls.some(([url]) => url.endsWith('/consent'))).toBe(false);
  });
  it('walks through separate named questions and screeners, signs once, and submits both answer bags', async () => {
    await setTwoChildren(); await wrapper.vm.submitConsent(); await flushPromises();
    expect(wrapper.vm.step).toBe(2); expect(wrapper.text()).toContain('Answering for child 1 of 2 — Alex Example'); expect(wrapper.find('[data-roi]').exists()).toBe(false);
    await wrapper.get('#q_prior_support').setValue('Yes'); await wrapper.vm.handleCurrentFlowContinue(); await flushPromises();
    expect(wrapper.vm.currentFlowStep.clientIndex).toBe(0); wrapper.vm.activeClinicalResponses.psc_1 = 'Often';
    expect(wrapper.text()).toContain('Continue to Blair Example’s questions');
    await wrapper.vm.handleCurrentFlowContinue(); await flushPromises();
    expect(wrapper.text()).toContain('Answering for child 2 of 2 — Blair Example'); expect(wrapper.get('#q_prior_support').element.value).toBe('');
    await wrapper.get('#q_prior_support').setValue('No'); await wrapper.vm.handleCurrentFlowContinue(); await flushPromises();
    expect(wrapper.vm.currentFlowStep.clientIndex).toBe(1); expect(wrapper.vm.activeClinicalResponses.psc_1).toBeUndefined(); wrapper.vm.activeClinicalResponses.psc_1 = 'Never'; await wrapper.vm.handleCurrentFlowContinue(); await flushPromises();
    expect(wrapper.get('[data-roi]').text()).toContain('Blair Example 2017-06-07'); await wrapper.get('[data-sign-roi]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Communication preferences'); expect(wrapper.text()).toContain('Edit children’s details'); wrapper.vm.communications.emailPreference = 'none'; wrapper.vm.communications.smsPreference = 'no'; await wrapper.vm.handleCurrentFlowContinue(); await flushPromises();
    const request = post.mock.calls.find(([url]) => url.endsWith('/finalize'))?.[1]; expect(request, JSON.stringify({error: wrapper.vm.error, stepError: wrapper.vm.stepError, step: wrapper.vm.step, flow: wrapper.vm.currentFlowStep, completed: wrapper.vm.intakeResponses.submission.completedSchoolChildSteps})).toBeTruthy();
    expect(request.clients.map(c => c.dateOfBirth)).toEqual(['2012-02-03', '2017-06-07']);
    expect(request.intakeData.responses.clients.map(c => [c.client_grade, c.prior_support, c.psc_1, c.client_street])).toEqual([['8', 'Yes', 'Often', '10 Test St'], ['3', 'No', 'Never', '10 Test St']]);
  });
});

it('defaults only the address, allows a separate address, and preserves it through draft restore', async () => {
  await setTwoChildren();
  expect(wrapper.vm.clients[1].sameAddressAsFirst).toBe(true);
  expect(wrapper.vm.intakeResponses.clients[1].client_street).toBe('10 Test St');
  expect(wrapper.vm.intakeResponses.clients[1].prior_support).toBeUndefined();
  await wrapper.get('[data-child-index="1"] .same-address-choice input').setValue(false);
  await wrapper.get('#child_1_client_street').setValue('20 Separate St');
  await wrapper.get('#child_0_client_street').setValue('30 Updated St');
  expect(wrapper.vm.intakeResponses.clients[1].client_street).toBe('20 Separate St');
  await wrapper.vm.submitConsent(); await flushPromises();
  wrapper.vm.intakeResponses.clients[0].prior_support = 'Yes';
  await wrapper.vm.handleCurrentFlowContinue(); await flushPromises();
  wrapper.vm.activeClinicalResponses.psc_1 = 'Often';
  await wrapper.vm.handleCurrentFlowContinue(); await flushPromises();
  const draft = JSON.parse(JSON.stringify(wrapper.vm.buildDraftSnapshot()));
  wrapper.vm.applyDraftSnapshot(draft); await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('questions__c1');
  expect(wrapper.vm.clients[1].dateOfBirth).toBe('2017-06-07');
  expect(wrapper.vm.clients[1].sameAddressAsFirst).toBe(false);
  expect(wrapper.vm.intakeResponses.clients[1].client_street).toBe('20 Separate St');
  expect(wrapper.vm.intakeResponses.clients[0].prior_support).toBe('Yes');
});

it('recovers an old blocked draft without copying its first-child answers into the sibling', async () => {
  await render();
  wrapper.vm.applyDraftSnapshot({ step: 2, currentFlowIndex: 3, intakeForSelf: false,
    clients: [{ firstName: 'Alex', lastName: 'Example' }, { firstName: 'Blair', lastName: 'Example' }],
    intakeResponses: { guardian: {}, clients: [{}, {}], submission: { client_dob: '2012-02-03', client_grade: '8', prior_support: 'Yes', clinicalResponses: { psc_1: 'Often' } } }
  });
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('questions__c0');
  expect(wrapper.vm.schoolChildDetailsOpen).toBe(true);
  expect(wrapper.get('#clientDob_0').element.value).toBe('2012-02-03');
  expect(wrapper.get('#clientDob_1').element.value).toBe('');
  expect(wrapper.vm.intakeResponses.clients[0].psc_1).toBe('Often');
  expect(wrapper.vm.intakeResponses.clients[1].psc_1).toBeUndefined();
  expect(wrapper.vm.intakeResponses.submission.prior_support).toBeUndefined();
});

it('routes skipped child questions back to that child before shared signing or submission', async () => {
  await setTwoChildren(); await wrapper.vm.submitConsent(); await flushPromises();
  wrapper.vm.currentFlowIndex = 4; await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('questions__c0');
  expect(wrapper.find('[data-roi]').exists()).toBe(false);
  wrapper.vm.currentFlowIndex = 5; await flushPromises();
  await wrapper.vm.finalizePacket(); await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('questions__c0');
  expect(post.mock.calls.some(([url]) => url.endsWith('/finalize'))).toBe(false);
});

it('lets parents repair a missing DOB directly from communication preferences', async () => {
  await setTwoChildren(); await wrapper.vm.submitConsent(); await flushPromises();
  wrapper.vm.currentFlowIndex = 5; await flushPromises();
  wrapper.vm.updateSchoolChildIdentity(1, 'dateOfBirth', '');
  await wrapper.vm.finalizePacket(); await flushPromises();
  expect(wrapper.get('#clientDob_1').exists()).toBe(true);
  await wrapper.get('#clientDob_1').setValue('2017-06-08');
  await wrapper.findAll('button').find(b => b.text() === 'Save details & continue').trigger('click'); await flushPromises();
  expect(wrapper.vm.schoolChildDetailsOpen).toBe(false);
  expect(wrapper.vm.buildClientPayloads()[1].dateOfBirth).toBe('2017-06-08');
  expect(wrapper.text()).toContain('Blair Example — 2017-06-08');
});

it('keeps standalone demographic pages in the named child’s own answer bag', async () => {
  await setTwoChildren();
  wrapper.vm.link.intake_steps = [{ id: 'demographics', type: 'demographics', label: 'About this child', showDob: true, showGender: true }, { id: 'communications', type: 'communications' }];
  await wrapper.vm.submitConsent(); await flushPromises();
  wrapper.vm.demographicsData.gender = 'Female';
  await wrapper.vm.handleCurrentFlowContinue(); await flushPromises();
  expect(wrapper.vm.currentFlowStep.clientIndex).toBe(1);
  expect(wrapper.vm.demographicsData.dob).toBe('2017-06-07');
  expect(wrapper.vm.demographicsData.gender).toBe('');
  expect(wrapper.vm.intakeResponses.clients[0].demographicsInfo.gender).toBe('Female');
});
