import { webcrypto } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { mount, shallowMount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import api from '../../../services/api';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { clinicalWorkspaceActive } from '../../../composables/useClinicalWorkspace.js';
import { INTAKE_SECTION_TITLES } from '../../../../../backend/src/config/clinicalNotePlanOutput.js';
import { parseNoteSections } from '../../../../../backend/src/services/clinicalNoteSections.service.js';

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
    currentAgency: { id: 7, name: 'ITSCO', organization_type: 'agency', feature_flags: { noteAidEnabled: true, clinicalNoteGeneratorEnabled: true } },
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
  let View;
  // Compile this large SFC once before timing individual behavioral assertions.
  beforeAll(async () => { View = (await import('../ClinicalNoteGeneratorView.vue')).default; }, 30000);
  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    setActivePinia(createPinia());
    vi.mocked(api.post).mockReset().mockResolvedValue({ data: {} });
    vi.mocked(api.get).mockReset().mockResolvedValue({ data: {} });
  });

  async function workspace(aid = 'psychotherapy', { realFrame = false, demoPresentation = null } = {}) {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/note-aid', component: View }] });
    await router.push('/note-aid');
    const wrapper = shallowMount(View, { props: { demoPresentation }, global: { plugins: [router, createPinia()], stubs: { ClinicalWorkspaceFrame: realFrame ? false : { template: '<section><slot /></section>' } } } });
    await flushPromises();
    const state = wrapper.vm.$.setupState;
    state.derivedTier = 'intern_plus';
    state.selectedAidId = aid;
    state.selectedServiceCode = aid === 'psychotherapy' ? '90834' : '';
    await nextTick();
    return { wrapper, state };
  }

  it('defaults to Manual, keeps source text across mode changes, and saves the chosen default per workspace', async () => {
    const { wrapper, state } = await workspace();
    expect(state.noteWriterMode).toBe('manual');
    expect(state.skipAiAid).toBe(true);
    state.inputText = 'Synthetic session narrative without identifying details.';
    state.noteWriterMode = 'narriva';
    await flushPromises();
    expect(state.inputText).toContain('Synthetic session narrative');
    expect(state.skipAiAid).toBe(false);
    await state.saveNarrivaDefault('narriva');
    expect(api.patch).toHaveBeenCalledWith('/narriva/preferences', {agencyId:7,defaultMode:'narriva'}, {skipGlobalLoading:true});
    expect(state.narrivaDefaultMode).toBe('narriva');
    expect(wrapper.find('.na-speak-stage').exists()).toBe(false);
    wrapper.unmount();
  });
  it('inherits the assigned encounter site and derives delivery without another routine selection, preserving saved edits',async()=>{
    const {wrapper,state}=await workspace();
    state.sessionLocationChoices=[{value:'Assigned office (POS 11)',name:'Assigned office',label:'Assigned office (POS 11)',serviceLocationId:8,billingOfficeLocationId:2,placeOfService:'11'}];
    state.inheritScheduledLocation({serviceLocationId:8,billingOfficeLocationId:2,placeOfService:'11',modality:'in_person'});
    expect(state.sessionLocationLabel).toBe('Assigned office (POS 11)');expect(state.narrivaContext().modality).toBe('in_person');
    state.sessionLocationModel={locationSelection:'__telehealth_video__',locationLabel:'Telehealth',placeOfService:'10',modality:'video',serviceLocationId:9,billingOfficeLocationId:2};
    state.inheritScheduledLocation({serviceLocationId:8,billingOfficeLocationId:2,placeOfService:'11',modality:'in_person'});
    expect(state.sessionLocationModel).toMatchObject({placeOfService:'10',modality:'video'});
    state.outputObj={sections:{Narrative:'Saved clinical evidence.'},meta:{sessionContext:{locationLabel:'Saved home visit',placeOfService:'12',serviceLocationId:12},narrivaContext:{modality:'in_person'}}};state.sessionLocationLabel='Saved home visit';state.sessionLocationChoices=[];
    expect(state.sessionLocationMetadata()).toMatchObject({placeOfService:'12',serviceLocationId:12});wrapper.unmount();
  });

  it('blocks identified names before sending Narriva generation without a generate-anyway bypass', async () => {
    const { wrapper, state } = await workspace();
    state.noteWriterMode = 'narriva';
    state.selectedClientId = 72;
    state.selectedClient = {id:72,agency_id:7,full_name:'Synthetic Identifyingname'};
    state.latestTreatmentPlan = {id:81,status:'active',effective_date:'2099-01-01',goals:[]};
    state.initials='SYN'; state.inputText='Synthetic Identifyingname practiced grounding skills.';
    await flushPromises();
    vi.mocked(api.post).mockClear();
    await state.generateNote();
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url === '/clinical-notes/generate')).toBe(false);
    wrapper.unmount();
  });

  it('saves a selected underlying clinical service without changing Pro Bono funding',async()=>{
    const {wrapper,state}=await workspace();state.eligibleServiceCodes=['90834','PRO-BONO SERVICE','99051'];state.otherServiceCode='PRO-BONO SERVICE';state.selectedServiceCode='__other__';state.inputText='An actual intervention and response were documented.';state.outputObj={sections:{Narrative:'Documented clinical session.'},meta:{}};state.narrivaUnderlyingServiceCode='90834';await nextTick();expect(state.narrivaUnderlyingOptions.map(item=>item.code)).toEqual(['90834']);vi.mocked(api.post).mockImplementation(async()=>({data:{draft:{id:66}}}));await state.autosave();const saved=vi.mocked(api.post).mock.calls.find(([url])=>url==='/clinical-notes/drafts');expect(saved).toBeTruthy();expect(saved[1]).toMatchObject({serviceCode:'PRO-BONO SERVICE',outputJson:{meta:{underlyingServiceCode:'90834',narrivaContext:{underlyingServiceCode:'90834'}}}});state.onNarrivaFindingAction({checkId:'service_code',finding:{action:'clinical_service'}});await nextTick();expect(state.configExpanded).toBe(true);expect(state.noteWizardStep).toBe(1);expect(state.actualServiceCode).toBe('PRO-BONO SERVICE');expect(state.narrivaUnderlyingServiceCode).toBe('90834');expect(vi.mocked(api.post).mock.calls.some(([url])=>url.endsWith('/service'))).toBe(false);wrapper.unmount();
  });

  it('requires explicit confirmation before changing the linked encounter service',async()=>{
    const {wrapper,state}=await workspace();state.inputText='Synthetic crisis documentation.';state.sessionClinicalSessionId=82;await nextTick();state.narrivaServiceSnapshot={id:82,serviceCode:'90834'};state.otherServiceCode='H2011';state.selectedServiceCode='__other__';await nextTick();expect(state.narrivaServicePending).toBe(true);vi.mocked(api.post).mockClear();await state.saveDraftNow();expect(api.post).not.toHaveBeenCalled();state.narrivaServiceReason='The unscheduled crisis required immediate intervention.';vi.mocked(api.post).mockImplementation(async url=>({data:url.endsWith('/service')?{session:{id:82,serviceCode:'H2011'},serviceCode:'H2011'}:{draft:{id:66}}}));await state.confirmNarrivaService();expect(api.post).toHaveBeenCalledWith('/narriva/sessions/82/service',expect.objectContaining({agencyId:7,serviceCode:'H2011',expectedOldServiceCode:'90834',confirmed:true,justification:'The unscheduled crisis required immediate intervention.'}),{skipGlobalLoading:true});expect(state.narrivaServicePending).toBe(false);wrapper.unmount();
  });

  it('rehydrates a pending encounter confirmation without automatically submitting it',async()=>{
    const {wrapper,state}=await workspace();const pending={expectedOldServiceCode:'90834',serviceCode:'H2011',justification:'Original crisis documentation confirmation.'};vi.mocked(api.get).mockImplementation(async url=>({data:url.endsWith('/narriva/sessions/82/service')?{session:{id:82,serviceCode:'H2011',pendingServiceChange:true},serviceCode:'H2011',pendingServiceChange:true,pendingConfirmation:pending}:{}}));state.sessionClinicalSessionId=82;await flushPromises();expect(state.narrivaPendingConfirmation).toEqual(pending);expect(state.narrivaServiceReason).toBe(pending.justification);expect(state.narrivaServicePending).toBe(true);expect(vi.mocked(api.post).mock.calls.some(([url])=>url.endsWith('/service'))).toBe(false);vi.mocked(api.post).mockImplementation(async url=>({data:url.endsWith('/service')?{session:{id:82,serviceCode:'H2011'},serviceCode:'H2011'}:{draft:{id:61}}}));await state.confirmNarrivaService();expect(api.post).toHaveBeenCalledWith('/narriva/sessions/82/service',expect.objectContaining({expectedOldServiceCode:'90834',serviceCode:'H2011',justification:pending.justification,confirmed:true}),{skipGlobalLoading:true});wrapper.unmount();
  });

  it('keeps the legacy guidance aid on the explicit service without asking AI to choose a billed code',async()=>{
    const {wrapper,state}=await workspace('code_decider');state.noteWriterMode='narriva';await nextTick();state.selectedServiceCode='90837';state.initials='SYN';state.dateOfService='2026-11-06';state.inputText='Synthetic intervention and response.';await nextTick();expect(state.generateBlockedReason).toBe('');expect(state.generateDisabled).toBe(false);vi.mocked(api.post).mockImplementation(async url=>({data:url==='/clinical-notes/generate'?{outputJson:{sections:{Narrative:'Synthetic generated note.'}}}:{}}));await state.generateNote();const request=vi.mocked(api.post).mock.calls.find(([url])=>url==='/clinical-notes/generate');expect(request).toBeTruthy();expect(request[1].get('autoSelectCode')).toBe('false');expect(request[1].get('serviceCode')).toBe('90837');expect(request[1].get('toolId')).toBeNull();wrapper.unmount();
  });

  it('generates Pro Bono documentation from the explicitly chosen clinical service while retaining its funding code',async()=>{
    const {wrapper,state}=await workspace('code_decider');state.noteWriterMode='narriva';await nextTick();state.otherServiceCode='PRO-BONO SERVICE';state.selectedServiceCode='__other__';state.narrivaUnderlyingServiceCode='90837';state.initials='SYN';state.dateOfService='2026-11-06';state.inputText='Synthetic intervention and response.';await nextTick();vi.mocked(api.post).mockImplementation(async url=>({data:url==='/clinical-notes/generate'?{outputJson:{sections:{Narrative:'Synthetic generated note.'}}}:{}}));await state.generateNote();const request=vi.mocked(api.post).mock.calls.find(([url])=>url==='/clinical-notes/generate');expect(request).toBeTruthy();expect(request[1].get('serviceCode')).toBe('PRO-BONO SERVICE');expect(request[1].get('underlyingServiceCode')).toBe('90837');expect(request[1].get('autoSelectCode')).toBe('false');wrapper.unmount();
  });

  it('cannot reintroduce morning, unverified or Pro Bono99051 through a toggle or schedule-seeded merge',async()=>{
    const {wrapper,state}=await workspace();state.sessionSourceTimezone='America/Denver';state.sessionScheduledStart='2026-11-09T14:30:00Z';state.scheduleSeededAddonCodes=['90785','99051'];state.includeAfterHours99051=true;await nextTick();state.applyBillingRulesForCurrentSession();expect(state.includeAfterHours99051).toBe(false);expect(state.billingAddons).toContainEqual({code:'90785',units:1});expect(state.billingAddons.some(item=>item.code==='99051')).toBe(false);expect(state.noteAidAddonMenuOptions.some(item=>item.code==='99051')).toBe(false);state.toggleManualAddonCode('99051');expect(state.includeAfterHours99051).toBe(false);
    state.sessionScheduledStart='2026-11-07T19:00:00Z';state.sessionSourceTimezone='';state.includeAfterHours99051=true;await nextTick();state.applyBillingRulesForCurrentSession();expect(state.billingAddons.some(item=>item.code==='99051')).toBe(false);
    state.sessionSourceTimezone='America/New_York';state.sessionScheduledStart='2026-11-09T22:00:00Z';await nextTick();state.applyBillingRulesForCurrentSession();expect(state.includeAfterHours99051).toBe(true);expect(state.billingAddons).toContainEqual({code:'99051',units:1});expect(state.showAfterHours99051Option).toBe(true);
    state.otherServiceCode='PRO-BONO SERVICE';state.selectedServiceCode='__other__';await nextTick();state.applyBillingRulesForCurrentSession();expect(state.includeAfterHours99051).toBe(false);expect(state.billingAddons.some(item=>item.code==='99051')).toBe(false);expect(state.showAfterHours99051Option).toBe(false);wrapper.unmount();
  });

  it('opens the dashboard notes landing page with the same AuricWell frame as a clinical client record', async () => {
    const { wrapper, state } = await workspace('', { realFrame: true });
    try {
      expect(state.selectedClient).toBeFalsy();
      expect(state.selectedAidId).toBe('');
      expect(wrapper.find('[data-workspace="auricwell"]').exists()).toBe(true);
      expect(wrapper.find('.clinical-workspace__product').text()).toContain('AuricWell');
      expect(wrapper.find('.clinical-workspace__tenant').text()).toBe('ITSCO');
      expect(wrapper.find('.clinical-workspace__back').text()).toContain('Back to app');
      expect(clinicalWorkspaceActive.value).toBe(true);

      // Changing to a tutoring note keeps the editor available and restores tenant chrome.
      state.selectedAidId = 'tpt_note';
      await nextTick();
      expect(state.canUseTool).toBe(true);
      expect(wrapper.find('[data-workspace="auricwell"]').exists()).toBe(false);
      expect(clinicalWorkspaceActive.value).toBe(false);
      state.selectedAidId = '';
      await nextTick();
      expect(clinicalWorkspaceActive.value).toBe(true);
    } finally {
      wrapper.unmount();
    }
    expect(clinicalWorkspaceActive.value).toBe(false);
  });

  it('keeps learning clients and tutoring aids tenant branded without disabling documentation', async () => {
    const { wrapper, state } = await workspace();
    state.selectedClient = { id: 71, client_type: 'learning' };
    await nextTick();
    expect(state.canUseTool).toBe(true);
    expect(state.clinicalWorkspaceBranding).toBe(false);
    state.selectedClient = { id: 72, client_type: 'clinical' };
    await nextTick();
    expect(state.clinicalWorkspaceBranding).toBe(true);
    state.selectedAidId = 'tpt_note';
    await nextTick();
    expect(state.clinicalWorkspaceBranding).toBe(false);
    expect(state.canUseTool).toBe(true);
    wrapper.unmount();
  });

  it('loads provider-scoped billing locations and preserves their IDs in the draft context', async () => {
    const { wrapper, state } = await workspace();
    state.sessionLocationLabel = 'Office';
    vi.mocked(api.get).mockResolvedValue({ data: { choices: [{ value: 'service:25', label: 'Assigned office (POS 11) — 100 Test St', aliases: ['Office'], serviceLocationId: 25, billingOfficeLocationId: 6, placeOfService: '11', address: '100 Test St' }] } });
    await state.loadSessionLocationChoices(7);
    expect(api.get).toHaveBeenLastCalledWith('/medical-billing/service-locations', { params: { agencyId: 7, forNoteAid: 1 }, skipGlobalLoading: true });
    expect(state.sessionLocationLabel).toBe('Assigned office (POS 11) — 100 Test St');
    expect(state.sessionLocationMetadata()).toMatchObject({ serviceLocationId: 25, billingOfficeLocationId: 6, placeOfService: '11', serviceAddress: '100 Test St' });
    wrapper.unmount();
  });

  it('ignores stale location responses after switching tenants', async () => {
    const { wrapper, state } = await workspace();
    let resolveOld;
    vi.mocked(api.get).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ data: { choices: [{ label: 'New tenant office', serviceLocationId: 42 }] } });
    const old = state.loadSessionLocationChoices(7);
    await state.loadSessionLocationChoices(8);
    resolveOld({ data: { choices: [{ label: 'Old tenant office' }] } });
    await old;
    expect(state.sessionLocationChoices.map(c => c.label)).toEqual(['New tenant office']);
    wrapper.unmount();
  });

  it('waits for a linked appointment before choosing a default duration', async () => {
    const {wrapper,state}=await workspace('psychotherapy');
    try {
      state.sessionClinicalSessionId=276;state.sessionDurationMinutes=null;
      state.sessionScheduledStart='';state.sessionScheduledEnd='';
      state.applySessionTimingDefaults();expect(state.sessionDurationMinutes).toBeNull();
      state.sessionScheduledStart='2026-11-10T18:30:00Z';state.sessionScheduledEnd='2026-11-10T19:00:00Z';state.sessionSourceTimezone='America/Denver';
      state.applySessionTimingDefaults();expect(state.sessionDurationMinutes).toBe(30);expect(state.sessionEndTimeLocal).toBe('12:00');
    } finally {wrapper.unmount();}
  });

  it('loads exact appointment timing in its saved timezone and preserves documented times', async () => {
    const { wrapper, state } = await workspace('90791_intake_plan');
    try {
      state.selectedServiceCode = '90791';
      state.sessionDurationMinutes = 60;
      state.draftId = 296;
      state.sessionClinicalSessionId = 192;
      state.sessionStartTimeLocal = '';
      state.sessionEndTimeLocal = '';
      state.onDraftAppointmentContext({ draftId: 296, clinicalSessionId: 192, appointmentId: 114,
        startAt: '2026-11-01 17:00:00', endAt: '2026-11-01 18:00:00', sourceTimezone: 'America/Denver', locationLabel: 'Telehealth' });
      expect(state.sessionAppointmentId).toBe(114);
      expect(state.sessionSourceTimezone).toBe('America/Denver');
      expect(state.sessionStartTimeLocal).toBe('10:00');
      expect(state.sessionEndTimeLocal).toBe('11:00');
      state.sessionStartTimeLocal = '10:05';
      state.onDraftAppointmentContext({ draftId: 296, clinicalSessionId: 192, appointmentId: 114,
        startAt: '2026-11-01T17:00:00Z', endAt: '2026-11-01T18:00:00Z', sourceTimezone: 'America/Denver' });
      expect(state.sessionStartTimeLocal).toBe('10:05');
      state.onDraftAppointmentContext({ draftId: 999, clinicalSessionId: 999, appointmentId: 777, sourceTimezone: 'America/New_York' });
      expect(state.sessionAppointmentId).toBe(114);
      expect(state.sessionSourceTimezone).toBe('America/Denver');
    } finally { wrapper.unmount(); }
  });

  it('opens booked work with its exact session and appointment without bootstrapping another encounter', async () => {
    const {wrapper,state}=await workspace('90791_intake_plan');
    try {
      const item={id:'booked_session_214',agencyId:7,clientId:2104,clientName:'Example client',clinicalSessionId:214,appointmentId:132,
        officeEventId:40,serviceCode:'90791',noteKind:'intake',date:'2026-09-05',timeLabel:'2:30 PM',sourceTimezone:'America/Denver',
        scheduledStart:'2026-09-05T20:30:00Z',scheduledEnd:'2026-09-05T21:30:00Z',durationMinutes:60,status:'not_started'};
      state.workQueueItems=[item];
      await state.activateWorkQueueItem(item);await flushPromises();
      expect(state.sessionClinicalSessionId).toBe(214);
      expect(state.sessionAppointmentId).toBe(132);
      expect(state.sessionSourceTimezone).toBe('America/Denver');
      expect(state.sessionStartTimeLocal).toBe('14:30');
      expect(api.post.mock.calls.some(([url])=>url==='/clinical-data/sessions/bootstrap')).toBe(false);
    } finally {wrapper.unmount();}
  });

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

  it('offers blank clinical assessments before generation without inventing normal findings', async () => {
    const { wrapper, state } = await workspace('90791_intake_plan');
    try {
      state.selectedClientId = 202;
      state.selectedClient = { id: 202, agency_id: 7 };
      state.noteWriterMode = 'narriva';
      await flushPromises();
      expect(state.outputObj).toBeNull();
      expect(state.showStructuredChartPanel).toBe(true);
      expect(wrapper.find('note-aid-structured-chart-panel-stub').exists()).toBe(true);
      expect(Object.values(state.chartMentalStatus.domains).every(domain => !domain.option)).toBe(true);
      expect(state.chartRiskAssessment.patientDeniesAll).not.toBe(true);
    } finally { wrapper.unmount(); }
  });

  it('integrates regenerated intake fields, applies diagnoses, and restores reviewed assessments from a draft', async () => {
    const { wrapper, state } = await workspace('90791_intake_plan');
    state.selectedClientId = 202;
    state.selectedClient = { id: 202, agency_id: 7 };
    await flushPromises();
    state.draftId = 42;
    state.chartDiagnoses = [{ id: 10, icd10_code: 'F41.1', is_primary: 1, justification: 'Old formulation.' }];
    state.latestTreatmentPlan = { id: 4, primary_diagnosis_id: 10, diagnostic_justification: 'Old formulation.', goals: [{ goal_text: 'Historical focus', objectives: [{ objective_text: 'Historical objective', interventions: ['Historical intervention'] }] }] };
    state.outputObj = { sections: {
      Diagnosis: 'F42.9 Updated synthetic diagnosis\nZ63.4 Synthetic context',
      'Diagnostic Justification': 'Updated formulation.',
      'Mental Status Examination': 'General Appearance: Appropriate\nMood: Euthymic\nOrientation: X3: Person, Place, and Time',
      'Risk Assessment': 'Patient denies all areas of risk. No contrary clinical indications present.',
      'Goal 1': 'Improve coping.', 'Objective 1.1': 'The current baseline is a 4, with a target of 8.',
      'Interventions 1.1': 'Mindfulness Training\nCognitive Refocusing',
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
    expect(state.planDraftInitialPlan.goals[0].objectives[0]).toMatchObject({ scaleCurrent: 4, scaleTarget: 8, interventions: ['Mindfulness Training', 'Cognitive Refocusing'] });
    expect(JSON.stringify(state.planDraftInitialPlan)).not.toContain('Historical');
    expect(state.planDraftInitialPlan.diagnoses[0].icd10Code).toBe('F42.9');
    expect(state.scoreChartPlan({ id: 12, status: 'active', source_tool_id: 'note_aid_intake_generated' })).toBeGreaterThan(state.scoreChartPlan({ id: 11, status: 'active', source_tool_id: 'note_aid_plan_import' }));
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url === '/medical-billing/diagnoses')).toBe(false);
    vi.mocked(api.post).mockImplementation(async (url, body) => ({ data: url === '/medical-billing/diagnoses' ? { id: body.icd10Code === 'F42.9' ? 11 : 12 } : {} }));
    await expect(state.applyIntakeDiagnosesToChart()).rejects.toThrow('Every diagnosis');
    state.intakeDiagnosisRecommendations[1].justification = 'Documented contextual support.';
    await state.applyIntakeDiagnosesToChart();
    expect(state.primaryChartDiagnosis.id).toBe(11);
    expect(state.intakeDiagnosesPending).toBe(false);
    const savedDx = vi.mocked(api.post).mock.calls.filter(([url]) => url === '/medical-billing/diagnoses');
    expect(savedDx[1][1].justification).toBe('Documented contextual support.');
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

  it.each(['tpt_note', 'h2014_individual', 'psychotherapy'])('generates an unlinked %s note without requiring a chart treatment plan', async (aid) => {
    const { wrapper, state } = await workspace(aid);
    state.noteWriterMode = 'narriva';
    await nextTick();
    state.initials = 'TEST';
    state.dateOfService = '2026-09-14';
    state.inputText = 'Practiced emotional regulation and positive self-talk during learning activities.';
    await nextTick();
    expect(state.isProgressAid).toBe(true);
    expect(state.effectiveClientId).toBeNull();
    expect(state.planOnFile).toBe(false);
    expect(state.canContinueToWriteStep).toBe(true);
    expect(state.generateDisabled).toBe(false);
    expect(state.generateBlockedReason).toBe('');
    vi.mocked(api.post).mockImplementation(async (url) => ({ data: url === '/clinical-notes/generate' ? { outputJson: { sections: { Subjective: 'Synthetic note.' } } } : {} }));
    await state.generateNote();
    const request = vi.mocked(api.post).mock.calls.find(([url]) => url === '/clinical-notes/generate');
    expect(request).toBeTruthy();
    expect(request[1].get('clientId')).toBeNull();
    expect(request[1].get('inputText')).toContain('emotional regulation');
    expect(state.outputObj.sections.Subjective).toBe('Synthetic note.');
    expect(state.narrivaComplianceRequired).toBe(false);
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url === '/narriva/reviews')).toBe(false);
    expect(wrapper.findComponent({ name: 'NarrivaCompliancePanel' }).exists()).toBe(false);
    expect(wrapper.text()).toContain('Narriva Compliance does not run on unlinked notes.');
    wrapper.unmount();
  });

  it('keeps unlinked saved drafts outside compliance and requires checks again when linked', async () => {
    const { wrapper, state } = await workspace('psychotherapy');
    state.draftId = 42;
    state.outputObj = { sections: { Subjective: 'Synthetic note.' } };
    await state.runNarrivaChecks();
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url === '/narriva/reviews')).toBe(false);
    state.selectedClientId = 101;
    state.progressEntryMode = 'unlinked';
    await nextTick();
    expect(state.narrivaComplianceRequired).toBe(true);
    state.selectedClientId = null;
    state.sessionClinicalSessionId = 202;
    await nextTick();
    expect(state.narrivaComplianceRequired).toBe(true);
    wrapper.unmount();
  });

  it('generates a full unlinked 90791 intake and plan with editable, individually copyable sections', async () => {
    const { wrapper, state } = await workspace('90791_intake_plan');
    state.noteWriterMode = 'narriva';
    await nextTick();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      state.initials = 'TEST';
      state.dateOfService = '2026-10-27';
      state.inputText = 'Synthetic intake history and clinician findings.';
      await nextTick();
      expect(state.effectiveClientId).toBeNull();
      expect(state.planOnFile).toBe(false);
      expect(state.canContinueToWriteStep).toBe(true);
      expect(state.generateDisabled).toBe(false);
      const text = INTAKE_SECTION_TITLES.map((title) => `${title}: Recorded ${title}.`).join('\n')
        + '\nGoal 1: Improve daily functioning.\nObjective 1.1: Practice coping skills.\nInterventions 1.1: Active Listening\nProjected Time 1: 3 months\nDischarge Plan: Sustained independent coping.';
      const sections = parseNoteSections(text, { intake: true });
      vi.mocked(api.post).mockImplementation(async (url) => ({ data: url === '/clinical-notes/generate'
        ? { draftId: 42, outputJson: { sections, meta: { toolId: 'clinical_90791_intake_plan' } } } : {} }));

      await state.generateNote();
      await nextTick();
      expect(state.generateError).toBe('');
      const request = vi.mocked(api.post).mock.calls.find(([url]) => url === '/clinical-notes/generate');
      expect(request[1].get('clientId')).toBeNull();
      expect(request[1].get('toolId')).toBe('clinical_90791_intake_plan');
      expect(request[1].get('serviceCode')).toBe('90791');
      expect(state.canApproveToClinicalRecord).toBeFalsy();
      for (const title of Object.keys(sections)) {
        expect(state.displayPanels.some((panel) => panel.id === title), title).toBe(true);
      }

      const cards = wrapper.findAll('.na-soap-card');
      expect(cards).toHaveLength(Object.keys(sections).length);
      for (const card of cards) {
        const body = card.find('pre').text();
        await card.findAll('button').find((button) => button.text() === 'Copy').trigger('click');
        await flushPromises();
        expect(writeText).toHaveBeenLastCalledWith(body);
      }
      const diagnosisCard = cards.find((card) => card.find('.na-soap-title').text() === 'Diagnosis');
      await diagnosisCard.findAll('button').find((button) => button.text() === 'Edit').trigger('click');
      await diagnosisCard.find('textarea').setValue('Clinician-reviewed diagnosis.');
      await diagnosisCard.findAll('button').find((button) => button.text() === 'Copy').trigger('click');
      await flushPromises();
      expect(writeText).toHaveBeenLastCalledWith('Clinician-reviewed diagnosis.');
      expect(vi.mocked(api.post).mock.calls.some(([url]) => url.startsWith('/medical-billing/'))).toBe(false);
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });

  it('still blocks linked progress notes with a missing or expired treatment plan', async () => {
    const { wrapper, state } = await workspace('tpt_note');
    state.noteWriterMode = 'narriva';
    await nextTick();
    state.selectedClientId = 202;
    state.selectedClient = { id: 202, agency_id: 7 };
    state.inputText = 'Synthetic session notes.';
    await flushPromises();
    expect(state.generateDisabled).toBe(true);
    expect(state.canContinueToWriteStep).toBe(false);
    expect(state.generateBlockedReason).toContain('Complete a treatment plan');
    await state.generateNote();
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url === '/clinical-notes/generate')).toBe(false);
    state.latestTreatmentPlan = { id: 81, status: 'active', effective_date: '2020-01-01', goals: [{ goal_text: 'Coping', objectives: [{ objective_text: 'Practice coping' }] }] };
    expect(state.generateDisabled).toBe(true);
    expect(state.generateBlockedReason).toContain('older than');
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
    state.noteWriterMode = 'narriva';
    await nextTick();
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

  it('keeps booked CPT and authored duration across draft reloads', async () => {
    const { wrapper, state } = await workspace();
    try {
      expect(state.resolveNoteTypeSelection('90834')).toBe('90834');
      await state.loadDraftIntoWorkspace({ id: 294, agency_id: 7, service_code: '90834', input_text: 'Taylor source is retained.' }, {
        preferredServiceCode: '90834', preferredScheduledStart: '2026-11-02T15:15:00Z', preferredScheduledEnd: '2026-11-02T16:00:00Z'
      });
      expect(state.actualServiceCode).toBe('90834');
      expect(state.sessionDurationMinutes).toBe(45);
      await state.loadDraftIntoWorkspace({ id: 295, agency_id: 7, service_code: '90834', input_text: 'Second authored source.', output_json: {
        sections: { Subjective: 'Authored narrative stays intact.' }, meta: { toolId: 'clinical_psychotherapy_note', sessionContext: {
          serviceCode: '90834', durationMinutes: 52, startTimeLocal: '12:00', endTimeLocal: '12:52'
        } }
      } }, { preferredServiceCode: '90837', preferredScheduledStart: '2026-11-05T19:00:00Z', preferredScheduledEnd: '2026-11-05T20:00:00Z' });
      await nextTick();
      expect(state.actualServiceCode).toBe('90834');
      expect(state.sessionDurationMinutes).toBe(52);
      expect(state.sessionEndTimeLocal).toBe('12:52');
      expect(state.inputText).toBe('Second authored source.');
      expect(state.outputObj.sections.Subjective).toBe('Authored narrative stays intact.');
      api.patch.mockClear();
      await state.autosave();
      expect(api.patch).not.toHaveBeenCalled();
      state.inputText = 'Second authored source with an additional reviewed observation.';
      await state.autosave();
      const saved = api.patch.mock.calls.find(([url]) => url === '/clinical-notes/drafts/295')[1];
      expect(saved).toMatchObject({ serviceCode: '90834', outputJson: { meta: { sessionContext: { serviceCode: '90834', durationMinutes: 52, startTimeLocal: '12:00', endTimeLocal: '12:52' } } } });
    } finally { wrapper.unmount(); }
  });

  it('keeps the public demo library visible and never autosaves fictional edits', async () => {
    const { wrapper, state } = await workspace('');
    try {
      await wrapper.setProps({ demoPresentation: { heading: 'Choose a fictional note', keepSidebarsOpen: true } });
      state.libraryCollapsed = false;
      state.workQueueCollapsed = false;
      state.draftId = 990131;
      state.inputText = 'Fictional edit must stay in the demo screen.';
      await nextTick();
      state.collapseSidebarsForNote();
      expect(state.libraryCollapsed).toBe(false);
      expect(state.workQueueCollapsed).toBe(false);
      api.post.mockClear(); api.patch.mockClear();
      await state.autosave();
      expect(api.post).not.toHaveBeenCalled();
      expect(api.patch).not.toHaveBeenCalled();
      expect(state.inputText).toContain('Fictional edit');
    } finally { wrapper.unmount(); }
  });

  it('loads fictional My Work before recent-note reconciliation without sending queue writes', async () => {
    const queue = [{ id: 'demo_work', clientId: 990121, draftId: 990131, status: 'started', docStatus: 'started' }];
    vi.mocked(api.get).mockImplementation(async path => ({ data: path === '/clinical-notes/work-queue'
      ? { items: queue } : path === '/clinical-notes/recent' ? { drafts: [{ id: 990131, client_id: 990121, status: 'draft', input_text: 'Fictional existing draft.' }], signedSessions: [] } : {} }));
    api.put.mockClear();
    const { wrapper, state } = await workspace('', { demoPresentation: { heading: 'Choose a fictional note', keepSidebarsOpen: true } });
    try {
      await flushPromises();
      expect(state.workQueueItems).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'demo_work', draftId: 990131, status: 'started' })]));
      expect(api.put).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it('asks before crossing a CPT band; No restores timing and Yes persists the chosen code', async () => {
    const { wrapper, state } = await workspace();
    try {
      await state.loadDraftIntoWorkspace({ id: 295, agency_id: 7, service_code: '90837', input_text: 'Preserve source.', output_json: { meta: { sessionContext: { serviceCode: '90837', durationMinutes: 60, startTimeLocal: '12:00', endTimeLocal: '13:00' } } } });
      state.sessionDurationMinutes = 55;
      await nextTick();
      expect(state.pendingDurationChange).toBeNull();
      expect(state.actualServiceCode).toBe('90837');
      state.sessionDurationMinutes = 52;
      await nextTick();
      expect(wrapper.find('[role="alertdialog"]').text()).toContain('90834');
      expect(state.actualServiceCode).toBe('90837');
      api.patch.mockClear();
      await state.autosave();
      expect(api.patch).not.toHaveBeenCalled();
      state.decideDurationCodeChange(false);
      await nextTick();
      expect(state.sessionDurationMinutes).toBe(55);
      expect(state.sessionEndTimeLocal).toBe('12:55');
      expect(state.actualServiceCode).toBe('90837');
      state.sessionDurationMinutes = 52;
      await nextTick();
      state.decideDurationCodeChange(true);
      await nextTick();
      expect(state.actualServiceCode).toBe('90834');
      expect(state.sessionDurationMinutes).toBe(52);
      expect(state.sessionEndTimeLocal).toBe('12:52');
      await state.autosave();
      expect(api.patch).toHaveBeenCalledWith('/clinical-notes/drafts/295', expect.objectContaining({ serviceCode: '90834', inputText: 'Preserve source.', outputJson: expect.objectContaining({ meta: expect.objectContaining({ sessionContext: expect.objectContaining({ durationMinutes: 52, serviceCode: '90834' }) }) }) }), expect.anything());
    } finally { wrapper.unmount(); }
  });

  it('requires explicit reconciliation of a retained 90837/45-minute draft without inventing a prior valid duration', async () => {
    const {wrapper,state}=await workspace();
    try {
      await state.loadDraftIntoWorkspace({id:294,agency_id:7,service_code:'90837',clinical_session_id:170,input_text:'Keep this retained source.'},{preferredServiceCode:'90834',preferredScheduledStart:'2026-11-02T15:15:00Z',preferredScheduledEnd:'2026-11-02T16:00:00Z'});
      await nextTick();
      expect(state.actualServiceCode).toBe('90837');expect(state.sessionDurationMinutes).toBe(45);
      expect(state.pendingDurationChange).toMatchObject({previousMinutes:null,proposedCode:'90834'});expect(state.generateDisabled).toBe(true);
      api.patch.mockClear();await state.autosave();expect(api.patch).not.toHaveBeenCalled();
      state.decideDurationCodeChange(false);await nextTick();
      expect(state.sessionDurationMinutes).toBe(45);expect(state.actualServiceCode).toBe('90837');expect(state.generateDisabled).toBe(true);
      expect(wrapper.find('[role="alert"]').text()).toContain('Correct the duration');
      await state.approveNoteOutput();expect(state.approvalError).toContain('Review the duration');
      // Reopen and explicitly accept the matching code. Authored text and session link survive.
      await state.loadDraftIntoWorkspace({id:294,agency_id:7,service_code:'90837',clinical_session_id:170,input_text:'Keep this retained source.'},{preferredScheduledStart:'2026-11-02T15:15:00Z',preferredScheduledEnd:'2026-11-02T16:00:00Z'});
      state.decideDurationCodeChange(true);await nextTick();await state.autosave();
      expect(api.patch).toHaveBeenCalledWith('/clinical-notes/drafts/294',expect.objectContaining({serviceCode:'90834',inputText:'Keep this retained source.',outputJson:expect.objectContaining({meta:expect.objectContaining({sessionContext:expect.objectContaining({durationMinutes:45,serviceCode:'90834'})})})}),expect.anything());
      expect(state.sessionClinicalSessionId).toBe(170);
      expect(api.patch.mock.calls.at(-1)[1]).not.toHaveProperty('clinicalSessionId');
    } finally {wrapper.unmount();}
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

  it('marks only edited saved progress content as attendance, not a loaded draft or an unchanged autosave', async () => {
    const { wrapper, state } = await workspace();
    try {
      await state.loadDraftIntoWorkspace({ id: 42, agency_id: 7, clinical_session_id: 9, service_code: '90834', input_text: 'Saved source', output_json: { meta: { toolId: 'clinical_psychotherapy_note' } } });
      vi.mocked(api.patch).mockClear();
      await state.autosave();
      expect(api.patch).not.toHaveBeenCalled();
      state.inputText = 'Added clinical observations after this session.';
      await state.autosave();
      expect(vi.mocked(api.patch).mock.calls.at(-1)?.[1]).toMatchObject({ inputText: 'Added clinical observations after this session.', attendanceIntent: 'authored_session_draft' });
      expect(vi.mocked(api.patch).mock.calls.at(-1)?.[1]).not.toHaveProperty('clinicalSessionId');
      expect(vi.mocked(api.patch).mock.calls.at(-1)?.[1]).not.toHaveProperty('officeEventId');
      const saves = api.patch.mock.calls.length;
      await state.autosave();
      expect(api.patch).toHaveBeenCalledTimes(saves);
    } finally { wrapper.unmount(); }
  });

  it('replaces the previous session context when switching between drafts in the library', async () => {
    const { wrapper, state } = await workspace();
    try {
      await state.loadDraftIntoWorkspace({ id: 42, agency_id: 7, clinical_session_id: 9, office_event_id: 90, service_code: '90834', input_text: 'First session' });
      await flushPromises();
      await state.loadDraftIntoWorkspace({ id: 43, agency_id: 7, clinical_session_id: 10, office_event_id: 100, service_code: '90834', input_text: 'Second session' });
      await flushPromises();
      state.inputText = 'Edited second session';
      await state.autosave();
      expect(vi.mocked(api.patch).mock.calls.at(-1)).toEqual(['/clinical-notes/drafts/43', expect.objectContaining({ inputText: 'Edited second session' }), expect.anything()]);
      expect(state.bookingContext).toMatchObject({ clinicalSessionId: 10, officeEventId: 100 });
      expect(vi.mocked(api.patch).mock.calls.at(-1)[1]).not.toHaveProperty('clinicalSessionId');
      expect(vi.mocked(api.patch).mock.calls.at(-1)[1]).not.toHaveProperty('officeEventId');
      await state.loadDraftIntoWorkspace({ id: 44, agency_id: 7, service_code: '90834', input_text: 'Unlinked note' });
      await flushPromises();
      expect(state.bookingContext.clinicalSessionId).toBeNull();
      expect(state.bookingContext.officeEventId).toBeNull();
    } finally { wrapper.unmount(); }
  });

  it('saves authored text before appointment repair without sending relationship changes, and blocks repair on failed saving', async () => {
    const { wrapper, state } = await workspace();
    try {
      await state.loadDraftIntoWorkspace({ id: 43, agency_id: 7, clinical_session_id: 10, service_code: '90834', input_text: 'Preserved source' });
      api.patch.mockReset().mockResolvedValue({ data: {} });
      await expect(state.prepareDraftAppointmentRepair()).resolves.toBeUndefined();
      expect(api.patch).not.toHaveBeenCalled();
      state.inputText = 'Reviewed correction awaiting appointment link.';
      await state.prepareDraftAppointmentRepair();
      expect(api.patch.mock.calls[0][1]).toMatchObject({ inputText: 'Reviewed correction awaiting appointment link.' });
      expect(api.patch.mock.calls[0][1]).not.toHaveProperty('clinicalSessionId');
      expect(api.patch.mock.calls[0][1]).not.toHaveProperty('officeEventId');
      state.inputText = 'Keep this unsaved correction.';
      api.patch.mockRejectedValueOnce({ response: { status: 503, data: { error: { message: 'Storage unavailable' } } } });
      await expect(state.prepareDraftAppointmentRepair()).rejects.toThrow('Storage unavailable');
      expect(state.inputText).toBe('Keep this unsaved correction.');
      expect(state.sessionClinicalSessionId).toBe(10);
    } finally { api.patch.mockReset().mockResolvedValue({ data: {} }); wrapper.unmount(); }
  });

  it('does not mark a termination narrative as session attendance', async () => {
    const { wrapper, state } = await workspace('termination');
    try {
      state.inputText = 'Termination summary for completed care.';
      vi.mocked(api.post).mockClear();
      await state.autosave();
      const save = vi.mocked(api.post).mock.calls.find(([url]) => url === '/clinical-notes/drafts');
      expect(save?.[1].toolId).toBe('clinical_termination');
      expect(save?.[1].attendanceIntent).toBeUndefined();
    } finally { wrapper.unmount(); }
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

  it('completes termination review without requesting a signature or claim', async () => {
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
    const review = vi.mocked(api.post).mock.calls.find(([url]) => url === '/medical-billing/notes/77/review');
    expect(review?.[1]).toMatchObject({ contentReviewConfirmed: true });
    expect(review?.[1].contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url.endsWith('/sign'))).toBe(false);
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
    vi.mocked(api.post).mockImplementation(async (url) => ({ data: url.endsWith('/notes') ? { note: { id: 77, signingToken: 'DEMO QA saved snapshot token' } } : url.endsWith('/sign') ? { signedAt: '2026-11-03T17:12:34Z', terminationTodo: todo } : {} }));
    await state.approveNoteOutput({ afterSign: 'close' });
    expect(state.selectedAidId).toBe('termination');
    expect(state.activeWorkQueueItemId).toBe(todo.id);
    expect(state.approvalMessage).toContain('Progress note signed');
    wrapper.unmount();
  });

  it('uses the saved snapshot token and server signature time for a treatment summary', async () => {
    const { wrapper, state } = await workspace('treatment_summary');
    try {
      state.selectedClientId = 22; state.selectedClient = { id: 22, agency_id: 7 };
      await flushPromises(); state.sessionClinicalSessionId = 9;
      state.outputObj = { sections: { Summary: 'DEMO QA clinical summary for a synthetic client.' }, meta: { manualSections: true } };
      state.attestAccurateAndComplete = true; state.attestMedicallyNecessary = true; await nextTick();
      vi.mocked(api.post).mockImplementation(async url => ({ data: url.endsWith('/notes') ? { note: { id: 77, signingToken: 'DEMO QA saved snapshot token' } } : url.endsWith('/sign') ? { signedAt: '2026-11-03T17:12:34Z' } : {} }));
      await state.approveNoteOutput({ afterSign: 'close' });
      expect(state.approvalError).toBe('');
      expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/77/sign', expect.objectContaining({ signingToken: 'DEMO QA saved snapshot token' }), { skipGlobalLoading: true });
      expect(state.treatmentSummaryProviderSignedAt).toBe('2026-11-03T17:12:34Z');
    } finally { wrapper.unmount(); }
  });

  it('opens supervisor review without replacing the author draft and restores it on close', async () => {
    const { wrapper, state } = await workspace();
    try {
      state.draftId = 88;
      state.inputText = 'Synthetic unsaved author draft';
      state.sessionDurationMinutes = 45;
      state.activateCosignQueueItem({ id: 'cosign_71', clinicalNoteId: 71, agencyId: 7 });
      await nextTick();
      expect(state.workQueueCollapsed).toBe(false);
      expect(state.draftId).toBe(88);
      expect(state.inputText).toBe('Synthetic unsaved author draft');
      expect(state.sessionDurationMinutes).toBe(45);
      expect(wrapper.find('.na-shell--supervisor-review').exists()).toBe(true);
      state.closeSupervisorReview();
      await nextTick();
      expect(state.inputText).toBe('Synthetic unsaved author draft');
      expect(state.draftId).toBe(88);
      expect(wrapper.find('.na-shell--supervisor-review').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('advances to the next remaining note in the displayed cosign order', async () => {
    const { wrapper, state } = await workspace();
    try {
      const first = { id: 'cosign_1', clinicalNoteId: 71, agencyId: 7 };
      const second = { id: 'cosign_2', clinicalNoteId: 72, agencyId: 7 };
      const third = { id: 'cosign_3', clinicalNoteId: 73, agencyId: 7 };
      state.cosignQueueItems = [first, second, third];
      state.cosignVisibleOrder = [first.id, third.id, second.id];
      state.activateCosignQueueItem(first);
      vi.mocked(api.get).mockImplementation(async url => ({ data: url === '/me/notes-to-sign' ? {
        isSupervisor: true,
        notes: [{ id: 2, clinical_note_id: 72, agency_id: 7 }, { id: 3, clinical_note_id: 73, agency_id: 7 }]
      } : {} }));
      await state.onSupervisorReviewCompleted({ noteId: 71, agencyId: 7 });
      expect(state.supervisorReviewItem.clinicalNoteId).toBe(73);
      expect(state.workQueueCollapsed).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('does not reopen a cosign review after the user leaves during queue refresh', async () => {
    const { wrapper, state } = await workspace();
    try {
      const first = { id: 'cosign_1', clinicalNoteId: 71, agencyId: 7 };
      const second = { id: 'cosign_2', clinicalNoteId: 72, agencyId: 7 };
      state.cosignQueueItems = [first, second];
      state.activateCosignQueueItem(first);
      let resolveQueue;
      vi.mocked(api.get).mockImplementation(url => url === '/me/notes-to-sign'
        ? new Promise(resolve => { resolveQueue = resolve; }) : Promise.resolve({ data: {} }));
      const completed = state.onSupervisorReviewCompleted({ noteId: 71, agencyId: 7 });
      state.closeSupervisorReview();
      resolveQueue({ data: { isSupervisor: true, notes: [{ id: 2, clinical_note_id: 72, agency_id: 7 }] } });
      await completed;
      expect(state.supervisorReviewItem).toBeNull();
    } finally { wrapper.unmount(); }
  });

  it('a returned note cannot close a newer selected note or accept a different tenant result', async () => {
    const { wrapper, state } = await workspace();
    try {
      const first = { id: 'cosign_1', clinicalNoteId: 71, agencyId: 7 };
      const second = { id: 'cosign_2', clinicalNoteId: 72, agencyId: 7 };
      state.cosignQueueItems = [first, second];
      state.activateCosignQueueItem(first);
      let resolveQueue;
      vi.mocked(api.get).mockImplementation(url => url === '/me/notes-to-sign'
        ? new Promise(resolve => { resolveQueue = resolve; }) : Promise.resolve({ data: { items: [] } }));
      const returned = state.onSupervisorReviewReturned({ noteId: 71, agencyId: 7, action: 'changes_needed' });
      state.activateCosignQueueItem(second);
      resolveQueue({ data: { isSupervisor: true, notes: [{ id: 2, clinical_note_id: 72, agency_id: 7 }] } });
      await returned;
      expect(state.supervisorReviewItem.clinicalNoteId).toBe(72);
      vi.mocked(api.get).mockClear();
      await state.onSupervisorReviewCompleted({ noteId: 72, agencyId: 8 });
      await state.onSupervisorReviewReturned({ noteId: 71, agencyId: 7, action: 'changes_needed' });
      expect(api.get).not.toHaveBeenCalled();
      expect(state.supervisorReviewItem.clinicalNoteId).toBe(72);
    } finally { wrapper.unmount(); }
  });

  it('a delayed returned-note load cannot overwrite a newly selected author draft', async () => {
    const { wrapper, state } = await workspace();
    try {
      let resolveNote;
      vi.mocked(api.get).mockImplementation(url => url === '/medical-billing/notes/71'
        ? new Promise(resolve => { resolveNote = resolve; }) : Promise.resolve({ data: {} }));
      const loading = state.activateNoteReviewItem({ clinicalNoteId: 71, agencyId: 7 });
      state.clearSignedNoteViewer();
      state.draftId = 88;
      state.inputText = 'New author draft must survive';
      resolveNote({ data: { note: { id: 71, agencyId: 7, serviceCode: '90834', outputJson: { sections: { Subjective: 'Older returned note' } } } } });
      await loading;
      expect(state.signedNoteViewerId).toBeNull();
      expect(state.draftId).toBe(88);
      expect(state.inputText).toBe('New author draft must survive');
      expect(state.viewingChartNote).toBeNull();
    } finally { wrapper.unmount(); }
  });

  it('only the latest returned-note selection can populate the author workspace', async () => {
    const { wrapper, state } = await workspace();
    try {
      let resolveFirst;
      vi.mocked(api.get).mockImplementation(url => url === '/medical-billing/notes/71'
        ? new Promise(resolve => { resolveFirst = resolve; })
        : Promise.resolve({ data: url === '/medical-billing/notes/72' ? { note: { id: 72, agencyId: 7, serviceCode: '90834', outputJson: { sections: { Subjective: 'Latest selected note' } } } } : {} }));
      const first = state.activateNoteReviewItem({ clinicalNoteId: 71, agencyId: 7 });
      await state.activateNoteReviewItem({ clinicalNoteId: 72, agencyId: 7 });
      resolveFirst({ data: { note: { id: 71, agencyId: 7, outputJson: { sections: { Subjective: 'Stale note response' } } } } });
      await first;
      expect(state.signedNoteViewerId).toBe(72);
      expect(state.viewingChartNote.id).toBe(72);
      expect(state.outputObj.sections.Subjective).toBe('Latest selected note');
    } finally { wrapper.unmount(); }
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
    expect(wrapper.text()).toMatch(/Note Workspace|Not available|AI Note/i);
  });
});
