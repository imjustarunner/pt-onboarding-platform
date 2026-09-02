/**
 * Progress relative to measurable objective goal (1–10).
 * Closer to target = progressing; at target = improved; farther = regressed.
 */
export function distanceToGoal(value, target) {
  if (value == null || target == null) return null;
  const v = Number(value);
  const t = Number(target);
  if (!Number.isFinite(v) || !Number.isFinite(t)) return null;
  return Math.abs(v - t);
}

export function computeProgressLabel({ previousValue, newValue, target }) {
  if (newValue == null || target == null) return null;
  const n = Number(newValue);
  const t = Number(target);
  if (!Number.isFinite(n) || !Number.isFinite(t)) return null;
  if (n === t) return 'improved';
  if (previousValue == null || previousValue === '') return 'unchanged';
  const prevDist = distanceToGoal(previousValue, t);
  const nextDist = distanceToGoal(n, t);
  if (prevDist == null || nextDist == null) return 'unchanged';
  if (nextDist < prevDist) return 'progressing';
  if (nextDist > prevDist) return 'regressed';
  return 'unchanged';
}

export function kioskPromptForObjective(obj = {}) {
  const custom = String(obj.kiosk_prompt || obj.kioskPrompt || '').trim();
  if (custom) return custom;
  const text = String(obj.objective_text || obj.objectiveText || 'this treatment goal').trim().slice(0, 180);
  const target = Number(obj.scale_target ?? obj.scaleTarget);
  const highIsBetter = !Number.isFinite(target) || target >= 5.5;
  const ten = highIsBetter ? 'at or closest to your goal' : 'farthest from your goal';
  const one = highIsBetter ? 'farthest from your goal' : 'at or closest to your goal';
  return `On a scale of 1–10, with 10 being ${ten} and 1 being ${one}, how would you rate yourself since the last session for: ${text}`;
}

export function kioskPromptOtherForObjective(obj = {}, clientName = 'the client') {
  const custom = String(obj.kiosk_prompt_other || obj.kioskPromptOther || '').trim();
  if (custom) return custom;
  const who = String(clientName || 'the client').trim() || 'the client';
  const text = String(obj.objective_text || obj.objectiveText || 'this treatment goal').trim().slice(0, 180);
  const target = Number(obj.scale_target ?? obj.scaleTarget);
  const highIsBetter = !Number.isFinite(target) || target >= 5.5;
  const ten = highIsBetter ? 'at or closest to their goal' : 'farthest from their goal';
  const one = highIsBetter ? 'farthest from their goal' : 'at or closest to their goal';
  return `On a scale of 1–10, with 10 being ${ten} and 1 being ${one}, how would you rate ${who} since the last session for: ${text}`;
}

export function startScaleValue(obj = {}) {
  const n = Number(obj.scale_start ?? obj.scaleStart);
  return Number.isFinite(n) ? n : null;
}

/** Strip duplicated "Objective 1.1" / "Treatment Goal 2" prefixes from body copy. */
export function stripPlanHeadingPrefix(text) {
  return String(text || '')
    .replace(/^(?:treatment\s+)?goal\s+\d+\s*[:.\-)\]\s—–-]*\s*/i, '')
    .replace(/^(?:objective|obj)\s+\d+(?:\.\d+)?\s*[:.\-)\]\s—–-]*\s*/i, '')
    .replace(/\bTreatment\s+Goal(?:\s+\d+)?\b[:.\-)\]\s—–-]*/gi, '')
    .replace(/\bTreatment\s+Strategy\s*\/\s*Intervention\b[:.\-)\]\s—–-]*/gi, '')
    .replace(/\bTreatment\s+Strategy\b[:.\-)\]\s—–-]*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function progressLabelCopy(label) {
  switch (label) {
    case 'improved':
      return 'Improved — at goal. Consider updating the treatment plan.';
    case 'progressing':
      return 'Progressing — closer to the goal than the last rating.';
    case 'regressed':
      return 'Regressed — farther from the goal than the last rating.';
    case 'unchanged':
      return 'Unchanged — same distance from the goal.';
    default:
      return '';
  }
}

