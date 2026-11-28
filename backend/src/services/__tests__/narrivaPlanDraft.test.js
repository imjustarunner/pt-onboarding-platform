import {expect,it,vi} from 'vitest';
import { queueIntakeTreatmentPlan, intakePlanSource } from '../intakeTreatmentPlanWork.service.js';
import {normalizeNarrivaPlanDraft,suggestNarrivaPlanDraft} from '../narrivaPlanDraft.service.js';

const objective=(text, fields={})=>({
  objectiveText:text, projectedCompletion:'2027-02-23', scaleCurrent:4,scaleTarget:8,scaleDirection:'increase', kioskPrompt:'Where are you today on a 1–10 scale?',
  interventions:['Practice grounding; Estimated completion: January 2027'], ...fields
});
const plan = () => ({effectiveDate:'2026-11-23',prescribedFrequency:'Weekly',dischargePlan:'Review readiness with the client.',presentingProblem:'Pat Synthetic reports worry.',
  diagnoses:[{icd10Code:'F41.1',description:'Anxiety',isPrimary:true,justification:'Documented worry and functional impairment.'}],
  goals:[{goalText:'Manage anxiety',objectives:[objective('Practice emotion regulation')]},{goalText:'Improve communication',objectives:[objective('Private: Pat Synthetic will practice communication')]}]});

it('preserves long imported frequency instructions through draft save and finalization', () => {
 const prescribedFrequency = 'Meet weekly, with the documented provider and family coordination instructions. '.repeat(40).trim();
 const saved = normalizeNarrivaPlanDraft({...plan(), prescribedFrequency});
 expect(saved.prescribedFrequency).toBe(prescribedFrequency);
 expect(normalizeNarrivaPlanDraft(saved, {finalize:true}).prescribedFrequency).toBe(prescribedFrequency);
});

it('requires two scaled objectives and preserves objective dates and interventions without an exemption reason',()=>{
 const draft=plan();
 draft.goals[0].objectives.push(objective('Complete enrollment form',{skipScale:true}));
 const normalized=normalizeNarrivaPlanDraft(draft,{finalize:true});
 expect(normalized.goals[0].projectedCompletion).toBe('2027-02-23');
 expect(normalized.goals[0].objectives[1]).toMatchObject({scaleCurrent:null,kioskPrompt:null,measurementMethod:'Alternate measure:',interventions:['Practice grounding']});
 draft.goals[1].objectives[0]={...draft.goals[1].objectives[0],skipScale:true,scaleExemption:'Use session completion'};
 expect(()=>normalizeNarrivaPlanDraft(draft,{finalize:true})).toThrow(/at least two objectives/);
 draft.goals[0].objectives.push(objective('Practice the technique each week'));
 expect(normalizeNarrivaPlanDraft(draft,{finalize:true}).goals).toHaveLength(2);
});
it('sends anonymous themes to the configured private writer and never takes a baseline from its response',async()=>{
 const generate=vi.fn(async()=>({text:JSON.stringify({objectives:[{ref:'1.1',objectiveText:'Practice grounding',baseline:8,target:3,clientQuestion:'How intense was your anxiety?',otherQuestion:'How intense was the anxiety you observed?'}],dischargePlan:'Review criteria'})}));
 const draft=plan();draft.goals[0].objectives[0].scaleCurrent=null;draft.goals[0].objectives[0].scaleTarget=null;
 const response=await suggestNarrivaPlanDraft({input:draft,generate});
 expect(generate).toHaveBeenCalledWith(expect.objectContaining({vertexOnly:true,sensitive:true}));
 expect(generate.mock.calls[0][0].prompt).not.toContain('Pat Synthetic');
 expect(response.objectives[0]).toMatchObject({target:3,otherQuestion:''});
 expect(response.objectives[0]).not.toHaveProperty('baseline');
});

