import { normalizeTreatmentPlanDiagnoses } from './treatmentPlanPrecedence.service.js';
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
const reviewState = value => ['pending', 'accepted', 'edited'].includes(value) ? value : null;
const withoutReviewPreamble = value => String(value || '').replace(/^\s*(?:clinician[- ]reviewable priority|conditional on clinician review)\s*[:–—-]\s*/i, '').trim();

export function normalizeNarrivaPlanDraft(input, { finalize = false } = {}) {
  if (!input || !Array.isArray(input.goals) || input.goals.length > 20) throw planError('Enter up to 20 treatment goals.');
  if (input.goals.some(goal => !goal || !Array.isArray(goal.objectives) || goal.objectives.length > 20)) {
    throw planError('Enter up to 20 objectives per goal.');
  }
  const effectiveDate = date(input.effectiveDate);
  const draft = {
    effectiveDate,
    manualOnly: input.manualOnly === true,
    aiContentUsed: input.aiContentUsed === true,
    dischargeNeedsReview: input.dischargeNeedsReview === true,
    dischargeReviewDeferred: input.dischargeReviewDeferred === true,
    presentingProblem: bounded(input.presentingProblem, 16000),
    // Preserve the original imported narrative when the reviewed draft is saved.
    prescribedFrequency: String(input.prescribedFrequency || '').trim(),
    dischargePlan: bounded(input.dischargePlan, 16000),
    diagnosticJustification: bounded(input.diagnosticJustification, 16000),
    legacyDiagnosisNarrative: bounded(input.legacyDiagnosisNarrative, 16000),
    diagnoses: normalizeTreatmentPlanDiagnoses(input.diagnoses).slice(0, 20),
    goals: input.goals.map((goal, gi) => ({
      goalIndex: gi + 1, goalText: bounded(goal.goalText, 6000), durationMonths: months(goal.durationMonths),
      projectedCompletion: date(goal.projectedCompletion), reviewStatus: reviewState(goal.reviewStatus),
      objectives: goal.objectives.map((objective, oi) => {
        if (!objective) throw planError('Each objective must include its plan details.');
        const scaleExemption = bounded(objective.scaleExemption, 230);
        const skipScale=objective.skipScale===true || !!scaleExemption;
        const current = skipScale ? null : safeScale(objective.scaleCurrent);
        const target = skipScale ? null : safeScale(objective.scaleTarget);
        return {
          objectiveIndex: oi + 1, objectiveText: bounded(objective.objectiveText, 6000),
          durationMonths: months(objective.durationMonths), projectedCompletion:date(objective.projectedCompletion),
          skipScale, scaleExemption, scaleCurrent: current, scaleTarget: target,
          scaleDirection: !skipScale && ['increase', 'decrease'].includes(objective.scaleDirection) ? objective.scaleDirection : null,
          measurementMethod: skipScale ? `Alternate measure: ${scaleExemption}`.trim() : (pair(current,target) ? '1–10 scale (client self-report)' : null),
          interventions: [...new Set((Array.isArray(objective.interventions) ? objective.interventions : []).slice(0,30).map(interventionText).filter(Boolean))],
          kioskPrompt: skipScale ? null : bounded(objective.kioskPrompt,500) || null,
          kioskPromptOther: skipScale ? null : bounded(objective.kioskPromptOther,500) || null,
          reviewStatus: reviewState(objective.reviewStatus)
        };
      })
    }))
  };
  if (finalize) {
    validateNarrivaPlan(draft);
    for (const goal of draft.goals) goal.projectedCompletion=goal.objectives.map(o=>o.projectedCompletion).sort().at(-1);
  }
  return draft;
}

