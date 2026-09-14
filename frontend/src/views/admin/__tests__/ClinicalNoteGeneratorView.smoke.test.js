import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, shallowMount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import api from '../../../services/api';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async (_url, body) => ({ data: { items: body?.items || [] } })),
    delete: vi.fn(async () => ({ data: {} }))
  }
}));

vi.mock('../../../store/agency', () => ({
  useAgencyStore: () => ({
    currentAgency: { id: 7, name: 'ITSCO', feature_flags: { noteAidEnabled: true, clinicalNoteGeneratorEnabled: true } },
    currentAgencyId: 7,
    selectedAgencyId: 7,
    userAgencies: [{ id: 7, name: 'ITSCO', feature_flags: { noteAidEnabled: true, medicalBillingEnabled: true } }],
    agencies: [{ id: 7, name: 'ITSCO' }]
  })
}));

vi.mock('../../../store/auth', () => ({
  useAuthStore: () => ({
    user: { id: 501, role: 'admin', first_name: 'Test', last_name: 'User' },
    isAuthenticated: true
  })
}));

describe('ClinicalNoteGeneratorView smoke', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(api.post).mockReset().mockResolvedValue({ data: {} });
    vi.mocked(api.get).mockReset().mockResolvedValue({ data: {} });
  });

  async function workspace(aid = 'psychotherapy') {
    const View = (await import('../ClinicalNoteGeneratorView.vue')).default;
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/note-aid', component: View }] });
    await router.push('/note-aid');
    const wrapper = shallowMount(View, { global: { plugins: [router, createPinia()] } });
    await flushPromises();
    const state = wrapper.vm.$.setupState;
    state.derivedTier = 'intern_plus';
    state.selectedAidId = aid;
    state.selectedServiceCode = aid === 'psychotherapy' ? '90834' : '';
    await nextTick();
    return { wrapper, state };
  }

  it('edits projected time with a dropdown and synchronizes only that goal’s objective deadlines', async () => {
    const { wrapper, state } = await workspace('90791_intake_plan');
    state.initials = 'TEST';
    state.outputObj = { sections: {
      'Goal 1': 'Improve coping.', 'Objective 1.1': 'Within 3 months, practice coping 4 days weekly.',
      'Objective 1.2': 'Within 3 months, improve emotional regulation.', 'Projected Time 1': '4 months',
      'Goal 2': 'Improve communication.', 'Objective 2.1': 'Within 6 months, practice communication.', 'Projected Time 2': '6 months'
    }, meta: { toolId: 'clinical_90791_intake_plan' } };
    await nextTick();
    state.toggleSectionEdit('Projected Time 1');
    await nextTick();
    const select = wrapper.find('select[aria-label="Projected Time 1 completion timeframe"]');
    expect(select.exists()).toBe(true);
    expect(select.findAll('option').map((o) => o.text())).toContain('2 months');
    expect(select.findAll('option').map((o) => o.text())).toContain('8 months');
    await select.setValue('8');
    expect(state.sectionOverrides['Projected Time 1']).toBe('8 months');
    expect(state.sectionOverrides['Objective 1.1']).toBe('Within 8 months, practice coping 4 days weekly.');
    expect(state.sectionOverrides['Objective 1.2']).toContain('Within 8 months');
    expect(state.sectionOverrides['Objective 2.1']).toBeUndefined();
    expect(Object.fromEntries(state.mergedSectionEntries)['Projected Time 1']).toBe('8 months');
    wrapper.unmount();
  });

  it('integrates regenerated intake fields, applies diagnoses, and restores reviewed assessments from a draft', async () => {
    const { wrapper, state } = await workspace('90791_intake_plan');
    state.selectedClientId = 202;
    state.selectedClient = { id: 202, agency_id: 7 };
    await flushPromises();
    state.draftId = 42;
    state.chartDiagnoses = [{ id: 10, icd10_code: 'F41.1', is_primary: 1, justification: 'Old formulation.' }];
    state.latestTreatmentPlan = { id: 4, primary_diagnosis_id: 10, diagnostic_justification: 'Old formulation.' };
    state.outputObj = { sections: {
      Diagnosis: 'F42.9 Updated synthetic diagnosis\nZ63.4 Synthetic context',
      'Diagnostic Justification': 'Updated formulation.',
      'Mental Status Examination': 'General Appearance: Appropriate\nMood: Euthymic\nOrientation: X3: Person, Place, and Time',
      'Risk Assessment': 'Patient denies all areas of risk. No contrary clinical indications present.',
      'Goal 1': 'Improve coping.', 'Objective 1.1': 'The current baseline is a 4, with a target of 8.',
      'Projected Time 1': '6 months', 'Discharge Plan': 'Sustained independent coping.'
    }, meta: { toolId: 'clinical_90791_intake_plan' } };
    await nextTick();
    expect(state.structuredChartDiagnoses.map((d) => d.icd10_code)).toEqual(['F42.9', 'Z63.4']);
    expect(state.chartDiagnosticJustification).toBe('Updated formulation.');
    expect(state.primaryChartDiagnosis.icd10_code).toBe('F42.9');
    expect(state.chartMentalStatus.domains.Appearance.option).toBe('Appropriate');
    expect(state.chartRiskAssessment.patientDeniesAll).toBe(true);
    expect(state.intakeDiagnosesPending).toBe(true);
    state.dateOfService = '2026-08-20';
    await state.saveTreatmentPlanToChart();
    expect(state.showPlanImportReview).toBe(true);
    expect(state.planImportReviewMode).toBe('generated');
    expect(state.planDraftInitialPlan.goals[0].objectives[0]).toMatchObject({ scaleCurrent: 4, scaleTarget: 8 });
    expect(state.planDraftInitialPlan.diagnoses[0].icd10Code).toBe('F42.9');
    expect(state.scoreChartPlan({ id: 12, status: 'active', source_tool_id: 'note_aid_intake_generated' })).toBeGreaterThan(state.scoreChartPlan({ id: 11, status: 'active', source_tool_id: 'note_aid_plan_import' }));
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url === '/medical-billing/diagnoses')).toBe(false);
    vi.mocked(api.post).mockImplementation(async (url, body) => ({ data: url === '/medical-billing/diagnoses' ? { id: body.icd10Code === 'F42.9' ? 11 : 12 } : {} }));
    await state.applyIntakeDiagnosesToChart();
    expect(state.primaryChartDiagnosis.id).toBe(11);
    expect(state.intakeDiagnosesPending).toBe(false);
    const savedDx = vi.mocked(api.post).mock.calls.filter(([url]) => url === '/medical-billing/diagnoses');
    expect(savedDx[0][1]).toMatchObject({ clientId: 202, agencyId: 7, icd10Code: 'F42.9', isPrimary: true, justification: 'Updated formulation.' });
    state.chartMentalStatus.domains.Mood = { status: 'selected', option: 'Anxious', detail: '' };
    const persisted = JSON.parse(JSON.stringify({ ...state.outputObj, meta: { ...state.outputObj.meta, structuredChart: state.draftStructuredChart() } }));
    const signed = JSON.parse(state.buildApprovedPayloadText());
    expect(signed.sections['Mental Status Examination']).toContain('Mood: Anxious');
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/clients/202' ? { id: 202, agency_id: 7 } : {} }));
    await state.loadDraftIntoWorkspace({ id: 42, client_id: 202, agency_id: 7, service_code: '90791', output_json: persisted });
    expect(state.chartMentalStatus.domains.Mood.option).toBe('Anxious');
    expect(state.chartRiskAssessment.patientDeniesAll).toBe(true);
    expect(state.primaryChartDiagnosis.id).toBe(11);
    await state.loadDraftIntoWorkspace({ id: 43, client_id: 202, agency_id: 7, service_code: '90791', output_json: null });
    expect(state.chartMentalStatus.domains.Mood.option).toBe('');
    expect(state.intakeDiagnosisRecommendations).toEqual([]);
    expect(state.showPlanImportReview).toBe(false);
    expect(state.planDraftInitialPlan).toBeNull();
    wrapper.unmount();
  });



  it('ignores a slow previous draft load when another client draft is selected', async () => {
    const { wrapper, state } = await workspace();
    let release;
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/clients/101') return new Promise((resolve) => { release = resolve; });
      if (url === '/clients/202') return { data: { id: 202, agency_id: 7, initials: 'NEW', full_name: 'New synthetic client' } };
      return { data: {} };
    });
    const oldLoad = state.loadDraftIntoWorkspace({ id: 1, client_id: 101, agency_id: 7, service_code: '90834', input_text: 'Old client content.', output_json: null });
    await nextTick();
    const newLoad = state.loadDraftIntoWorkspace({ id: 2, client_id: 202, agency_id: 7, service_code: '90834', input_text: 'New client content.', output_json: null });
    await newLoad;
    release({ data: { id: 101, agency_id: 7, full_name: 'Old synthetic client' } });
    await oldLoad;
    expect(state.draftId).toBe(2);
    expect(state.selectedClientId).toBe(202);
    expect(state.inputText).toBe('New client content.');
    expect(state.selectedClient.full_name).toBe('New synthetic client');
    wrapper.unmount();
  });

  it('opens required renewal without changing the current progress note or session code', async () => {
    const { wrapper, state } = await workspace();
    state.selectedClientId = 202;
    state.selectedClient = { id: 202, agency_id: 7 };
    state.draftId = 42;
    state.inputText = 'Unsaved progress note content.';
    state.latestTreatmentPlan = { id: 81, agency_id: 7, client_id: 202, status: 'active', effective_date: '2020-01-01', goals: [{ id: 1, goal_text: 'A goal', objectives: [{ id: 2, objective_text: 'An objective' }] }] };
    await state.openRequiredRenewal();
    expect(state.showPlanImportReview).toBe(true);
    expect(state.planDraftEditorId).toBe(81);
    expect(state.planUpdaterRenewalReason).toContain('Required renewal');
    expect(state.inputText).toBe('Unsaved progress note content.');
    expect(state.selectedServiceCode).toBe('90834');
    expect(state.draftId).toBe(42);
    expect(state.progressPlanIsCurrent).toBe(false);
    wrapper.unmount();
  });

  it('offers objective interventions to manual progress writers', async () => {
    const { wrapper, state } = await workspace();
    state.latestTreatmentPlan = { goals: [{ goal_text: 'Goal', objectives: [{ objective_text: 'Objective', interventions: ['Communication rehearsal'] }] }] };
    expect(state.csProposedInterventions).toContain('Communication rehearsal');
    state.sectionOverrides.Interventions = 'Write this section…';
    state.toggleManualIntervention('Communication rehearsal', true);
    expect(state.sectionOverrides.Interventions).toBe('Communication rehearsal');
    state.toggleManualIntervention('Communication rehearsal', false);
    expect(state.sectionOverrides.Interventions).toBe('');
    wrapper.unmount();
  });

  it('removes untouched manual intake sections when manual mode is deselected', async () => {
    const { wrapper, state } = await workspace('90791_intake_plan');
    state.noteAidAllowManualWrite = true;
    state.skipAiAid = true;
    await flushPromises();
    expect(state.displayPanels.some((panel) => panel.id === 'Risk Assessment')).toBe(true);
    expect(state.sectionEditing['Presenting Problem']).toBe(true);
    state.sectionOverrides.Identification = '   ';
    state.skipAiAid = false;
    await flushPromises();
    expect(state.outputObj).toBeNull();
    expect(state.displayPanels).toEqual([]);
    wrapper.unmount();
  });

  it('preserves typed manual sections and removes only blank ones', async () => {
    const { wrapper, state } = await workspace('90791_intake_plan');
    state.noteAidAllowManualWrite = true;
    state.skipAiAid = true;
    await flushPromises();
    state.sectionOverrides['Presenting Problem'] = 'Clinician entered the current presenting concern.';
    state.sectionOverrides['Medical History'] = '';
    state.skipAiAid = false;
    await flushPromises();
    expect(state.outputObj.sections).toEqual({ 'Presenting Problem': 'Clinician entered the current presenting concern.' });
    state.skipAiAid = true;
    await flushPromises();
    expect(state.sectionOverrides['Presenting Problem']).toBe('Clinician entered the current presenting concern.');
    wrapper.unmount();
  });

  it('preserves generated content and unsaved edits through a manual mode round trip', async () => {
    const { wrapper, state } = await workspace();
    state.outputObj = { sections: { Subjective: 'Generated subjective.', Objective: 'Generated objective.' }, meta: {} };
    await nextTick();
    state.sectionOverrides.Objective = 'Edited observation.';
    state.noteAidAllowManualWrite = true;
    state.skipAiAid = true;
    await flushPromises();
    state.skipAiAid = false;
    await flushPromises();
    expect(state.outputObj.sections).toEqual({ Subjective: 'Generated subjective.', Objective: 'Edited observation.' });
    wrapper.unmount();
  });

  it('adds late interactive complexity to Objective without replacing edited sections', async () => {
    const { wrapper, state } = await workspace();
    state.outputObj = { sections: { Subjective: 'Original subjective.', Objective: 'Original objective.', Interventions: 'Reflection', Plan: 'Original plan.' }, meta: {} };
    await nextTick();
    state.sectionOverrides.Subjective = 'Clinician edited subjective.';
    state.sectionOverrides.Objective = 'Clinician edited objective.';
    state.includeInteractiveComplexity = true;
    state.onInteractiveComplexityChange();
    expect(state.interactiveComplexityPromptOpen).toBe(true);
    expect(state.canConfirmAndSign).toBe(false);
    state.interactiveComplexityReason = 'Communication required repeated redirection.';
    vi.mocked(api.post).mockResolvedValue({ data: { sentence: 'Repeated redirection supported therapeutic communication.' } });
    await state.addInteractiveComplexitySentence();
    expect(state.sectionOverrides.Objective).toBe('Clinician edited objective. Repeated redirection supported therapeutic communication.');
    expect(state.sectionOverrides.Subjective).toBe('Clinician edited subjective.');
    expect(state.outputObj.sections.Plan).toBe('Original plan.');
    expect(state.interactiveComplexityPromptOpen).toBe(false);
    expect(state.attestAiContentReviewed).toBe(false);
    wrapper.unmount();
  });

  it('leaves justification pending after an AI error and allows cancelling the add-on', async () => {
    const { wrapper, state } = await workspace();
    state.outputObj = { sections: { Objective: 'Existing text.' }, meta: {} };
    await nextTick();
    state.includeInteractiveComplexity = true;
    state.onInteractiveComplexityChange();
    state.interactiveComplexityReason = 'Communication complication.';
    vi.mocked(api.post).mockRejectedValue(new Error('AI unavailable'));
    await state.addInteractiveComplexitySentence();
    expect(state.interactiveComplexityPromptOpen).toBe(true);
    expect(state.interactiveComplexityError).toContain('AI unavailable');
    expect(state.outputObj.sections.Objective).toBe('Existing text.');
    state.cancelInteractiveComplexity();
    expect(state.includeInteractiveComplexity).toBe(false);
    expect(state.billingAddons.some((addon) => addon.code === '90785')).toBe(false);
    wrapper.unmount();
  });

  it('restores extended encounter units and deferred termination choices from a draft', async () => {
    const { wrapper, state } = await workspace();
    await state.loadDraftIntoWorkspace({
      id: 55, agency_id: 7, service_code: '90834', initials: 'TC', date_of_service: '2026-09-14',
      output_json: { sections: { Subjective: 'Client report.', Objective: 'Observed response.' }, meta: {
        toolId: 'clinical_psychotherapy_note', billingPrimaryUnits: 2,
        sessionContext: { durationMinutes: 80 }, treatmentRecommendation: 'terminate',
        terminationNextStep: 'later', terminationTodoKey: 'termination_for_draft_55'
      } }
    });
    await nextTick();
    expect(state.actualServiceCode).toBe('90834');
    expect(state.billingPrimaryUnits).toBe(2);
    expect(state.sessionDurationMinutes).toBeGreaterThanOrEqual(75);
    expect(state.noteTreatmentRecommendation).toBe('terminate');
    expect(state.terminationNextStep).toBe('later');
    expect(state.terminationTodoKey).toBe('termination_for_draft_55');
    wrapper.unmount();
  });

  it('uses the termination structure and provider recommendation, without frequency requirements', async () => {
    const { wrapper, state } = await workspace('termination');
    state.seedManualEmptySections();
    await nextTick();
    expect(state.canConfirmAndSign).toBe(false);
    expect(Object.keys(state.outputObj.sections)).toEqual(['Reason for Termination', 'Treatment Modality and Interventions', 'Treatment Goals and Outcome', 'Recommendations']);
    state.terminationReason = 'goals_achieved';
    state.onTerminationReasonChange();
    expect(state.terminationRecommendation).toContain('presenting problem returns');
    state.sectionOverrides['Treatment Modality and Interventions'] = 'CBT was applied throughout treatment.';
    state.sectionOverrides['Treatment Goals and Outcome'] = 'The documented goals and objectives were achieved.';
    state.planFrequencyBaseline = 'Weekly';
    state.notePrescribedFrequency = '';
    expect(state.showProgressPlanFields).toBe(false);
    expect(state.canConfirmAndSign).toBe(true);
    const approved = JSON.parse(state.buildApprovedPayloadText());
    expect(approved.sections['Reason for Termination']).toBe('Treatment goals achieved');
    expect(approved.sections.Recommendations).toBe(state.terminationRecommendation);
    state.terminationReason = 'transfer';
    state.onTerminationReasonChange();
    expect(state.terminationRecommendation).toBe('');
    expect(state.canConfirmAndSign).toBe(false);
    wrapper.unmount();
  });

  it('creates a deferred termination to-do immediately', async () => {
    const { wrapper, state } = await workspace();
    state.selectedClientId = 22;
    state.selectedClient = { id: 22, agency_id: 7, full_name: 'Test Client' };
    await flushPromises();
    state.terminationNextStep = 'later';
    vi.mocked(api.post).mockImplementation(async (url, body) => ({ data: url === '/clinical-notes/work-queue' ? { items: body.items } : {} }));
    await state.onTerminationNextStepChange();
    const call = vi.mocked(api.post).mock.calls.find(([url]) => url === '/clinical-notes/work-queue');
    expect(call).toBeTruthy();
    expect(call[1].items[0]).toMatchObject({ clientId: 22, agencyId: 7, noteKind: 'termination', status: 'not_started' });
    expect(state.workQueueItems.some((item) => item.noteKind === 'termination')).toBe(true);
    expect(state.terminationTodoKey).toBeTruthy();
    wrapper.unmount();
  });

  it('signs termination as a non-billable chart note with content review', async () => {
    const { wrapper, state } = await workspace('termination');
    state.selectedClientId = 22;
    state.selectedClient = { id: 22, agency_id: 7 };
    await flushPromises();
    state.sessionClinicalSessionId = 9;
    state.terminationReason = 'goals_achieved';
    state.terminationRecommendation = 'Return if the presenting problem recurs.';
    state.outputObj = {
      sections: { 'Reason for Termination': 'Treatment goals achieved', 'Treatment Modality and Interventions': 'CBT and skills practice.', 'Treatment Goals and Outcome': 'Goal 1 achieved, as documented by objective ratings.', Recommendations: 'Return if needed.' },
      meta: { toolId: 'clinical_termination', manualSections: true }
    };
    await nextTick();
    state.attestAccurateAndComplete = true;
    state.attestMedicallyNecessary = true;
    vi.mocked(api.post).mockImplementation(async (url) => ({ data: url.endsWith('/notes') ? { note: { id: 77, content_review_status: 'passed' } } : { ok: true } }));
    await state.approveNoteOutput({ afterSign: 'close' });
    const create = vi.mocked(api.post).mock.calls.find(([url]) => url === '/clinical-data/sessions/9/notes');
    expect(create?.[1]).toMatchObject({ noteType: 'TERMINATION', serviceCode: null, metadata: { termination: { reason: 'goals_achieved' }, prescribedFrequency: null } });
    const sign = vi.mocked(api.post).mock.calls.find(([url]) => url === '/medical-billing/notes/77/sign');
    expect(sign?.[1]).toMatchObject({ accurateAndComplete: true, medicalNecessityAttested: false, contentReviewConfirmed: true });
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url === '/medical-billing/claims')).toBe(false);
    wrapper.unmount();
  });

  it('hides progress frequency on termination and opens the returned termination to-do after signing', async () => {
    const { wrapper, state } = await workspace('h0004_note');
    state.selectedClientId = 22;
    state.selectedClient = { id: 22, agency_id: 7 };
    await flushPromises();
    state.sessionClinicalSessionId = 9;
    state.outputObj = { sections: { Subjective: 'Client report.', Objective: 'Session observations.', Interventions: 'Skills practice', Plan: 'Terminate treatment.' }, meta: { manualSections: true } };
    await nextTick();
    state.noteTreatmentRecommendation = 'terminate';
    state.planFrequencyBaseline = 'Weekly';
    state.notePrescribedFrequency = '';
    expect(state.canConfirmAndSign).toBe(false);
    state.terminationNextStep = 'after_progress';
    expect(state.canConfirmAndSign).toBe(true);
    state.attestAccurateAndComplete = true;
    state.attestMedicallyNecessary = true;
    await nextTick();
    expect(wrapper.find('.na-plan-fields__freq').exists()).toBe(false);
    const todo = { id: 'termination_after_note_77', clientId: 22, agencyId: 7, noteKind: 'termination', status: 'not_started' };
    vi.mocked(api.post).mockImplementation(async (url) => ({ data: url.endsWith('/notes') ? { note: { id: 77 } } : url.endsWith('/sign') ? { terminationTodo: todo } : {} }));
    await state.approveNoteOutput({ afterSign: 'close' });
    expect(state.selectedAidId).toBe('termination');
    expect(state.activeWorkQueueItemId).toBe(todo.id);
    expect(state.approvalMessage).toContain('Progress note signed');
    wrapper.unmount();
  });

  it('mounts without throwing', async () => {
    const ClinicalNoteGeneratorView = (await import('../ClinicalNoteGeneratorView.vue')).default;
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/note-aid', component: ClinicalNoteGeneratorView }]
    });
    await router.push('/note-aid');
    await router.isReady();

    let captured = null;
    const wrapper = mount(ClinicalNoteGeneratorView, {
      global: {
        plugins: [router, createPinia()],
        stubs: {
          Teleport: true,
          RouterLink: true,
          ClinicalArtifactRetentionPanel: true,
          NoteAidLibraryPanel: true,
          ClinicalNoteLibrarySidebar: true,
          ClinicalNoteDetailFetcher: true,
          NoteAidTreatmentSummaryPanel: true,
          NoteAidStartPage: true,
          NoteAidQuickSessionBar: true,
          NoteAidClientPicker: true,
          NoteAidObjectiveRatings: true,
          NoteAidClientContextPanel: true,
          NoteAidCsNoteBuildPanel: true,
          NoteAidCreateClientModal: true,
          NoteAidClientSetupDrawer: true,
          NoteAidDocumentationQueue: true,
          NoteAidTreatmentPlanImportReview: true,
          NoteAidIntakeImportReview: true,
          NoteAidIntakeDraftEditor: true,
          NoteAidDemographicsImportReview: true,
          NoteAidWorkQueuePanel: true,
          NoteAidTodoListImportModal: true,
          NoteAidDiagnosisWriterModal: true,
          NoteAidTreatmentPlanStandaloneModal: true,
          NoteAidSessionContextStrip: true,
          NoteAidStructuredChartPanel: true
        },
        config: {
          errorHandler(err) {
            captured = err;
          }
        }
      }
    });
    await flushPromises();
    if (captured) {
      console.error('captured', captured);
      throw captured;
    }
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).toMatch(/Note Aid|Not available|AI Note/i);
  });
});