it('retains a clinician’s explicit frequency and duration in the targeted objective request', async () => {
  const draft = plan();
  draft.goals = [{ ...draft.goals[0], durationMonths: 4 }];
  const generate = vi.fn(async () => ({ text: JSON.stringify({
    objectives: [{ ref: '1.1', objectiveText: 'Practice grounding at least 3 school days per week over 6 months.', durationMonths: 4 }]
  }) }));
  const result = await suggestNarrivaPlanDraft({
    input: draft, revision: 'Pat Synthetic should practice at least 3 school days per week over 6 months.',
    action: 'update_objective', generate
  });
  const prompt = generate.mock.calls[0][0].prompt;
  expect(prompt).toContain('"weeklyFrequency":{"qualifier":"at least","count":3,"unit":"school days"}');
  expect(prompt).not.toContain('Pat Synthetic');
  expect(result.objectives[0]).toMatchObject({ durationMonths: 6, objectiveText: expect.stringContaining('3 school days per week') });
  generate.mockResolvedValue({ text: JSON.stringify({
    objectives: [{ ref: '1.1', objectiveText: 'Practice grounding at least 4 school days per week over 4 months.' }]
  }) });
  await expect(suggestNarrivaPlanDraft({
    input: draft, revision: 'Practice at least 3 school days per week over 6 months.', action: 'update_objective', generate
  })).rejects.toThrow('did not include the requested weekly frequency');
});

it('gives a targeted peer-relationship request priority over intake school themes', async () => {
  const draft = { ...plan(), goals: [{ goalText: '', objectives: [{ objectiveText: '', skipScale: true }] }] };
  const response = title => ({ text: JSON.stringify({
    goals: [{ ref: '1', goalText: title }],
    objectives: [{ ref: '1.1', objectiveText: 'Practice an agreed conversation skill each week.' }]
  }) });
  const generate = vi.fn(async () => response('Build supportive friendships'));
  const options = { input: draft, revision: 'Add a peer relationships goal for Pat Synthetic.',
    intakeEvidence: 'School attendance and academic performance are impacted.', action: 'add_goal', generate };
  const result = await suggestNarrivaPlanDraft(options);
  expect(result.goals[0].goalText).toBe('Build supportive friendships');
  expect(generate.mock.calls[0][0].prompt).toContain('"revisionThemes":["peer relationships","relationships"]');
  expect(generate.mock.calls[0][0].prompt).not.toContain('Pat Synthetic');
  generate.mockResolvedValue(response('Improve school participation'));
  await expect(suggestNarrivaPlanDraft(options)).rejects.toThrow('did not return a goal about peer relationships');
});

it('completes a third goal even when the writer omits that goal, without supplying a baseline or observer question', async () => {
  const draft = plan();
  draft.goals[0].objectives[0].kioskPromptOther = 'An old observer question';
  const generate = vi.fn(async () => ({ text: JSON.stringify({
    objectives:[
      {ref:'1.1',objectiveText:'Practice grounding',target:8,otherQuestion:'Observer prompt'},
      {ref:'2.1',objectiveText:'Practice communication',target:8}
    ]
  }) }));
  const result=await suggestNarrivaPlanDraft({ input:draft, completePlan:true, revision:'Add Goal 3 for sleep', generate });
  expect(result.goals).toEqual([{ ref:'3', goalText:'Build skills for sleep' }]);
  expect(result.objectives).toHaveLength(3);
  expect(result.objectives[0].otherQuestion).toBe('');
  expect(result.objectives[2]).toMatchObject({ ref:'3.1', objectiveText:expect.any(String), target:null, clientQuestion:'' });
  expect(result.objectives[2]).not.toHaveProperty('baseline');
  expect(generate.mock.calls[0][0].prompt).not.toContain('Add Goal 3 for');
  draft.goals[0].objectives[0].scaleCurrent=null;
  expect(()=>normalizeNarrivaPlanDraft(draft,{finalize:true})).toThrow(/Objective 1\.1 needs different baseline/i);
});

