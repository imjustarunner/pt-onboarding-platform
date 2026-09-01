/**
 * Treatment-plan clinical fields take precedence over intake when both exist.
 * Note Aid imports use source_tool_id = note_aid_plan_import.
 */

export const NOTE_AID_PLAN_IMPORT_TOOL = 'note_aid_plan_import';

export function isNoteAidPlanImport(plan) {
  return String(plan?.source_tool_id || plan?.sourceToolId || '').trim() === NOTE_AID_PLAN_IMPORT_TOOL;
}

export function isIntakeAutoTreatmentPlan(plan) {
  const title = String(plan?.title || '');
  return /^Intake Treatment Plan/i.test(title);
}

/**
 * Prefer Note Aid imported plans, then any non-intake auto-draft, else null.
 * @param {Array<object>} plans
 * @returns {object|null}
 */
  export function pickAuthoritativeTreatmentPlan(plans = []) {
  const list = (Array.isArray(plans) ? plans : []).filter(Boolean);
  if (!list.length) return null;
  const imported = list.find((p) => isNoteAidPlanImport(p));
  if (imported) return imported;
  const nonIntake = list.find((p) => !isIntakeAutoTreatmentPlan(p));
  return nonIntake || null;
}

/** Extract Presenting Problem block from plan.discharge_plan text. */
export function presentingProblemFromPlan(plan) {
  const raw = String(plan?.discharge_plan || plan?.dischargePlan || '').trim();
  if (!raw) {
    return String(plan?.presenting_problem || plan?.presentingProblem || '').trim() || null;
  }
  const m = raw.match(/Presenting Problem\n([\s\S]*?)(?=\n\n(?:Prescribed Frequency|Discharge Criteria)|$)/i);
  if (m) return String(m[1] || '').trim() || null;
  return null;
}

/**
 * Resolve which diagnosis row should display as primary given an authoritative plan.
 * Plan primary_diagnosis_id + diagnostic_justification win over intake-promoted is_primary flags.
 */
export function resolvePrimaryDiagnosisForChart({ diagnoses = [], plan = null } = {}) {
  const list = (Array.isArray(diagnoses) ? diagnoses : []).filter(
    (d) => d && (d.is_active == null || Number(d.is_active) === 1)
  );
  const planId = Number(plan?.primary_diagnosis_id || plan?.primaryDiagnosisId || 0);
  const planJust = String(plan?.diagnostic_justification || plan?.diagnosticJustification || '').trim();
  if (planId) {
    const hit = list.find((d) => Number(d.id) === planId);
    if (hit) {
      return {
        ...hit,
        is_primary: 1,
        justification: planJust || hit.justification || null
      };
    }
  }
  const flagged = list.find((d) => Number(d.is_primary) === 1);
  if (flagged) {
    return {
      ...flagged,
      justification: planJust || flagged.justification || null
    };
  }
  return list[0] || null;
}