/** Active (non-superseded) goals/objectives from a latestPlan payload. */
export function activePlanGoals(latestPlan) {
  const goals = Array.isArray(latestPlan?.goals) ? latestPlan.goals : [];
  return goals
    .filter((g) => !g.superseded_at && String(g.status || 'active') !== 'superseded')
    .map((g) => ({
      ...g,
      objectives: (g.objectives || []).filter(
        (o) => !o.superseded_at && String(o.status || 'active') !== 'superseded'
      )
    }))
    .filter((g) => (g.objectives || []).length > 0 || String(g.goal_text || '').trim());
}

/**
 * Initial chart setup: intake auto-drafts (status draft) do not count as a completed plan.
 */
export function isTreatmentPlanOnFileForSetup({
  planImportedOnce = false,
  latestPlan = null,
  activeGoals = null
} = {}) {
  if (planImportedOnce) return true;
  const plan = latestPlan;
  if (!plan) return false;
  const status = String(plan.status || '').toLowerCase();
  if (status === 'draft') return false;
  const goals = Array.isArray(activeGoals) ? activeGoals : activePlanGoals(plan);
  return goals.some(
    (g) => (g.objectives || []).length > 0 || String(g.goal_text || '').trim()
  );
}

export function buildTreatmentPlanContextText(latestPlan, pastedPlanText = '') {
  const pasted = String(pastedPlanText || '').trim();
  if (pasted) return pasted.slice(0, 8000);
  const goals = activePlanGoals(latestPlan);
  if (!goals.length) return '';
  const lines = [];
  for (const g of goals) {
    lines.push(`Goal ${g.goal_index || ''}: ${g.goal_text || ''}`.trim());
    for (const o of g.objectives || []) {
      const cur = o.scale_current != null ? o.scale_current : '—';
      const tgt = o.scale_target != null ? o.scale_target : '—';
      lines.push(
        `  Objective ${o.objective_index || ''}: ${o.objective_text || ''} (current ${cur} → goal ${tgt})`
      );
    }
  }
  return lines.join('\n').slice(0, 8000);
}

export function buildObjectiveRatingsContextText(entries = []) {
  const lines = [];
  for (const e of entries) {
    if (!e) continue;
    const goalBit = e.goalText ? `Goal: ${e.goalText}` : e.goal_text ? `Goal: ${e.goal_text}` : '';
    const objBit = e.objectiveText
      ? `Objective: ${e.objectiveText}`
      : e.objective_text
        ? `Objective: ${e.objective_text}`
        : '';
    if (e.disposition && e.disposition !== 'rated') {
      lines.push(`${goalBit} | ${objBit} | ${String(e.disposition).replace(/_/g, ' ')}`);
    } else if (e.scaleValue != null || e.scale_value != null) {
      const scale = e.scaleValue ?? e.scale_value;
      const target = e.scaleTarget ?? e.scale_target_at_rating ?? e.scale_target;
      const label = e.progressLabel || e.progress_label;
      const labelBit = label ? ` (${label})` : '';
      const rater = e.raterLabel || e.raterKind || e.rater_kind || 'clinical observation';
      const raterBit = String(rater) === 'clinician' ? 'clinical observation' : String(rater);
      lines.push(
        `${goalBit} | ${objBit} | ${raterBit}: rated ${scale}/10 toward goal ${target ?? '—'}${labelBit}`
      );
    }
  }
  return lines.join('\n').slice(0, 4000);
}

export function buildDiagnosisContextText(diagnoses = []) {
  const list = Array.isArray(diagnoses) ? diagnoses : [];
  const active = list.filter((d) => d && (d.is_active == null || Number(d.is_active) === 1));
  if (!active.length) return '';
  const lines = ['Diagnosis on file:'];
  for (const d of active) {
    const primary = d.is_primary || d.isPrimary ? ' (primary)' : '';
    lines.push(
      `- ${d.icd10_code || d.code || '—'}: ${d.description || ''}${primary}`.trim()
    );
  }
  return lines.join('\n').slice(0, 2000);
}

/**
 * Full Treatment Plan Writer/Updater preload: prior plan, ratings, dx, optional progress excerpt.
 */
