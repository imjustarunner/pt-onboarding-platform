import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
import { buildCounselingFamilyEnSteps } from '../../../../backend/src/data/counselingIntakeFamilyEn.js';

const { get, post, route } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(),
  route: { params: { publicKey: 'office-followup-test' }, query: {}, path: '/intake/office-followup-test' }
}));
vi.mock('../../services/api', () => ({ default: { get, post, put: vi.fn(), defaults: { baseURL: '/api' } } }));
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('../../components/documents/PDFPreview.vue', () => ({ default: { template: '<div/>' } }));

let wrapper;
beforeEach(() => {
  route.query = {};
  sessionStorage.clear(); localStorage.clear();
  window.scrollTo = vi.fn(); Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('CSS', { escape: value => String(value) });
  post.mockReset().mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });

function question(id, key, extra = {}) {
  return { id, type: 'questions', label: id, fields: [{ key, label: key, type: 'text' }], ...extra };
}

async function render(steps, { subject = 'self', locale = 'en', clients = [], startId } = {}) {
  const agency = { id: 2, name: 'Demo Agency', slug: 'demo' };
  const data = {
    link: {
      id: 1, form_type: 'intake', scope_type: 'agency', agency_id: 2, organization_id: 2,
      inherits_office_master: 1, master_channel: 'counseling', language_code: 'en',
      intake_fields: [], intake_steps: steps
    },
    agency, organization: { ...agency, organization_type: 'agency' }, templates: []
  };
  get.mockReset().mockImplementation(async url => ({ data: url === '/public-intake/office-followup-test' ? data : {} }));
  wrapper = mount(PublicIntakeSigningView, { global: {
    plugins: [createPinia()],
    stubs: { DigitalFormShell: { template: '<main><slot/></main>' }, SignaturePad: true }
  } });
  await flushPromises();
  wrapper.vm.serviceSubject = subject;
  wrapper.vm.intakeForSelf = subject === 'self';
  wrapper.vm.inPageLocale = locale;
  if (clients.length) {
    wrapper.vm.clients = clients;
    wrapper.vm.intakeResponses.clients = clients.map(() => ({}));
  }
  wrapper.vm.step = 2;
  await flushPromises();
  if (startId) {
    const index = wrapper.vm.flowSteps.findIndex(step => step.id === startId);
    expect(index).toBeGreaterThanOrEqual(0);
    wrapper.vm.currentFlowIndex = index;
    await flushPromises();
  }
}

it.each(['en', 'es'])('Skip Now reaches required safety in %s without completing it', async locale => {
  await render([
    question('identity', 'legal_first_name'),
    question('optional-goals', 'goals'),
    question('optional-history', 'history'),
    question('safety', 'safety_immediate_danger'),
    { id: 'communications', type: 'communications', label: 'Communications' },
    question('last-required', 'email_address')
  ], { locale, startId: 'optional-history' });
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.officeSkipSplashOpen).toBe(true);
  await wrapper.vm.onOfficeSkipNow();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('safety');
  expect(wrapper.vm.intakeResponses.submission.safety_immediate_danger).toBeUndefined();
  expect(wrapper.vm.flowSteps.map(step => step.id)).toContain('communications');
  const communicationsProgress = wrapper.vm.dfProgressSteps.findIndex(step => step.id === 'communications');
  expect(communicationsProgress).toBeGreaterThan(wrapper.vm.dfProgressIndex);
  wrapper.vm.jumpToProgressStep(communicationsProgress);
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('safety');
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('safety');
  expect(wrapper.vm.missingRequiredQuestionKeys).toContain('safety_immediate_danger');
  expect(wrapper.get('[data-question-key="safety_immediate_danger"] .df-field-required').exists()).toBe(true);
  expect(post.mock.calls.some(([url]) => /finalize|\/sign/.test(url))).toBe(false);
  wrapper.vm.questionValues.safety_immediate_danger = 'no';
  await wrapper.vm.handleCurrentFlowContinue();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('communications');
});

