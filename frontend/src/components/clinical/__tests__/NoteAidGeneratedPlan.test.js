import { it, expect, vi, beforeEach } from 'vitest';
import { mount, shallowMount, flushPromises } from '@vue/test-utils';
import Review from '../NoteAidTreatmentPlanImportReview.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn(), put: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
it('loads the imported source once, preloads its diagnoses, allows incomplete drafts and identifies the source when finalized',async()=>{
 const original={id:44,status:'draft',source_tool_id:'client_records_import:source',effective_date:'2026-01-02',discharge_plan:'Discharge after goals met.',recordsImportSource:{text:'Complete original source',parsed:{diagnoses:[{icd10Code:'F41.1',description:'Source diagnosis'}]}},goals:[{goalText:'Improve coping',objectives:[{objectiveText:'Progress on a scale of 1–10. The client is currently functioning at a 3. The goal is to achieve a 7.'}]}]};
 api.get.mockImplementation(async url=>({data:url.endsWith('/44')?{plan:original}:{policy:{renewAfterDays:90}}}));api.post.mockResolvedValue({data:{plan:{id:55}}});
 const w=shallowMount(Review,{props:{open:false,agencyId:2,clientId:42,mode:'draft',planId:44}});await w.setProps({open:true});await flushPromises();const state=w.vm.$.setupState;
 expect(w.text()).toContain('Complete original source');expect(state.model.diagnoses[0].icd10Code).toBe('F41.1');expect(state.model.goals[0].objectives[0]).toMatchObject({scaleCurrent:3,scaleTarget:7});expect(api.post).not.toHaveBeenCalled();
 state.model.goals[0].objectives[0].scaleTarget=null;await state.save({finalize:false});expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans',expect.objectContaining({status:'draft',finalize:false}));
 state.model.goals[0].objectives[0].scaleTarget=7;state.model.goals[0].durationMonths=6;await state.save({finalize:true});expect(api.post).toHaveBeenLastCalledWith('/medical-billing/treatment-plans',expect.objectContaining({sourceDraftPlanId:44,status:'active',finalize:true}));w.unmount();
});
it('shows the agency review schedule, keeps imported scheduling text separate and rejects a blank goal first', async () => {
  api.get.mockResolvedValue({ data: { policy: { renewAfterDays: 90, flagAfterDays: 75, flagEnabled: true } } });
  const plan = { effectiveDate: '2026-11-09', dischargePlan: '', goals: [{ goalText: '', objectives: [{ objectiveText: 'Practice a skill.', scaleCurrent: 3, scaleTarget: 7 }] }] };
  const w = shallowMount(Review, { props: { open: false, agencyId: 450, clientId: 2449, initialPlan: plan } });
  await w.setProps({ open: true }); await flushPromises();
  expect(w.get('[data-plan-review-policy]').text()).toContain('90 days');
  expect(w.get('[data-plan-review-policy]').text()).toContain('75 days');
  const state = w.vm.$.setupState;
  await state.save({ finalize: true });
  expect(w.text()).toContain('Enter the title for goal 1.'); expect(api.post).not.toHaveBeenCalled();
  state.model.goals[0].goalText = 'Practice coping.';
  state.model.goals[0].durationMonths = 6;
  await state.save({ finalize: true });
  expect(w.text()).toContain('Enter the discharge criteria.'); expect(api.post).not.toHaveBeenCalled();
  w.unmount();
});

