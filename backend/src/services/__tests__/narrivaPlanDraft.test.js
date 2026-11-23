import {expect,it,vi} from 'vitest';
import {normalizeNarrivaPlanDraft,suggestNarrivaPlanDraft} from '../narrivaPlanDraft.service.js';

const objective=(text, fields={})=>({
  objectiveText:text, projectedCompletion:'2027-02-23', scaleCurrent:4,scaleTarget:8, kioskPrompt:'Where are you today on a 1–10 scale?',
  interventions:['Practice grounding; Estimated completion: January 2027'], ...fields
});
const plan = () => ({effectiveDate:'2026-11-23',dischargePlan:'Review readiness with the client.',presentingProblem:'Pat Synthetic reports worry.',
  goals:[{goalText:'Manage anxiety',objectives:[objective('Practice emotion regulation')]},{goalText:'Improve communication',objectives:[objective('Private: Pat Synthetic will practice communication')]}]});

it('requires two distinct scaled goals and keeps the alternate-measure reason, objective dates and linked interventions',()=>{
 const draft=plan();
 draft.goals[0].objectives.push(objective('Complete enrollment form',{skipScale:true,scaleExemption:'Track completion of the form'}));
 const normalized=normalizeNarrivaPlanDraft(draft,{finalize:true});
 expect(normalized.goals[0].projectedCompletion).toBe('2027-02-23');
 expect(normalized.goals[0].objectives[1]).toMatchObject({scaleCurrent:null,kioskPrompt:null,measurementMethod:'Alternate measure: Track completion of the form',interventions:['Practice grounding']});
 draft.goals[1].objectives[0]={...draft.goals[1].objectives[0],skipScale:true,scaleExemption:'Use session completion'};
 expect(()=>normalizeNarrivaPlanDraft(draft,{finalize:true})).toThrow(/two separate goals/);
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
