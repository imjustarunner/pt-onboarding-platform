import { clinicalNoteModelOptions } from '../config/clinicalNoteModel.js';
import { callGeminiText } from './geminiText.service.js';
import { anonymousObjective, clinicalThemes, safeScale } from './treatmentPlanAiContext.service.js';
import { scaleAnchorLabels } from './treatmentPlanObjectiveNormalize.service.js';

const bounded = (value, limit) => String(value || '').trim().slice(0, limit);
const planError = message => Object.assign(new Error(message), {status:400, code:'PLAN_DRAFT_REVIEW_REQUIRED'});
const months = value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 36 ? Number(value) : null;
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0,10)===value ? value : null;
}
const pair = (current, target) => Number.isInteger(current) && Number.isInteger(target) && current !== target;
const interventionText = value => bounded(value,500)
  .replace(/(?:\s*[·;|]\s*|\s+|^)(?:estimated|projected) completion(?: date)?\s*[:–-].*$/i,'').trim();
const noScale = reason => reason ? `Alternate measure: ${reason}` : null;

export function normalizeNarrivaPlanDraft(input, { finalize = false } = {}) {
  if (!input || !Array.isArray(input.goals) || input.goals.length > 20) throw planError('Enter up to 20 treatment goals.');
  if (input.goals.some(goal => !goal || !Array.isArray(goal.objectives) || goal.objectives.length > 20)) {
    throw planError('Enter up to 20 objectives per goal.');
  }
  const effectiveDate = date(input.effectiveDate);
  const draft = {
    effectiveDate,
    presentingProblem: bounded(input.presentingProblem, 16000),
    prescribedFrequency: bounded(input.prescribedFrequency, 2000),
    dischargePlan: bounded(input.dischargePlan, 16000),
    diagnosticJustification: bounded(input.diagnosticJustification, 16000),
    diagnoses: (Array.isArray(input.diagnoses) ? input.diagnoses : []).slice(0,20).filter(row=>row && bounded(row.icd10Code,16)).map(row=>({
      icd10Code:bounded(row.icd10Code,16), description:bounded(row.description,500), isPrimary:row.isPrimary===true
    })),
    goals: input.goals.map((goal, gi) => ({
      goalIndex: gi + 1, goalText: bounded(goal.goalText, 6000), durationMonths: months(goal.durationMonths),
      projectedCompletion: date(goal.projectedCompletion), reviewed:goal.reviewed===true,
      objectives: goal.objectives.map((objective, oi) => {
        if (!objective) throw planError('Each objective must include its plan details.');
        const scaleExemption = bounded(objective.scaleExemption, 350);
        const skipScale=objective.skipScale===true || !!scaleExemption;
        const current = skipScale ? null : safeScale(objective.scaleCurrent);
        const target = skipScale ? null : safeScale(objective.scaleTarget);
        return {
          objectiveIndex: oi + 1, objectiveText: bounded(objective.objectiveText, 6000),
          durationMonths: months(objective.durationMonths), projectedCompletion:date(objective.projectedCompletion),
          skipScale, scaleExemption, scaleCurrent: current, scaleTarget: target,
          scaleDirection: pair(current,target) ? current < target ? 'increase' : 'decrease' : null,
          measurementMethod: noScale(scaleExemption) || (pair(current,target) ? '1–10 scale (client self-report)' : null),
          interventions: [...new Set((Array.isArray(objective.interventions) ? objective.interventions : []).slice(0,30).map(interventionText).filter(Boolean))],
          kioskPrompt: skipScale ? null : bounded(objective.kioskPrompt,500) || null,
          kioskPromptOther: skipScale ? null : bounded(objective.kioskPromptOther,500) || null,
          reviewed:objective.reviewed===true
        };
      })
    }))
  };
  const primary = draft.diagnoses.find(item=>item.isPrimary) || draft.diagnoses[0];
  if (primary) {
    draft.diagnoses=[primary,...draft.diagnoses.filter(item=>item!==primary)];
    draft.diagnoses.forEach((item,index)=>{ item.isPrimary=index===0; });
  }
  if (finalize) {
    validateNarrivaPlan(draft);
    for (const goal of draft.goals) goal.projectedCompletion=goal.objectives.map(o=>o.projectedCompletion).sort().at(-1);
  }
  return draft;
}