it('reviews generated objective scores and persists an intake-generated plan with diagnosis and interventions', async () => {
  const plan = {
    title: 'Intake-generated Treatment Plan', sourceToolId: 'note_aid_intake_generated', aiGenerated: true,
    effectiveDate: '2026-08-20', presentingProblem: 'Difficulty coping.', prescribedFrequency: 'Weekly', dischargePlan: 'Sustained independent coping.',
    diagnosticJustification: 'Updated formulation.', diagnoses: [{ icd10Code: 'F42.9', description: 'Synthetic diagnosis', isPrimary: true }],
    goals: [{ goalText: 'Improve coping.', durationMonths: 6, objectives: [
      { objectiveText: 'Current baseline is a 4, with a target of 8.', interventions: ['Skills rehearsal'] },
      { objectiveText: 'Practice an independent coping strategy each week.', scaleCurrent: 3, scaleTarget: 7 }
    ] }]
  };
  const wrapper = shallowMount(Review, { props: { open: false, agencyId: 7, clientId: 202, mode: 'generated', initialPlan: plan } });
  await wrapper.setProps({ open: true });
  await flushPromises();
  const state = wrapper.vm.$.setupState;
  expect(state.model.goals[0].objectives[0]).toMatchObject({ scaleCurrent: 4, scaleTarget: 8, scaleDirection: 'increase' });
  state.model.goals[0].durationMonths = 8;
  state.onGoalDurationChange(state.model.goals[0]);
  expect(state.model.goals[0].objectives[0].objectiveText).toBe('Current baseline is a 4, with a target of 8.');
  expect(state.model.goals[0].objectives[0].projectedCompletion).toBe('2027-04-20');
  expect(state.aiContentUsed).toBe(true);
  await state.save({ finalize: true });
  expect(api.post).not.toHaveBeenCalled();
  for (const button of wrapper.findAll('button').filter(button => ['Accept goal', 'Accept objective'].includes(button.text()))) {
    await button.trigger('click');
  }
  vi.mocked(api.post).mockResolvedValue({ data: { plan: { id: 55, status: 'active', ...plan } } });
  await state.save({ finalize: true });
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans', expect.objectContaining({
    title: 'Intake-generated Treatment Plan', sourceToolId: 'note_aid_intake_generated', effectiveDate: '2026-08-20',
    status: 'active', diagnoses: [expect.objectContaining({ icd10Code: 'F42.9', justification: 'Updated formulation.' })],
    goals: [expect.objectContaining({ projectedCompletion: '2027-04-20', reviewStatus: 'edited', objectives: [
      expect.objectContaining({ objectiveText: 'Current baseline is a 4, with a target of 8.', projectedCompletion: '2027-04-20', scaleCurrent: 4, scaleTarget: 8, interventions: ['Skills rehearsal'], reviewStatus: 'accepted' }),
      expect.objectContaining({ scaleCurrent: 3, scaleTarget: 7, reviewStatus: 'accepted' })
    ] })]
  }));
  expect(wrapper.emitted('saved')[0][0].id).toBe(55);
  wrapper.unmount();
});

