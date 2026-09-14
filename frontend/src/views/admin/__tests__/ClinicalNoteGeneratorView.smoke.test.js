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
    userAgencies: [{ id: 7, name: 'ITSCO', feature_flags: { noteAidEnabled: true } }],
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