function validateNarrivaPlan(draft) {
  if (!draft.effectiveDate || !draft.dischargePlan) throw planError('Enter an effective date and discharge criteria.');
  let scaledGoals = 0;
  for (const goal of draft.goals) {
    if (!goal.goalText || !goal.objectives.length) throw planError(`Enter goal ${goal.goalIndex} and at least one objective.`);
    if (goal.objectives.some(objective=>!objective.objectiveText || !objective.projectedCompletion || objective.projectedCompletion < draft.effectiveDate ||
      (!objective.scaleExemption && (!pair(objective.scaleCurrent,objective.scaleTarget) || !objective.kioskPrompt)))) {
      throw planError(`Complete the objective text and target dates for goal ${goal.goalIndex}. Enter a 1–10 scale and client question or specify an alternate measure.`);
    }
    if (goal.objectives.some(objective=>pair(objective.scaleCurrent,objective.scaleTarget))) scaledGoals++;
  }
  if (scaledGoals < 2) throw planError('At least two separate goals need a 1–10 objective.');
}

export async function suggestNarrivaPlanDraft({ input, includeOther = false, generate = callGeminiText }) {
  const draft = normalizeNarrivaPlanDraft(input);
  const objectives = draft.goals.flatMap((goal, gi) => goal.objectives.map((objective, oi) => ({
    ...anonymousObjective(objective,`${gi+1}.${oi+1}`),
    goalThemes: clinicalThemes(goal.goalText),
    interventionThemes: clinicalThemes(objective.interventions.join(' ')),
    durationMonths: objective.durationMonths || goal.durationMonths,
    alternateMeasure: !!objective.scaleExemption,
    includeOther: includeOther || !!objective.kioskPromptOther
  })));
  if (!objectives.length || objectives.length > 30) throw planError('Add 1–30 objectives, or use the rewrite on a single objective.');
  const result = await generate({
    prompt: `Prepare suggestions for an outpatient treatment plan using the anonymous themes below. Use the exact objective refs. Keep existing clinical intent. Suggest measurable language, linked interventions without dates/durations, a duration of 1–36 months per objective, and a natural client 1–10 question with concrete anchors. Add a third-person question only when includeOther is true. When alternateMeasure is true, preserve it and omit numeric scales and questions. Never supply a baseline or imply an observed score, symptom, diagnosis, or response that was not provided. Return only JSON {"objectives":[{"ref":"1.1","objectiveText":"...","target":8,"durationMonths":3,"interventions":["..."],"clientQuestion":"...","otherQuestion":"..."}],"dischargePlan":"short measurable draft criteria and planning, conditional on clinician review"}.
${JSON.stringify({ objectives, presentingThemes: clinicalThemes(draft.presentingProblem) })}`,
    ...clinicalNoteModelOptions(), vertexOnly:true, sensitive:true, temperature:0.2, maxOutputTokens:8192, jsonMode:true
  });
  let proposed;
  try { proposed = JSON.parse(String(result?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g,'')); }
  catch { throw Object.assign(new Error('Narriva returned an unreadable plan suggestion. Retry or continue editing manually.'),{status:502}); }
  const proposals = new Map((Array.isArray(proposed?.objectives) ? proposed.objectives : []).filter(item=>item?.ref).map(item=>[String(item.ref),item]));
  if (![...proposals.keys()].some(ref=>objectives.some(objective=>objective.ref===ref))) {
    throw Object.assign(new Error('Narriva did not return a suggestion for these objectives.'),{status:502});
  }
  return {
    objectives: objectives.map(objective => {
      const suggestion = proposals.get(objective.ref);
      if (!suggestion) return {ref:objective.ref};
      const target = objective.alternateMeasure ? null : objective.target ?? safeScale(suggestion.target);
      const anchors = scaleAnchorLabels(objective.themes.join(' '), objective.current != null && target < objective.current ? 'decrease' : 'increase');
      return {
        ref: objective.ref, objectiveText:bounded(suggestion.objectiveText,6000), target,
        durationMonths: objective.durationMonths || months(suggestion.durationMonths),
        interventions: (Array.isArray(suggestion.interventions) ? suggestion.interventions : []).slice(0,12).map(interventionText).filter(Boolean),
        clientQuestion: objective.alternateMeasure ? '' : bounded(suggestion.clientQuestion,400) || `Where are you today on this objective from 1 (${anchors.one}) to 10 (${anchors.ten})?`,
        otherQuestion: objective.alternateMeasure || !objective.includeOther ? '' : bounded(suggestion.otherQuestion,400)
      };
    }),
    dischargePlan: bounded(proposed.dischargePlan,16000)
  };
}