it('selects shared and custom interventions and saves corrected decreasing scores', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { all: ['Agency intervention', 'Personal intervention'] } });
  const plan = {
    sourceToolId: 'note_aid_intake_generated', aiGenerated: true, effectiveDate: '2026-08-20',
    diagnoses: [{ icd10Code: 'F42.9', description: 'Revised formulation', isPrimary: true }],
    goals: [{ goalText: 'Revised focus', durationMonths: 6, objectives: [{
      objectiveText: 'Within 6 months, reduce time worrying from 2 hours to 30 minutes. The client currently rates their coping as an 8 on a 10-point scale, where 10 represents severe difficulty and 1 represents none. Reduce this self-reported rating to a 3 or lower.',
      interventions: ['Previously selected custom intervention']
    }] }]
  };
  const wrapper = mount(Review, { props: { open: false, agencyId: 7, clientId: 202, mode: 'generated', initialPlan: plan } });
  await wrapper.setProps({ open: true });
  await flushPromises();
  const state = wrapper.vm.$.setupState;
  const objective = state.model.goals[0].objectives[0];
  expect(objective).toMatchObject({ scaleCurrent: 8, scaleTarget: 3, scaleDirection: 'decrease', scaleNeedsRewrite: false });
  expect(wrapper.text()).not.toContain('not on a clear');
  expect(api.get).toHaveBeenCalledWith('/medical-billing/interventions', expect.objectContaining({ params: { agencyId: 7 } }));
  const picker = wrapper.find('.intervention-picker');
  for (const name of ['Active Listening', 'Agency intervention', 'Personal intervention', 'Previously selected custom intervention']) {
    expect(picker.text()).toContain(name);
  }
  const active = picker.findAll('label').find((label) => label.text().trim() === 'Active Listening');
  await active.find('input').setValue(true);
  expect(objective.interventions).toEqual(['Previously selected custom intervention', 'Active Listening']);
  await picker.find('input[placeholder="Intervention name"]').setValue('New personal technique');
  vi.mocked(api.post).mockResolvedValueOnce({ data: { all: ['New personal technique'] } });
  await picker.findAll('button').find((button) => button.text() === 'Add and select').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/interventions', { agencyId: 7, scope: 'user', names: ['New personal technique'] }, { skipGlobalLoading: true });
  expect(objective.interventions).toContain('New personal technique');
  state.attestAiReviewed = true;
  vi.mocked(api.post).mockResolvedValueOnce({ data: { plan: { id: 56 } } });
  await state.save({ finalize: false });
  expect(api.post).toHaveBeenLastCalledWith('/medical-billing/treatment-plans', expect.objectContaining({
    effectiveDate: '2026-08-20', goals: [expect.objectContaining({ objectives: [expect.objectContaining({ scaleCurrent: 8, scaleTarget: 3, scaleDirection: 'decrease', interventions: ['Previously selected custom intervention', 'Active Listening', 'New personal technique'] })] })]
  }));
  wrapper.unmount();
});

it('keeps partial drafts saveable and gates finalization on goal durations',async()=>{
 api.get.mockResolvedValue({data:{policy:{renewAfterDays:90}}});api.post.mockResolvedValue({data:{plan:{id:55}}});
 const initialPlan={effectiveDate:'2026-11-14',dischargePlan:'Independent coping',diagnoses:[{icd10Code:'F41.9',isPrimary:true}],goals:[{goalText:'Improve coping',objectives:[{objectiveText:'Practice coping',scaleCurrent:3,scaleTarget:7}]}]};
 const w=shallowMount(Review,{props:{open:false,agencyId:450,clientId:2449,initialPlan,allowImportedDraft:true}});await w.setProps({open:true});await flushPromises();const state=w.vm.$.setupState;
 expect(w.text()).toContain('Choose a duration');await state.save({finalize:true});expect(api.post).not.toHaveBeenCalled();
 await state.save({finalize:false});expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans',expect.objectContaining({status:'draft',finalize:false}));
 state.model.goals[0].durationMonths=6;await state.save({finalize:true});expect(api.post).toHaveBeenLastCalledWith('/medical-billing/treatment-plans',expect.objectContaining({goals:[expect.objectContaining({durationMonths:6,projectedCompletion:'2027-05-14'})]}));w.unmount();
});