it('queues an initial treatment plan from the signed encounter date and deduplicates retries', async () => {
  const intake = { id: 47, agency_id: 2, client_id: 29, created_by_user_id: 8, provider_signed_by_user_id: 8,
    provider_signed_at: '2026-11-25', metadata_json: JSON.stringify({ serviceCode: '90791', dateOfService: '2026-09-12', narrivaContext: { assessmentKind: 'initial' } }) };
  const queue = { findByClientKeyForUser: vi.fn(async () => null), createIfMissingForUser: vi.fn(async (_user, item) => item) };
  const db = { execute: vi.fn(async () => [[{ full_name: 'Synthetic Client' }]]) };
  const clinical = { execute: vi.fn(async () => [[]]) };
  const deps = { db, clinical, queue, checkArchive: async entries => entries };
  const task = await queueIntakeTreatmentPlan(intake, deps);
  expect(task).toMatchObject({id:'intake_plan_2_29',date:'2026-09-12',status:'not_started',noteKind:'treatment_plan',sourceIntakeNoteId:47});
  expect(task).not.toHaveProperty('clinicalSessionId');
  queue.findByClientKeyForUser.mockResolvedValue(task);
  expect(await queueIntakeTreatmentPlan(intake, deps)).toEqual(task);
  expect(queue.createIfMissingForUser).toHaveBeenCalledTimes(1);
  expect(intakePlanSource({...intake, provider_signed_at:null})).toBeNull();
  expect(intakePlanSource({...intake, metadata_json:{serviceCode:'H0031',dateOfService:'2026-09-12',narrivaContext:{assessmentKind:'additional'}}})).toBeNull();
});

it('uses the linked session date and service for a legacy signed intake', () => {
  const intake = {
    provider_signed_at: '2026-11-25',
    service_code: '90791',
    session_start_at: '2026-09-13 02:30:00',
    session_timezone: 'America/Denver',
    metadata_json: '{}'
  };
  expect(intakePlanSource(intake)).toMatchObject({ date: '2026-09-12' });
  expect(intakePlanSource({ ...intake, metadata_json: { dateOfService: '2026-09-11' } })).toMatchObject({ date: '2026-09-11' });
});

it('sends only predefined themes from signed intake evidence to the treatment-plan writer', async () => {
  const generate = vi.fn(async () => ({text:JSON.stringify({objectives:[{ref:'1.1',objectiveText:'Practice a mood tracking routine.'}]})}));
  await suggestNarrivaPlanDraft({input:plan(), intakeEvidence:'Synthetic Name reported sadness and sleep problems during a screening.', generate});
  const prompt = generate.mock.calls[0][0].prompt;
  expect(prompt).toContain('"intakeThemes":["mood","sleep"]');
  expect(prompt).not.toContain('Synthetic Name');
});

it('requires current care fields while allowing a provider to retain existing discharge criteria', () => {
  const draft = plan();
  expect(() => normalizeNarrivaPlanDraft({ ...draft, prescribedFrequency: '' }, { finalize: true })).toThrow(/prescribed frequency/);
  expect(() => normalizeNarrivaPlanDraft({ ...draft, dischargePlan: '' }, { finalize: true })).toThrow(/discharge criteria/);
  expect(normalizeNarrivaPlanDraft({ ...draft, dischargeReviewDeferred: true }, { finalize: true })).toMatchObject({ dischargeReviewDeferred: true });
});

it('requires decisions for untouched Narriva content and preserves edited and accepted decisions', () => {
  const draft = plan();
  draft.goals[0].reviewStatus = 'pending';
  expect(() => normalizeNarrivaPlanDraft(draft, { finalize: true })).toThrow(/Accept, edit, or remove goal 1/);
  draft.goals[0].reviewStatus = 'accepted';
  draft.goals[0].objectives[0].reviewStatus = 'pending';
  expect(() => normalizeNarrivaPlanDraft(draft, { finalize: true })).toThrow(/Accept, edit, or remove objective 1.1/);
  draft.goals[0].objectives[0].reviewStatus = 'edited';
  expect(normalizeNarrivaPlanDraft(draft, { finalize: true }).goals[0]).toMatchObject({
    reviewStatus: 'accepted', objectives: [expect.objectContaining({ reviewStatus: 'edited' })]
  });
});
