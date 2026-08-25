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
      lines.push(
        `${goalBit} | ${objBit} | rated ${scale}/10 toward goal ${target ?? '—'}${labelBit}`
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