export function buildUpdaterPrefillDocument({
  latestPlan = null,
  pastedPlanText = '',
  diagnoses = [],
  ratings = [],
  progressNoteExcerpt = '',
  renewalReason = ''
} = {}) {
  const sections = [];
  if (renewalReason) {
    sections.push(`Update reason:\n${String(renewalReason).trim()}`);
  }
  const dx = buildDiagnosisContextText(diagnoses);
  if (dx) sections.push(dx);

  const plan = buildTreatmentPlanContextText(latestPlan, pastedPlanText);
  if (plan) {
    sections.push(`Previous treatment plan (update goals/objectives and diagnostic justification as needed):\n${plan}`);
  } else {
    sections.push(
      'No structured treatment plan on file. Write a new plan from presenting problems, diagnosis, and justification below (or paste a prior plan).'
    );
  }

  const ratingLines = buildObjectiveRatingsContextText(
    (ratings || []).map((r) => ({
      goalText: r.goal_text || r.goalText,
      objectiveText: r.objective_text || r.objectiveText,
      disposition: r.disposition,
      scaleValue: r.scale_value ?? r.scaleValue,
      scaleTarget: r.scale_target_at_rating ?? r.scale_target ?? r.scaleTarget,
      progressLabel: r.progress_label || r.progressLabel
    }))
  );
  if (ratingLines) {
    sections.push(`Recent objective ratings (use to revise goals/objectives and diagnostic justification):\n${ratingLines}`);
  }

  const excerpt = String(progressNoteExcerpt || '').trim();
  if (excerpt) {
    sections.push(
      `Recent progress note excerpt (suggest goal/objective additions or revisions):\n${excerpt.slice(0, 2500)}`
    );
  }

  sections.push(
    'Instructions for updater:\n- Keep diagnosis and diagnostic justification accurate; update justification when presentation changed.\n- Revise or replace goals/objectives based on ratings and progress.\n- Objectives must remain measurable with 1–10 current → goal scales.'
  );

  return sections.filter(Boolean).join('\n\n').slice(0, 11000);
}

function formatIsoDate(raw) {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(raw).slice(0, 10);
  }
}

/**
 * Assemble attendance + plan + scaled objective history + progress excerpts + clinician blurb
 * for Treatment Summary Aid generation / printable document.
 */
