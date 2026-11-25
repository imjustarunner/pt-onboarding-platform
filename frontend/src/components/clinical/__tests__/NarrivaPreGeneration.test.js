import { describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import NarrivaInlineFinding from '../NarrivaInlineFinding.vue';
import NarrivaCompliancePanel from '../NarrivaCompliancePanel.vue';
import { NARRIVA_CHECKS } from '../../../config/narrivaBrand.js';

describe('Narriva inline source confirmation', () => {
  it('requires affirmative consent before emitting a confirmation', async () => {
    const wrapper = mount(NarrivaInlineFinding, { props: { finding: { id: 'encounter_consent:consent', action: 'encounter' }, context: {} } });
    expect(wrapper.get('button').element.disabled).toBe(true);
    await wrapper.get('input[type=checkbox]').setValue(true);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply')[0]).toEqual([{ consentConfirmed: true }]);
    wrapper.unmount();
  });
  it('updates participants here rather than sending the provider elsewhere', async () => {
    const wrapper = mount(NarrivaInlineFinding, { props: { finding: { id: 'service_code:additional', action: 'participants' }, context: { participants: 'Client Only' } } });
    await wrapper.get('select').setValue('Client and Others');
    await wrapper.get('input').setValue('Mother');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply')[0][0]).toMatchObject({ participants: 'Client and Others', participantsDetail: 'Mother' });
    expect(wrapper.text()).toContain('Updated here');
    wrapper.unmount();
  });
  it('keeps an in-progress parent correction during unrelated encounter updates', async () => {
    const context = { agencyId: 450, clientId: 12, clinicalSessionId: 30, participants: 'Client Only' };
    const wrapper = mount(NarrivaInlineFinding, { props: {
      finding: { id: 'encounter_consent:participants', action: 'review_participants' }, context
    } });
    await wrapper.get('select').setValue('Others (client not present)');
    await wrapper.get('input').setValue('Parent');
    await wrapper.setProps({ context: { ...context, durationMinutes: 45 } });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply')[0][0]).toMatchObject({
      participants: 'Others (client not present)', participantsDetail: 'Parent'
    });
    await wrapper.setProps({ context: { ...context, clientId: 13, clinicalSessionId: 31 } });
    expect(wrapper.get('select').element.value).toBe('Client Only');
    expect(wrapper.find('input').exists()).toBe(false);
    wrapper.unmount();
  });
  it('records a risk-assessment to-do without inventing assessment findings', async () => {
    const wrapper = mount(NarrivaInlineFinding, { props: { checkId: 'risk_safety', finding: { id: 'risk_safety:assessment', action: 'risk_assessment' } } });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply')[0]).toEqual([{ riskAssessmentIncluded: true }]);
    expect(wrapper.text()).not.toContain('Low Risk');
    wrapper.unmount();
  });
  it('updates the virtual location in one field and requires a setting outside home', async () => {
    const wrapper = mount(NarrivaInlineFinding, { props: { finding: { id: 'encounter_consent:location', action: 'encounter' }, context: { dateOfService: '2026-11-17', location: { locationSelection: '__telehealth_video__', locationLabel: 'Telehealth', placeOfService: '02', modality: 'video' } } } });
    expect(wrapper.get('button').element.disabled).toBe(true);
    expect(wrapper.findAll('input[maxlength="300"]')).toHaveLength(1);
    await wrapper.get('input[maxlength="300"]').setValue('Private room at school');
    expect(wrapper.get('button').element.disabled).toBe(false);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply')[0][0]).toMatchObject({ clientLocationDescription: 'Private room at school', location: { placeOfService: '02', modality: 'video' } });
    wrapper.unmount();
  });
  it('accepts actual response details without supplying a canned clinical answer', async () => {
    const wrapper = mount(NarrivaInlineFinding, { props: { checkId: 'participation_plan', finding: { id: 'participation_plan:responseDocumented', action: 'edit_note' } } });
    expect(wrapper.get('textarea').element.value).toBe('');
    await wrapper.get('textarea').setValue('Client practiced the skill twice and reported less tension.');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply')[0][0].clarification).toContain('Client practiced the skill twice');
    wrapper.unmount();
  });
  it('shows reviewed draft quality without granting Quick Sign before finalization', () => {
    const wrapper = mount(NarrivaCompliancePanel, { props: { preGeneration: true, review: { id: 51, phase: 'pre_generation', status: 'passed', checks: NARRIVA_CHECKS.map(check => ({ ...check, status: 'passed', findings: [] })), quickSignEligible: false } }, slots: { generate: '<button>Generate note</button>' } });
    expect(wrapper.find('.narriva-score').exists()).toBe(true);
    expect(wrapper.text()).toContain('ready to finalize');
    expect(wrapper.text()).toContain('Generate note');
    expect(wrapper.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

it('requires an actual ICD search selection and provider justification before confirming clinical context', async () => {
  vi.useFakeTimers();
  const diagnosisSearch = vi.fn(async () => ({ data: { items: [{ code: 'F41.1', description: 'Generalized anxiety disorder' }] } }));
  const context = { agencyId: 7, credentialTier: 'intern_plus', diagnosisMode: 'full', dateOfService: '2026-11-06', diagnoses: [{ icd10_code: 'F43.9', justification: 'Existing documented context.' }] };
  const wrapper = mount(NarrivaInlineFinding, { props: { finding: { id: 'necessity_interventions:diagnosis', action: 'clinical_context' }, context, diagnosisSearch } });
  try {
    await wrapper.get('[role=combobox]').setValue('F41.1');
    await wrapper.get('textarea').setValue('Provider documented the current symptom duration and functional impairment.');
    expect(wrapper.findAll('button').find(button => button.text().includes('Confirm diagnosis')).element.disabled).toBe(true);
    await wrapper.get('form').trigger('submit'); expect(wrapper.emitted('apply')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(250); await flushPromises();
    expect(diagnosisSearch).toHaveBeenCalledWith({ agencyId: 7, query: 'F41.1', dateOfService: '2026-11-06' }, expect.any(Object));
    await wrapper.get('[role=combobox]').trigger('keydown', { key: 'ArrowDown' });
    await wrapper.get('[role=combobox]').trigger('keydown', { key: 'Enter' });
    await wrapper.get('textarea').setValue('Provider documented the current symptom duration and functional impairment.');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('apply')[0][0]).toEqual({ diagnosis: { icd10_code: 'F41.1', description: 'Generalized anxiety disorder', justification: 'Provider documented the current symptom duration and functional impairment.' } });
    expect(context.diagnoses).toHaveLength(1);
  } finally { wrapper.unmount(); vi.useRealTimers(); }
});
it('puts a typed presenting problem in structured session context rather than a narrative-only clarification', async () => {
  const wrapper = mount(NarrivaInlineFinding, { props: { finding: { id: 'necessity_interventions:presenting', action: 'clinical_context' }, context: {} } });
  expect(wrapper.get('button').element.disabled).toBe(true);
  await wrapper.get('form').trigger('submit'); expect(wrapper.emitted('apply')).toBeUndefined();
  await wrapper.get('textarea').setValue('Recent worry has disrupted sleep and school participation.');
  await wrapper.get('form').trigger('submit');
  expect(wrapper.emitted('apply')[0][0]).toEqual({ presentingProblem: 'Recent worry has disrupted sleep and school participation.' });
  wrapper.unmount();
});

it('keeps chart-only diagnosis context read-only and filters bachelor selections to Z/R codes', async () => {
  for (const [diagnosisMode, credentialTier] of [['chart', 'bachelors'], ['none', 'intern_plus'], ['zr_only', 'unknown']]) {
    const chart = mount(NarrivaInlineFinding, { props: { finding: { id: 'necessity_interventions:diagnosis', action: 'clinical_context' }, context: { diagnosisMode, credentialTier, diagnoses: [{ code: 'F41.1' }] } } });
    expect(chart.find('[role=combobox]').exists()).toBe(false); await chart.get('form').trigger('submit'); expect(chart.emitted('apply')).toBeUndefined(); chart.unmount();
  }
  vi.useFakeTimers();
  const wrapper = mount(NarrivaInlineFinding, { props: { finding: { id: 'necessity_interventions:diagnosis', action: 'clinical_context' }, context: { agencyId: 7, diagnosisMode: 'full', credentialTier: 'bachelors' }, diagnosisSearch: async () => ({ data: { items: [{ code: 'F41.1', description: 'Generalized anxiety disorder' }, { code: 'Z63.9', description: 'Problem related to primary support group' }] } }) } });
  try {
    await wrapper.get('[role=combobox]').setValue('problem'); await vi.advanceTimersByTimeAsync(250); await flushPromises();
    expect(wrapper.get('[role=listbox]').text()).toContain('Z63.9'); expect(wrapper.get('[role=listbox]').text()).not.toContain('F41.1');
    await wrapper.get('[role=combobox]').trigger('keydown', { key: 'ArrowDown' }); await wrapper.get('[role=combobox]').trigger('keydown', { key: 'Enter' });
    await wrapper.get('textarea').setValue('Provider documented the family-support concern and impact.'); await wrapper.get('form').trigger('submit'); expect(wrapper.emitted('apply')[0][0].diagnosis.icd10_code).toBe('Z63.9');
  } finally { wrapper.unmount(); vi.useRealTimers(); }
});
