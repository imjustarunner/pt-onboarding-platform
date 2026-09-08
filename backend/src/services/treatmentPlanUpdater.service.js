import clinicalPool from '../config/clinicalDatabase.js';
import { callGeminiText } from './geminiText.service.js';
import { suggestDischargeCriteria } from './treatmentPlanObjectiveNormalize.service.js';

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function loadRecentSignedNotes({ agencyId, clientId, sinceDate = null, limit = 8 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 8, 1), 20);
  const params = [Number(clientId), Number(agencyId)];
  let sql = `
    SELECT n.id, n.title, n.note_type, n.provider_signed_at, n.note_payload, n.metadata_json,
           cs.service_code, cs.scheduled_start_at
    FROM clinical_notes n
    LEFT JOIN clinical_sessions cs ON cs.id = n.clinical_session_id
    WHERE n.client_id = ?
      AND n.agency_id = ?
      AND n.is_deleted = 0
      AND n.provider_signed_at IS NOT NULL
  `;
  if (sinceDate) {
    sql += ' AND n.provider_signed_at >= ?';
    params.push(sinceDate);
  }
  sql += ` ORDER BY n.provider_signed_at DESC LIMIT ${lim}`;
  try {
    const [rows] = await clinicalPool.execute(sql, params);
    return rows || [];
  } catch {
    return [];
  }
}

function noteExcerpt(row, max = 900) {
  const payload = String(row?.note_payload || '');
  // Skip encrypted blobs
  if (payload.startsWith('enc:') || payload.length < 20) {
    return String(row?.title || '').slice(0, 200);
  }
  return payload.replace(/\s+/g, ' ').trim().slice(0, max);
}

function serializeCurrentPlan(plan = {}) {
  const goals = Array.isArray(plan.goals) ? plan.goals : [];
  return {
    presentingProblem: plan.presentingProblem || plan.presenting_problem || '',
    prescribedFrequency: plan.prescribedFrequency || plan.prescribed_frequency || '',
    dischargePlan: plan.dischargePlan || plan.discharge_criteria || '',
    diagnosticJustification: plan.diagnosticJustification || plan.diagnostic_justification || '',
    diagnoses: (plan.diagnoses || []).map((d) => ({
      icd10Code: d.icd10Code || d.icd10_code || '',
      description: d.description || '',
      isPrimary: !!(d.isPrimary ?? d.is_primary)
    })),
    goals: goals.map((g, gi) => ({
      goalText: g.goalText || g.goal_text || '',
      durationMonths: g.durationMonths ?? g.duration_months ?? null,
      objectives: (g.objectives || []).map((o) => ({
        objectiveText: o.objectiveText || o.objective_text || '',
        scaleCurrent: o.scaleCurrent ?? o.scale_current ?? null,
        scaleTarget: o.scaleTarget ?? o.scale_target ?? null,
        scaleDirection: o.scaleDirection || o.scale_direction || null,
        lastRating: o.lastRating ?? o.last_rating ?? null
      })),
      index: gi + 1
    }))
  };
}

/**
 * Session-aware treatment plan updater.
 * Uses recent signed notes + current plan + provider narrative / paste rewrite source.
 * Returns a structured proposed plan for provider review (never auto-applied).
 */