export function buildTreatmentSummaryContextDocument({
  sessions = [],
  notes = [],
  latestPlan = null,
  pastedPlanText = '',
  diagnoses = [],
  objectiveRatings = [],
  progressNoteExcerpts = [],
  clinicianAdditionalText = '',
  clientStatus = ''
} = {}) {
  const sections = [];

  const sessionRows = (Array.isArray(sessions) ? sessions : []).filter(Boolean);
  const dated = sessionRows
    .map((s) => ({
      ...s,
      at: s.scheduled_start_at || s.scheduledStartAt || s.created_at || s.createdAt || null,
      duration: s.duration_minutes ?? s.durationMinutes ?? null,
      pos: s.place_of_service || s.placeOfService || (s.is_telehealth || s.isTelehealth ? 'telehealth' : ''),
      status: String(s.encounter_status || s.encounterStatus || '').toLowerCase(),
      code: s.service_code || s.serviceCode || ''
    }))
    .filter((s) => s.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  const attended = dated.filter((s) => {
    const st = s.status;
    if (!st) return true;
    return !['cancelled', 'canceled', 'no_show', 'noshow'].includes(st);
  });
  const first = attended[0];
  const last = attended[attended.length - 1];
  const durations = attended.map((s) => Number(s.duration)).filter((n) => Number.isFinite(n) && n > 0);
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  const places = [...new Set(attended.map((s) => String(s.pos || '').trim()).filter(Boolean))];
  const codes = [...new Set(attended.map((s) => String(s.code || '').trim()).filter(Boolean))];
  const statusHint = String(clientStatus || '').toLowerCase();
  const ongoing = statusHint.includes('terminat') || statusHint.includes('discharg')
    ? 'Services appear closed / terminated based on client status.'
    : (attended.length && last
      ? `Most recent session on file: ${formatIsoDate(last.at)}. Treat as ongoing unless the clinician states otherwise.`
      : 'Ongoing status unknown — use clinician additional information.');

  const attendanceLines = [
    'ATTENDANCE AND SERVICE HISTORY (from chart — do not invent counts or dates):',
    `- Sessions on file (non-cancelled): ${attended.length}`,
    first ? `- Date services began (earliest session): ${formatIsoDate(first.at)}` : '- Date services began: not on file',
    last ? `- Most recent session: ${formatIsoDate(last.at)}` : null,
    avgDuration != null ? `- Average session duration (minutes, when recorded): ${avgDuration}` : '- Average duration: not on file',
    places.length ? `- Places of service / modality: ${places.join(', ')}` : '- Place of service: not on file',
    codes.length ? `- Service codes seen: ${codes.join(', ')}` : null,
    `- Ongoing vs closed: ${ongoing}`,
    notes?.length != null ? `- Clinical notes on chart (metadata count): ${notes.length}` : null
  ].filter(Boolean);
  sections.push(attendanceLines.join('\n'));

  const dx = buildDiagnosisContextText(diagnoses);
  if (dx) sections.push(dx);

  const plan = buildTreatmentPlanContextText(latestPlan, pastedPlanText);
  if (plan) {
    sections.push(`CURRENT TREATMENT PLAN (goals / objectives / scales):\n${plan}`);
  } else {
    sections.push('CURRENT TREATMENT PLAN: none structured on file — use clinician text and progress history only.');
  }

  const presenting = String(
    latestPlan?.presenting_problem
    || latestPlan?.presentingProblem
    || ''
  ).trim();
  if (presenting) {
    sections.push(`Presenting problem / initiate of services:\n${presenting.slice(0, 3000)}`);
  }
  const just = String(
    latestPlan?.diagnostic_justification
    || latestPlan?.diagnosticJustification
    || ''
  ).trim();
  if (just) {
    sections.push(`Diagnostic justification:\n${just.slice(0, 3000)}`);
  }

  const sortedRatings = [...(objectiveRatings || [])].sort((a, b) => {
    const da = new Date(a.date_of_service || a.rated_at || a.created_at || 0).getTime();
    const db = new Date(b.date_of_service || b.rated_at || b.created_at || 0).getTime();
    return da - db;
  });
  const ratingLines = buildObjectiveRatingsContextText(
    sortedRatings.map((r) => ({
      goalText: r.goal_text || r.goalText,
      objectiveText: r.objective_text || r.objectiveText,
      disposition: r.disposition,
      scaleValue: r.scale_value ?? r.scaleValue,
      scaleTarget: r.scale_target_at_rating ?? r.scale_target ?? r.scaleTarget,
      progressLabel: r.progress_label || r.progressLabel,
      raterKind: r.rater_kind || r.raterKind,
      raterLabel: [
        formatIsoDate(r.date_of_service || r.rated_at || r.created_at),
        r.rater_label || r.raterLabel || r.rater_kind || r.raterKind || 'clinical observation'
      ].filter(Boolean).join(' ')
    }))
  );
  if (ratingLines) {
    sections.push(
      `OBJECTIVE SCALE RESPONSES OVER TIME (1–10; chronological — use for progress narrative):\n${ratingLines}`
    );
  } else {
    sections.push('OBJECTIVE SCALE RESPONSES OVER TIME: none on file.');
  }

  const excerpts = (Array.isArray(progressNoteExcerpts) ? progressNoteExcerpts : [])
    .map((e) => String(e || '').trim())
    .filter(Boolean);
  if (excerpts.length) {
    sections.push(
      `PROGRESS NOTE EXCERPTS (recent signed notes — summarize; do not invent):\n${excerpts.join('\n\n---\n\n').slice(0, 6000)}`
    );
  }

  const clinician = String(clinicianAdditionalText || '').trim();
  if (clinician) {
    sections.push(
      `CLINICIAN ADDITIONAL INFORMATION (participation, impressions, court-sensitive framing — prioritize tone):\n${clinician.slice(0, 6000)}`
    );
  }

  sections.push(
    [
      'DOCUMENT OUTPUT REQUIREMENTS:',
      '- Produce a full Treatment Summary document body only (no cover page, no title block beyond section headers the template uses).',
      '- Include every Important Must from the system instructions when the data above supports it; if a must is missing, state what is missing rather than inventing.',
      '- Refer to the individual as “client” and the writer as “clinician”; no client names.',
      '- End ready for provider and clinical supervisor signature lines (do not invent signature names).'
    ].join('\n')
  );

  return sections.filter(Boolean).join('\n\n').slice(0, 14000);
}

/**
 * Build treatment-plan paste text from intake narrative + chart/parsed diagnoses.
 */
export function buildIntakeInformedPlanText({
  intakeText = '',
  diagnoses = [],
  diagnosticJustification = '',
  presentingProblem = ''
} = {}) {
  const sections = [];
  const intake = String(intakeText || '').trim();
  if (intake) {
    sections.push(`Intake / biopsychosocial context (use to draft or update plan):\n${intake.slice(0, 8000)}`);
  }

  const problem = String(presentingProblem || '').trim();
  if (problem) {
    sections.push(`Presenting Problem (from treatment plan — takes precedence):\n${problem.slice(0, 4000)}`);
  }

  const dxList = (Array.isArray(diagnoses) ? diagnoses : []).filter((d) => d && (d.icd10_code || d.code));
  // Primary first when flagged.
  dxList.sort((a, b) => Number(b.is_primary || b.isPrimary || 0) - Number(a.is_primary || a.isPrimary || 0));
  if (dxList.length) {
    const lines = ['Diagnoses (first is primary for claims; treatment plan primary wins over intake):'];
    for (const d of dxList) {
      const code = d.icd10_code || d.code || '—';
      const desc = d.description || '';
      const primary = d.is_primary || d.isPrimary ? ' [PRIMARY]' : '';
      lines.push(`${code}\t${desc}${primary}`.trim());
    }
    sections.push(lines.join('\n'));
  }

  const just = String(diagnosticJustification || '').trim()
    || String(dxList[0]?.justification || '').trim();
  if (just) {
    sections.push(`Diagnostic Justification (from treatment plan when present)\n${just.slice(0, 4000)}`);
  }

  sections.push(
    'Instructions: Write or update treatment goals, measurable objectives (1–10 scales), and discharge criteria based on the intake context and diagnoses above. Prefer treatment-plan diagnosis, presenting problem, and justification when they conflict with intake.'
  );

  return sections.join('\n\n').slice(0, 11000);
}

export function clientDisplayInitials(client) {
  if (!client) return '';
  const existing = String(client.initials || client.client_initials || '').trim();
  if (existing) return existing.slice(0, 16);
  const first = String(client.first_name || client.firstName || '').trim();
  const last = String(client.last_name || client.lastName || '').trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase().slice(0, 16);
  }
  return '';
}