it('updates only the requested objective and persists its reviewed state when the draft reopens', async () => {
  api.get.mockResolvedValue({data:{policy:{renewAfterDays:90}}});
  api.post.mockResolvedValue({data:{proposal:{objectives:[
    {ref:'1.1', objectiveText:'Practice grounding', target:3, durationMonths:3, clientQuestion:'Rate your current anxiety.',otherQuestion:'Rate the anxiety you observed.',interventions:['Grounding']}
  ]}}});
  api.put.mockResolvedValue({data:{revision:1}});
  const plan={id:44,status:'draft',effectiveDate:'2026-11-23',diagnoses:[{icd10Code:'F41.1',description:'Synthetic diagnosis'}],goals:[
    {goalText:'Manage anxiety',objectives:[{objectiveText:'Practice coping'}]},
    {goalText:'Improve communication',objectives:[{objectiveText:'Use assertive language',scaleCurrent:4}]}
  ]};
  const wrapper=shallowMount(Review,{props:{open:true,embedded:true,mode:'draft',agencyId:2,clientId:42,planId:44,initialPlan:plan}});
  await flushPromises();
  expect(wrapper.get('.na-plan-paper').exists()).toBe(true);
  expect(wrapper.get('.na-plan-diagnosis-title code').text()).toBe('F41.1');
  const button=text=>wrapper.findAll('button').find(item=>item.text()===text);
  await wrapper.find('.narriva-plan-actions input[type="checkbox"]').setValue(true);
  await wrapper.get('button[aria-label="Update objective 1.1 with Narriva"]').trigger('click');
  const state=wrapper.vm.$.setupState;
  state.actionInstructions='Rewrite this objective to practice grounding.';
  await state.applyPlanAction();await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans/narriva-suggestions',expect.objectContaining({clientId:42,chartDraft:true,includeOther:true,action:'update_objective',revisionInstructions:'Rewrite this objective to practice grounding.'}),expect.anything());
  expect(state.model.goals[0].objectives[0]).toMatchObject({scaleCurrent:null,scaleTarget:3,projectedCompletion:'2027-02-23',interventions:['Grounding'],kioskPromptOther:'Rate the anxiety you observed.',reviewStatus:'pending'});
  expect(state.model.goals[1].objectives[0]).toMatchObject({objectiveText:'Use assertive language',scaleCurrent:4,interventions:[]});
  await button('Accept objective').trigger('click');
  await button('Save draft').trigger('click');await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/medical-billing/treatment-plans/44/chart-draft',expect.objectContaining({revision:0,draft:expect.objectContaining({goals:expect.arrayContaining([expect.objectContaining({objectives:[expect.objectContaining({reviewStatus:'accepted'})]})])})}));
  expect(wrapper.text()).toContain('Draft saved.');
  expect(api.post).toHaveBeenCalledOnce();
  const saved=api.put.mock.calls[0][1].draft;
  wrapper.unmount();
  const reopened=shallowMount(Review,{props:{open:true,embedded:true,mode:'draft',agencyId:2,clientId:42,planId:44,
    initialPlan:{...plan,chartDraft:{revision:1,value:saved}}}});
  await flushPromises();
  expect(reopened.vm.$.setupState.model.goals[0].objectives[0]).toMatchObject({reviewStatus:'accepted',projectedCompletion:'2027-02-23',kioskPrompt:'Rate your current anxiety.'});
  reopened.unmount();
});

it('adds a goal without changing existing dates and requires review before signing', async () => {
  api.get.mockResolvedValue({ data:{} });
  api.post.mockResolvedValue({ data:{ proposal:{
    goals:[{ref:'1',goalText:'Improve daily routines'}],
    objectives:[{ref:'1.1',objectiveText:'Practice a daily routine',target:8,durationMonths:3,clientQuestion:'Rate your confidence.'}]
  } } });
  const plan={id:44,status:'draft',effectiveDate:'2026-11-23',presentingProblem:'Synthetic concern.',prescribedFrequency:'Weekly',dischargePlan:'Review transition readiness.',diagnoses:[{icd10Code:'F41.9',justification:'Synthetic clinical rationale.'}],goals:[
    {goalText:'Build coping skills',durationMonths:6,objectives:[{objectiveText:'Practice grounding',scaleCurrent:4,scaleTarget:8,kioskPrompt:'Rate your coping.'}]},
    {goalText:'Build confidence',durationMonths:6,objectives:[{objectiveText:'Practice a skill',scaleCurrent:3,scaleTarget:7,kioskPrompt:'Rate your confidence.'}]}
  ]};
  const wrapper=shallowMount(Review,{props:{open:true,embedded:true,mode:'draft',agencyId:2,clientId:42,planId:44,initialPlan:plan}});
  await flushPromises();
  const state=wrapper.vm.$.setupState;
  state.model.goals[0].objectives[0].projectedCompletion='2027-04-15';
  await wrapper.get('button[aria-label="Add goal with Narriva"]').trigger('click');
  state.actionInstructions='Add a goal for daily routines.';
  await state.applyPlanAction();await flushPromises();
  expect(state.model.goals[0].objectives[0]).toMatchObject({objectiveText:'Practice grounding',projectedCompletion:'2027-04-15',scaleCurrent:4});
  expect(state.model.goals[2]).toMatchObject({goalText:'Improve daily routines',reviewStatus:'pending',objectives:[
    expect.objectContaining({scaleCurrent:null,skipScale:true,reviewStatus:'pending',kioskPromptOther:'',projectedCompletion:'2027-02-23'})
  ]});
  await state.save({finalize:true});
  expect(wrapper.text()).toContain('Accept, edit, or remove goal 3.');
  expect(wrapper.text()).toContain('Accept, edit, or remove objective 3.1.');
  expect(api.put).not.toHaveBeenCalled();
  wrapper.unmount();
});