function validateNarrivaPlan(draft) {
  if (!draft.effectiveDate) throw planError('Choose an effective date.');
  if (!draft.presentingProblem) throw planError('Enter the presenting problem.');
  if (!draft.diagnoses.length) throw planError('Select a diagnosis or documented reason for the encounter.');
  const missingJustification = draft.diagnoses.find(diagnosis => !diagnosis.justification);
  if (missingJustification) throw planError(`Enter clinical justification for ${missingJustification.icd10Code}.`);

  if (!draft.prescribedFrequency) throw planError('Select or enter the prescribed frequency.');
  if (!draft.dischargePlan) throw planError('Enter the discharge criteria.');

  let scaledObjectives = 0;
  for (const goal of draft.goals) {
    const index = goal.goalIndex;
    if (!goal.goalText || !goal.objectives.length) throw planError(`Enter goal ${index} and at least one objective.`);
    if (goal.reviewStatus === 'pending') throw planError(`Accept, edit, or remove goal ${index}.`);
    for (const objective of goal.objectives) {
      const label = `Objective ${index}.${objective.objectiveIndex}`;
      if (!objective.objectiveText) throw planError(`${label} needs a statement.`);
      if (!objective.projectedCompletion || objective.projectedCompletion < draft.effectiveDate) throw planError(`${label} needs a target date on or after the effective date.`);
      if (objective.reviewStatus === 'pending') throw planError(`Accept, edit, or remove ${label.toLowerCase()}.`);
      if (objective.skipScale) continue;
      if (!pair(objective.scaleCurrent, objective.scaleTarget)) throw planError(`${label} needs different baseline and target scores from 1 to 10.`);
      const direction = objective.scaleCurrent < objective.scaleTarget ? 'increase' : 'decrease';
      if (objective.scaleDirection !== direction) throw planError(`${label} needs a direction that matches the baseline and target.`);
      scaledObjectives++;
    }
  }
  if (scaledObjectives < 2) throw planError('Keep at least two objectives with a 1–10 scale.');
}