export function clientDisplayName(client) {
  if (!client) return '';
  const fullName = String(client.full_name || client.fullName || '').trim();
  if (fullName) return fullName;
  const first = String(client.first_name || client.firstName || '').trim();
  const last = String(client.last_name || client.lastName || '').trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  return String(client.display_name || client.name || client.preferred_name || '').trim();
}

/** Tenant label for multi-tenant client pickers. */
export function clientTenantLabel(client, agencyLookup = {}) {
  if (!client) return '';
  const fromRow = String(
    client.agency_name || client.agencyName || client.organization_name || client.organizationName || ''
  ).trim();
  if (fromRow) return fromRow;
  const aid = Number(client.agency_id || client.agencyId || 0);
  if (aid && agencyLookup[aid]) return String(agencyLookup[aid]);
  return aid ? `Tenant #${aid}` : '';
}

/**
 * Normalize a client list row for Note Aid pickers.
 */
export function normalizeNoteAidClientRow(row, agencyLookup = {}) {
  if (!row) return null;
  const id = Number(row.id || row.clientId || 0);
  if (!id) return null;
  const agencyId = Number(row.agency_id || row.agencyId || 0) || null;
  return {
    ...row,
    id,
    clientId: id,
    agencyId,
    agency_id: agencyId,
    full_name: row.full_name || row.fullName || clientDisplayName(row) || null,
    initials: clientDisplayInitials(row),
    agency_name: clientTenantLabel(row, agencyLookup) || null,
    organization_id: Number(row.organization_id || row.organizationId || agencyId || 0) || null
  };
}

/**
 * Fuzzy initials match: compare normalized letters only (ignore punctuation/spaces/case).
 */
export function normalizeInitialsKey(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);
}

export function initialsLikelyMatch(typed, client) {
  const a = normalizeInitialsKey(typed);
  if (!a || a.length < 2) return false;
  const b = normalizeInitialsKey(clientDisplayInitials(client) || client?.initials);
  if (!b) return false;
  return a === b || b.startsWith(a) || a.startsWith(b);
}

/**
 * Resolve which tenant a Note Aid draft should belong to.
 * Ownership order:
 * 1) Client tenant memberships (primary + assignments)
 * 2) Intersect with provider-accessible tenants (when provided)
 * 3) Explicit preferredAgencyId when still valid
 * 4) For tutoring/learning notes, prefer tenants that sponsor the client's learning program
 * 5) Fall back to client primary, then sole candidate
 *
 * Returns { agencyId, needsChoice, candidates }.
 */