it('opens the full page with separate diagnoses, objective controls and care planning under the goals', async () => {
  api.get.mockResolvedValue({ data: { policy: { renewAfterDays: 90 } } });
  api.put.mockResolvedValue({ data: { revision: 1 } });
  const plan = {
    id: 71, status: 'draft', effectiveDate: '2026-11-03',
    diagnosticJustification: 'Unassigned legacy assessment text.',
    diagnoses: [
      { icd10Code: 'Z55.3', description: 'School concern', justification: '' },
      { icd10Code: 'F41.9', description: 'Chart diagnosis', justification: 'Code-specific chart rationale.', isPrimary: true }
    ],
    goals: [{ goalText: 'Practice a skill', objectives: [{ objectiveText: 'Rehearse a strategy.', interventions: ['Skills rehearsal'] }] }]
  };
  const wrapper = shallowMount(Review, { props: {
    open: true, fullPage: true, mode: 'draft', agencyId: 2, clientId: 42, planId: 71, sourceIntakeNoteId: 50, initialPlan: plan
  } });
  await flushPromises();
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(wrapper.findAll('.na-plan-section h2').map(heading => heading.text())).toEqual([
    'Plan overview', 'Diagnoses', 'Goals, objectives and interventions', 'Frequency and discharge', 'Signature'
  ]);
  const diagnoses = wrapper.findAll('.na-plan-diagnosis');
  expect(diagnoses[0].text()).toContain('F41.9');
  expect(diagnoses[0].get('textarea').element.value).toBe('Code-specific chart rationale.');
  const secondary = diagnoses[1].get('textarea');
  expect(secondary.element.value).toBe('');
  expect(secondary.attributes('aria-invalid')).toBe('true');
  expect(wrapper.text()).toContain('Unassigned legacy assessment text.');
  expect(wrapper.text()).toContain('when rating this objective at check-in');
  await secondary.setValue('Secondary diagnosis rationale.');
  await wrapper.findAll('button').find(button => button.text() === 'Save draft').trigger('click');
  await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/medical-billing/treatment-plans/71/chart-draft', expect.objectContaining({
    draft: expect.objectContaining({
      effectiveDate: '2026-11-03', legacyDiagnosisNarrative: 'Unassigned legacy assessment text.',
      diagnoses: [
        expect.objectContaining({ icd10Code: 'F41.9', isPrimary: true, justification: 'Code-specific chart rationale.' }),
        expect.objectContaining({ icd10Code: 'Z55.3', isPrimary: false, justification: 'Secondary diagnosis rationale.' })
      ],
      goals: [expect.objectContaining({ objectives: [expect.objectContaining({ interventions: ['Skills rehearsal'] })] })]
    })
  }));
  wrapper.unmount();
});