export async function suggestNarrivaPlanDraft({ input, includeOther = false, completePlan = false, revision = '', intakeEvidence = '', writingGuidance = '', action = '', generate = callGeminiText }) {
  const draft = normalizeNarrivaPlanDraft(input);
  if (completePlan) {
    while (draft.goals.length < 3) draft.goals.push({ goalText:'', objectives:[] });
    const alreadyScaled = draft.goals.flatMap(goal => goal.objectives).filter(objective => !objective.skipScale).length;
    let scalesToAdd = Math.max(0, 2 - alreadyScaled);
    for (const goal of draft.goals) {
      if (!goal.objectives.length) goal.objectives.push({ objectiveText: '', interventions: [], skipScale: scalesToAdd-- <= 0 });
    }
  }
  const revisionThemes = clinicalThemes(revision);
  const goals = draft.goals.map((goal, gi) => ({ ref:String(gi+1), themes:clinicalThemes(goal.goalText), needsTitle:!goal.goalText || action === 'update_goal' }));
  const objectives = draft.goals.flatMap((goal, gi) => goal.objectives.map((objective, oi) => ({
    ...anonymousObjective(objective,`${gi+1}.${oi+1}`),
    goalThemes: clinicalThemes(goal.goalText),
    interventionThemes: clinicalThemes(objective.interventions.join(' ')),
    durationMonths: objective.durationMonths || goal.durationMonths,
    alternateMeasure: objective.skipScale === true,
    includeOther, needsObjective: !objective.objectiveText
  })));
  if (!objectives.length || objectives.length > 30) throw planError('Add 1–30 objectives, or use the rewrite on a single objective.');
  const result = await generate({
    prompt: `${writingGuidance}

For this response, prepare suggestions for an outpatient treatment plan using the anonymous themes below. Return exactly one entry for every supplied objective ref. Use the supplied goal refs to write a distinct, clinically appropriate goal title wherever needsTitle is true. Write each statement directly as clinical plan text. Omit boilerplate about clinician review or draft status. Do not assert new clinical facts. Keep the stated measurement choice for every objective. Apply the clinician’s revision themes where they support the documented plan. Preserve clinical intent and rewrite each objective into a concise, observable action with a specific frequency, measurable success criterion, and timeframe. Draft a revised objective instead of repeating the input’s measurement. Preserve documented scores and use no invented facts. Suggest linked interventions without dates/durations, a duration of 1–36 months per objective, and a natural client 1–10 question with concrete anchors. Add a third-person question only when includeOther is true. When alternateMeasure is true, preserve it and omit numeric scales and questions. Never supply a baseline or imply an observed score, symptom, diagnosis, or response that was not provided. Return only JSON {"goals":[{"ref":"3","goalText":"..."}],"objectives":[{"ref":"1.1","objectiveText":"...","target":8,"durationMonths":3,"interventions":["..."],"clientQuestion":"...","otherQuestion":"..."}],"dischargePlan":"short measurable criteria and discharge planning"}.
${JSON.stringify({ action, goals, objectives, presentingThemes: clinicalThemes(draft.presentingProblem), intakeThemes: clinicalThemes(intakeEvidence), revisionThemes })}`,
    ...clinicalNoteModelOptions(), vertexOnly:true, sensitive:true, temperature:0.2, maxOutputTokens:8192, jsonMode:true
  });
  let proposed;
  try { proposed = JSON.parse(String(result?.text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g,'')); }
  catch { throw Object.assign(new Error('Narriva returned an unreadable plan suggestion. Retry or continue editing manually.'),{status:502}); }
  const proposals = new Map((Array.isArray(proposed?.objectives) ? proposed.objectives : []).filter(item=>item?.ref).map(item=>[String(item.ref),item]));
  if (![...proposals.keys()].some(ref=>objectives.some(objective=>objective.ref===ref))) {
    throw Object.assign(new Error('Narriva did not return a suggestion for these objectives.'),{status:502});
  }
  const proposedGoals = new Map((Array.isArray(proposed?.goals) ? proposed.goals : []).filter(item=>item?.ref).map(item=>[String(item.ref),item]));
  return {
    goals: goals.filter(goal=>goal.needsTitle).map(goal=>({
      ref:goal.ref,
      goalText:withoutReviewPreamble(bounded(proposedGoals.get(goal.ref)?.goalText,6000))
        || (!action && draft.goals[Number(goal.ref)-1].objectives[0]?.objectiveText
          ? 'Build skills for the treatment priority described in the objective'
          : (action ? '' : revisionThemes[0] ? `Build skills for ${revisionThemes[0]}` : 'Practice a strategy for a treatment priority agreed with the client'))
    })),
    objectives: objectives.map(objective => {
      const draftSuggestion = proposals.get(objective.ref);
      if (!draftSuggestion && !objective.needsObjective && !completePlan) return {ref:objective.ref};
      const duration = objective.durationMonths || months(draftSuggestion?.durationMonths) || 3;
      const suggestion = completePlan && objective.needsObjective && !bounded(draftSuggestion?.objectiveText,6000) ? {
        objectiveText: `Practice a skill for the agreed treatment priority each week over the next ${duration} months and review progress at follow-up.`,
        target: 8
      } : draftSuggestion || {};
      const suggestedTarget = safeScale(suggestion.target);
      const target = objective.alternateMeasure ? null : objective.target ??
        (Number.isInteger(suggestedTarget) && suggestedTarget !== objective.current ? suggestedTarget : objective.current === 8 ? 9 : 8);
      const anchors = scaleAnchorLabels(objective.themes.join(' '), objective.current != null && target < objective.current ? 'decrease' : 'increase');
      return {
        ref: objective.ref, objectiveText:withoutReviewPreamble(bounded(suggestion.objectiveText,6000)), target,
        skipScale: objective.alternateMeasure,
        durationMonths: duration,
        interventions: (Array.isArray(suggestion.interventions) ? suggestion.interventions : []).slice(0,12).map(interventionText).filter(Boolean),
        clientQuestion: objective.alternateMeasure ? '' : bounded(suggestion.clientQuestion,400) || `Where are you today on this objective from 1 (${anchors.one}) to 10 (${anchors.ten})?`,
        otherQuestion: objective.alternateMeasure || !objective.includeOther ? '' : bounded(suggestion.otherQuestion,400)
      };
    }),
    dischargePlan: withoutReviewPreamble(bounded(proposed.dischargePlan,16000))
  };
}