export function resolveNoteAidAgencyId({
  clientAgencyId = null,
  clientAgencyIds = [],
  providerAgencyIds = null,
  preferredAgencyId = null,
  preferLearningSponsor = false,
  learningSponsorAgencyIds = []
} = {}) {
  const toIds = (list) => [...new Set(
    (Array.isArray(list) ? list : [])
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0)
  )];

  const primary = Number(clientAgencyId) || 0;
  const memberships = toIds([
    ...(primary ? [primary] : []),
    ...toIds(clientAgencyIds)
  ]);
  if (!memberships.length) {
    const preferred = Number(preferredAgencyId) || 0;
    return {
      agencyId: preferred || null,
      needsChoice: false,
      candidates: preferred ? [preferred] : []
    };
  }

  const providerIds = providerAgencyIds == null ? null : toIds(providerAgencyIds);
  let candidates = memberships;
  if (providerIds && providerIds.length) {
    const providerSet = new Set(providerIds);
    const overlap = memberships.filter((id) => providerSet.has(id));
    if (overlap.length) candidates = overlap;
  }

  const preferred = Number(preferredAgencyId) || 0;
  if (preferred && candidates.includes(preferred)) {
    return { agencyId: preferred, needsChoice: false, candidates };
  }

  if (preferLearningSponsor) {
    const learningSet = new Set(toIds(learningSponsorAgencyIds));
    const learningHits = candidates.filter((id) => learningSet.has(id));
    if (learningHits.length === 1) {
      return { agencyId: learningHits[0], needsChoice: false, candidates: learningHits };
    }
    if (learningHits.length > 1) {
      if (primary && learningHits.includes(primary)) {
        return { agencyId: primary, needsChoice: false, candidates: learningHits };
      }
      return { agencyId: null, needsChoice: true, candidates: learningHits };
    }
  }

  if (candidates.length === 1) {
    return { agencyId: candidates[0], needsChoice: false, candidates };
  }
  if (primary && candidates.includes(primary)) {
    return { agencyId: primary, needsChoice: false, candidates };
  }
  if (candidates.length > 1) {
    return { agencyId: null, needsChoice: true, candidates };
  }
  return { agencyId: null, needsChoice: false, candidates: [] };
}

/** True when the selected aid should prefer a learning-program sponsoring tenant. */
export function noteAidPrefersLearningSponsor(aid, { categoryId = '' } = {}) {
  const cat = String(categoryId || aid?.categoryId || '').toLowerCase();
  if (cat === 'therapy_tutoring' || cat === 'learning' || cat === 'tutoring') return true;
  const blob = `${aid?.toolId || ''} ${aid?.id || ''} ${aid?.label || ''}`.toLowerCase();
  return (
    blob.includes('tutor')
    || blob.includes('tpt_')
    || blob.includes('learning')
    || blob.includes('nlu_assessment')
  );
}

/** Tenant rows for Note Aid filters (memberships, or full catalog for super_admin). */
export function noteAidTenantOptions(agencyStore, { role = '' } = {}) {
  const roleNorm = String(role || '').toLowerCase();
  const memberships = Array.isArray(agencyStore?.userAgencies) ? agencyStore.userAgencies : [];
  const catalog = Array.isArray(agencyStore?.agencies) ? agencyStore.agencies : [];
  const source = memberships.length
    ? memberships
    : roleNorm === 'super_admin'
      ? catalog
      : memberships;
  const seen = new Set();
  const out = [];
  for (const a of source) {
    const id = Number(a?.id || 0);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: a.name || a.organization_name || `Tenant #${id}`
    });
  }
  return out.sort((x, y) => String(x.name).localeCompare(String(y.name)));
}

export function documentationQueueSearchHaystack({
  clientName,
  clientInitials,
  agencyName,
  serviceCode,
  dateOfService,
  clientId,
  identifierCode
} = {}) {
  const parts = [
    clientName,
    clientInitials,
    agencyName,
    serviceCode,
    dateOfService,
    String(clientId || ''),
    String(identifierCode || '')
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  const dos = String(dateOfService || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dos)) {
    const [, mm, dd] = dos.split('-');
    parts.push(`${mm}-${dd}`, `${mm}/${dd}`);
  }
  return parts.join(' ');
}