export async function proposeTreatmentPlanUpdate({
  agencyId,
  clientId,
  currentPlan = null,
  providerNarrative = '',
  pasteRewriteSource = '',
  progressExcerpt = '',
  renewalReason = '',
  sinceDate = null
} = {}) {
  const plan = serializeCurrentPlan(currentPlan || {});
  const notes = await loadRecentSignedNotes({
    agencyId,
    clientId,
    sinceDate: sinceDate || currentPlan?.effectiveDate || currentPlan?.effective_date || currentPlan?.signed_at || null,
    limit: 8
  });
  const sessionLines = notes.map((n, i) => {
    const dos = String(n.scheduled_start_at || n.provider_signed_at || '').slice(0, 10);
    const code = n.service_code || '';
    return `Session ${i + 1} (${dos}${code ? ` · ${code}` : ''}): ${noteExcerpt(n)}`;
  });

  const prompt = `You are a clinical treatment planner updating an outpatient mental health treatment plan.

Rules:
- Propose an UPDATED plan based on progress since the last plan.
- Keep goals/objectives that remain relevant; revise text/scales when recent sessions show progress or stall.
- If session content indicates a new clinical focus (e.g. anxiety) that is missing, ADD a scaled goal + objective.
- Merge provider narrative change requests.
- If pasteRewriteSource is provided, treat it as the full desired plan content to rewrite into structured goals (do NOT invent unrelated content).
- Always include discharge criteria.
- Use 1–10 scales on every objective (current → target) with clear direction.
- Respond with JSON only. No markdown.

Provider renewal reason: ${String(renewalReason || '').slice(0, 800) || '(none)'}
Provider narrative changes: ${String(providerNarrative || '').slice(0, 2000) || '(none)'}
Progress excerpt: ${String(progressExcerpt || '').slice(0, 2000) || '(none)'}
Paste rewrite source (whole document, optional): ${String(pasteRewriteSource || '').slice(0, 8000) || '(none)'}

Current plan JSON:
${JSON.stringify(plan).slice(0, 8000)}

Recent signed sessions (newest first):
${sessionLines.join('\n').slice(0, 10000) || '(none)'}

Respond JSON shape:
{
  "presentingProblem": "...",
  "prescribedFrequency": "...",
  "diagnosticJustification": "...",
  "dischargePlan": "...",
  "diagnoses": [{"icd10Code":"","description":"","isPrimary":true}],
  "goals": [{
    "goalText":"...",
    "durationMonths": 3,
    "objectives":[{
      "objectiveText":"...",
      "scaleCurrent": 7,
      "scaleTarget": 3,
      "scaleDirection": "decrease"
    }]
  }],
  "changeSummary": "short bullet-like paragraph of what changed and why"
}`;

  let proposed = null;
  try {
    const gemini = await callGeminiText({
      prompt,
      temperature: 0.25,
      maxOutputTokens: 4096
    });
    proposed = parseJsonObject(gemini?.text);
  } catch (e) {
    console.warn('[treatmentPlanUpdater] AI failed', e?.message || e);
  }

  if (!proposed || !Array.isArray(proposed.goals) || !proposed.goals.length) {
    // Fallback: keep current plan structure, only refresh discharge if missing.
    const discharge = plan.dischargePlan
      ? null
      : await suggestDischargeCriteria({
        presentingProblem: plan.presentingProblem,
        diagnoses: plan.diagnoses,
        goals: plan.goals,
        prescribedFrequency: plan.prescribedFrequency
      });
    return {
      proposed: {
        ...plan,
        dischargePlan: plan.dischargePlan || discharge?.dischargePlan || '',
        effectiveDate: new Date().toISOString().slice(0, 10)
      },
      changeSummary: String(providerNarrative || renewalReason || progressExcerpt || '').trim()
        || 'Review current goals against recent sessions and update as needed.',
      source: proposed ? 'ai_partial' : 'fallback',
      sessionsConsidered: notes.length,
      aiUsed: !!proposed
    };
  }

  if (!String(proposed.dischargePlan || '').trim()) {
    const discharge = await suggestDischargeCriteria({
      presentingProblem: proposed.presentingProblem || plan.presentingProblem,
      diagnoses: proposed.diagnoses || plan.diagnoses,
      goals: proposed.goals,
      prescribedFrequency: proposed.prescribedFrequency || plan.prescribedFrequency
    });
    proposed.dischargePlan = discharge?.dischargePlan || plan.dischargePlan || '';
  }

  return {
    proposed: {
      effectiveDate: new Date().toISOString().slice(0, 10),
      presentingProblem: String(proposed.presentingProblem || plan.presentingProblem || ''),
      prescribedFrequency: String(proposed.prescribedFrequency || plan.prescribedFrequency || ''),
      diagnosticJustification: String(proposed.diagnosticJustification || plan.diagnosticJustification || ''),
      dischargePlan: String(proposed.dischargePlan || ''),
      diagnoses: Array.isArray(proposed.diagnoses) && proposed.diagnoses.length
        ? proposed.diagnoses
        : plan.diagnoses,
      goals: proposed.goals.map((g) => ({
        goalText: String(g.goalText || ''),
        durationMonths: Number(g.durationMonths) || null,
        objectives: (g.objectives || []).map((o) => ({
          objectiveText: String(o.objectiveText || ''),
          scaleCurrent: Number(o.scaleCurrent) || null,
          scaleTarget: Number(o.scaleTarget) || null,
          scaleDirection: o.scaleDirection || null,
          measurementMethod: '1–10 scale (client self-report)'
        }))
      }))
    },
    changeSummary: String(proposed.changeSummary || '').trim(),
    source: 'ai',
    sessionsConsidered: notes.length,
    aiUsed: true
  };
}

export default { proposeTreatmentPlanUpdate };