it('does not seed clinical answers from a retained legacy schema and preserves deliberate answers', async () => {
  const legacy = question('legacy-history', 'life_work_school', { fields: [
    { key: 'life_work_school', label: 'Work or school', type: 'radio', defaultValue: 'going_well', options: [
      { value: 'going_well', label: 'Going well' }, { value: 'difficulty', label: 'Some difficulty' }
    ] },
    { key: 'history', label: 'History', type: 'checkbox_group', defaultValue: ['none'], options: [
      { value: 'none', label: 'Deny all' }, { value: 'prior_help', label: 'Prior support' }
    ] }
  ] });
  await render([legacy, question('next', 'next_notes')], { startId: 'legacy-history' });
  expect(wrapper.vm.questionValues.life_work_school).toBeUndefined();
  expect(wrapper.vm.questionValues.history).toBeUndefined();
  expect(wrapper.findAll('.df-choice-btn--selected')).toHaveLength(0);
  wrapper.vm.questionValues.life_work_school = 'difficulty';
  wrapper.vm.questionValues.history = ['prior_help'];
  wrapper.vm.currentFlowIndex = 1; await flushPromises();
  wrapper.vm.currentFlowIndex = 0; await flushPromises();
  expect(wrapper.vm.questionValues.life_work_school).toBe('difficulty');
  expect(wrapper.vm.questionValues.history).toEqual(['prior_help']);
});

it('restores a saved couple subject without replacing it with the dependent audience', async () => {
  await render([
    question('couple-relationship', 'main_reason_couples', { audience: 'couple' }),
    question('dependent-history', 'child_history', { audience: 'dependent' }),
    question('shared-last', 'email_address')
  ]);
  wrapper.vm.serviceSubject = '';
  wrapper.vm.applyDraftSnapshot({
    step: 2, currentFlowIndex: 0, intakeForSelf: false,
    clients: [
      { firstName: 'Alex', lastName: 'Demo', dateOfBirth: '1990-01-01' },
      { firstName: 'Jordan', lastName: 'Demo', dateOfBirth: '1991-01-01' }
    ],
    intakeResponses: { submission: { serviceSubject: 'couple' }, guardian: {}, clients: [{}, {}] }
  });
  await flushPromises();
  expect(wrapper.vm.serviceSubject).toBe('couple');
  expect(wrapper.vm.currentFlowStep.id).toBe('couple-relationship');
  expect(wrapper.vm.flowSteps.some(step => step.audience === 'dependent')).toBe(false);
  expect(wrapper.vm.intakeResponses.submission.serviceSubject).toBe('couple');
});

it.each(['en', 'es'])('resolves family member names and uses member wording in %s', async locale => {
  const memberStep = buildCounselingFamilyEnSteps().find(step => step.id === 'counseling_family_member_mini');
  await render([memberStep, question('shared-last', 'email_address')], {
    subject: 'family', locale,
    clients: [
      { firstName: 'Alex', lastName: 'Demo', dateOfBirth: '1990-01-01' },
      { firstName: 'Jordan', lastName: 'Demo', dateOfBirth: '1991-01-01' }
    ],
    startId: 'counseling_family_member_mini__c1'
  });
  expect(wrapper.get('.ai-page-title').text()).toContain('Jordan');
  expect(wrapper.text()).not.toContain('{memberName}');
  const banner = wrapper.get('.intake-child-banner').text();
  expect(banner).toContain('Jordan');
  expect(banner).toMatch(locale === 'es' ? /miembro/i : /member/i);
  expect(banner).not.toMatch(/\bchild\b|\bniño\b/i);
});

it.each(['en', 'es'])('shows an adult couple starter in %s without guardian/custody controls', async locale => {
  await render([question('couple-relationship', 'main_reason_couples', { audience: 'couple' })], { locale });
  wrapper.vm.step = 0.5;
  wrapper.vm.chooseServiceSubject('couple');
  await flushPromises();
  expect(wrapper.get('#starterDob').isVisible()).toBe(true);
  expect(wrapper.get('#clientFirstName_1').isVisible()).toBe(true);
  expect(wrapper.get('#clientDob_1').isVisible()).toBe(true);
  expect(wrapper.get('#clientFirstName_0').isVisible()).toBe(false);
  expect(wrapper.find('#guardianRelationship').exists()).toBe(false);
  expect(wrapper.find('.intake-start-custody').exists()).toBe(false);
  const partner = wrapper.get('.intake-start-dependents');
  expect(partner.text()).toContain(locale === 'es' ? 'pareja' : 'partner');
  expect(partner.text()).not.toMatch(/dependent|dependiente|custody|custodia/i);
  expect(partner.find('.intake-add-dependent').exists()).toBe(false);
});

it('rechecks mandatory safety before final submission even when a later page is selected', async () => {
  await render([
    question('safety', 'safety_immediate_danger'),
    question('later-page', 'later_notes')
  ], { startId: 'later-page' });
  await wrapper.vm.finalizePacket();
  await flushPromises();
  expect(wrapper.vm.currentFlowStep.id).toBe('safety');
  expect(wrapper.vm.step).toBe(2);
  expect(wrapper.vm.stepError).not.toBe('');
  expect(post.mock.calls.some(([url]) => /\/finalize/.test(url))).toBe(false);
});
