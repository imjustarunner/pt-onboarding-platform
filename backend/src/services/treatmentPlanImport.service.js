/**
 * Parse pasted treatment-plan text into a reviewable structured model.
 * Heuristic parser — clinicians always review/edit before save.
 */

function cleanLine(line) {
  return String(line || '')
    .replace(/^[\s>*#-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove leading "Objective 1.1:" style headers from objective body text. */
function stripObjectiveHeader(text) {
  return String(text || '')
    .replace(/^(?:objective|obj)\s+\d+(?:\.\d+)?\s*[:.\-)\]\s—–-]*\s*/i, '')
    .trim();
}

/** Strip boilerplate labels that often leak into pasted plan text. */
export function stripPlanBoilerplateLabels(text) {
  return String(text || '')
    .replace(/^(?:treatment\s+)?goal(?:\s+\d+)?\s*[:.\-)\]\s—–-]*\s*/i, '')
    .replace(/^(?:objective|obj)\s+\d+(?:\.\d+)?\s*[:.\-)\]\s—–-]*\s*/i, '')
    .replace(/\bTreatment\s+Goal(?:\s+\d+)?\b[:.\-)\]\s—–-]*/gi, '')
    .replace(/\bTreatment\s+Strategy\s*\/\s*Intervention\b[:.\-)\]\s—–-]*/gi, '')
    .replace(/\bTreatment\s+Strategy\b[:.\-)\]\s—–-]*/gi, '')
    .replace(/\bIntervention\s*:\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isBoilerplateOnlyLine(text) {
  const t = String(text || '').trim();
  if (!t) return true;
  return /^(?:treatment\s+)?goal(?:\s+\d+)?\.?$/i.test(t)
    || /^(?:objective|obj)\s*\d*(?:\.\d+)?\.?$/i.test(t)
    || /^treatment\s+strategy(?:\s*\/\s*intervention)?\.?$/i.test(t)
    || /^intervention\.?$/i.test(t);
}

export function parseScalePair(text) {
  const s = String(text || '');

  // "from a current level of 7 out of 10 to a target level of 3 out of 10"
  const outOfTen = s.match(
    /(?:from\s+a\s+)?current\s+level\s+of\s+(\d{1,2})\s+out\s+of\s+10\s+\bto\b\s+(?:a\s+)?(?:target\s+level\s+of\s+)?(\d{1,2})(?:\s+out\s+of\s+10)?/i
  );
  if (outOfTen) {
    const current = Number(outOfTen[1]);
    const target = Number(outOfTen[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  // "7/10 to 3/10" or "4/10 → 8/10"
  const slashPair = s.match(
    /(\d{1,2})\s*\/\s*10\s*(?:→|->|\bto\b)\s*(?:a\s+)?(?:target\s+level\s+of\s+)?(\d{1,2})(?:\s*\/\s*10)?/i
  );
  if (slashPair) {
    const current = Number(slashPair[1]);
    const target = Number(slashPair[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  // "from a current … level of 9 to a target level of 5" (without "out of 10")
  const fromTo = s.match(
    /(?:from\s+a\s+)?(?:current|baseline)[^0-9]{0,40}?(\d{1,2})\s*(?:or below|or less)?(?:\s+out\s+of\s+10)?[^0-9]{0,30}?\bto\b\s*(?:a\s+)?(?:target\s+level\s+of\s+)?(\d{1,2})/i
  );
  if (fromTo) {
    const current = Number(fromTo[1]);
    const target = Number(fromTo[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  // "4 → 8", "4->8", "(4 to 8)" — word boundary on to (avoids matching "to" inside "out")
  const arrow = s.match(/(\d{1,2})\s*(?:→|->|\bto\b)\s*(?:a\s+)?(\d{1,2})/i);
  if (arrow) {
    const current = Number(arrow[1]);
    const target = Number(arrow[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  const labeled = s.match(
    /current(?:\s+level\s+of|\s+)[^0-9]*(\d{1,2})(?:\s+out\s+of\s+10)?[^0-9]*?(?:goal|target)[^0-9]*(\d{1,2})/i
  );
  if (labeled) {
    const current = Number(labeled[1]);
    const target = Number(labeled[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }

  const currentOnly = s.match(
    /(?:current\s+level\s+of|currently\s+(?:functions|reports)?\s*(?:at\s+)?(?:a\s+)?level\s*(?:of\s*)?|baseline\s*(?:of\s*)?)(\d{1,2})(?:\s+out\s+of\s+10)?/i
  );
  const targetOnly = s.match(
    /(?:target\s+level\s+of|achieving\s+(?:a\s+)?level\s*(?:of\s*)?|(?:^|\s)target\s*(?:level\s*(?:of\s*)?)?|(?:^|\s)goal\s*(?:level\s*(?:of\s*)?)?)(\d{1,2})(?:\s+out\s+of\s+10)?/i
  );
  if (currentOnly || targetOnly) {
    const current = currentOnly ? Number(currentOnly[1]) : null;
    const target = targetOnly ? Number(targetOnly[1]) : null;
    if (
      (current == null || (current >= 1 && current <= 10))
      && (target == null || (target >= 1 && target <= 10))
    ) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }
  return { scaleCurrent: null, scaleTarget: null };
}

export function inferScaleDirection(scaleCurrent, scaleTarget, explicit = null) {
  const cur = Number(scaleCurrent);
  const tgt = Number(scaleTarget);
  if (Number.isFinite(cur) && Number.isFinite(tgt) && cur !== tgt) {
    if (tgt > cur) return 'increase';
    if (tgt < cur) return 'decrease';
  }
  const dir = String(explicit || '').toLowerCase();
  if (dir === 'increase' || dir === 'decrease') return dir;
  return null;
}

function keywordScaleDirection(text) {
  const s = String(text || '');
  if (/decrease|reduce|lower|eliminate|minimize/i.test(s)) return 'decrease';
  if (/increase|improve|enhance|higher|elevate/i.test(s)) return 'increase';
  return null;
}

function parseDateLoose(text) {
  const s = String(text || '');
  const iso = s.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdY = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2}|19\d{2})\b/);
  if (mdY) {
    const mm = String(mdY[1]).padStart(2, '0');
    const dd = String(mdY[2]).padStart(2, '0');
    return `${mdY[3]}-${mm}-${dd}`;
  }
  const named = s.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2}|19\d{2})\b/i
  );
  if (named) {
    const months = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      oct: '10',
      nov: '11',
      dec: '12'
    };
    const mm = months[named[1].slice(0, 3).toLowerCase()];
    const dd = String(named[2]).padStart(2, '0');
    if (mm) return `${named[3]}-${mm}-${dd}`;
  }
  return null;
}

function parseIcd10(text) {
  const m = String(text || '').match(/\b([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/i);
  return m ? m[1].toUpperCase() : null;
}

/** @returns {{ months: number, label: string }|null} */
export function parseDurationMonths(text) {
  const s = String(text || '').trim();
  if (!s) return null;

  const monthsMatch = s.match(/\b(\d{1,2})\s*[-\s]?\s*months?\b/i);
  if (monthsMatch) {
    const months = Number(monthsMatch[1]);
    if (months >= 1 && months <= 36) {
      return { months, label: `${months} month${months === 1 ? '' : 's'}` };
    }
  }

  const weeksMatch = s.match(/\b(\d{1,2})\s*[-\s]?\s*weeks?\b/i);
  if (weeksMatch) {
    const weeks = Number(weeksMatch[1]);
    const months = Math.max(1, Math.round(weeks / 4));
    return { months, label: `${months} month${months === 1 ? '' : 's'}` };
  }

  const daysMatch = s.match(/\b(\d{2,3})\s*[-\s]?\s*days?\b/i);
  if (daysMatch) {
    const days = Number(daysMatch[1]);
    const months = Math.max(1, Math.round(days / 30));
    return { months, label: `${months} month${months === 1 ? '' : 's'}` };
  }

  return null;
}

/** @param {number} months @param {Date} [fromDate] @returns {string|null} YYYY-MM-DD */
export function completionDateFromDurationMonths(months, fromDate = new Date()) {
  const m = Number(months);
  if (!Number.isFinite(m) || m < 1) return null;
  const base = fromDate instanceof Date ? new Date(fromDate) : new Date(fromDate);
  if (Number.isNaN(base.getTime())) return null;
  const d = new Date(base);
  d.setMonth(d.getMonth() + Math.round(m));
  return d.toISOString().slice(0, 10);
}

export function isObjectiveScaleValid(scaleCurrent, scaleTarget) {
  const cur = Number(scaleCurrent);
  const tgt = Number(scaleTarget);
  return (
    Number.isInteger(cur)
    && Number.isInteger(tgt)
    && cur >= 1
    && cur <= 10
    && tgt >= 1
    && tgt <= 10
    && cur !== tgt
  );
}

function applyGoalDuration(goal, text) {
  const duration = parseDurationMonths(text);
  if (!duration || !goal) return false;
  goal.durationMonths = duration.months;
  goal.durationLabel = duration.label;
  goal.projectedCompletion = completionDateFromDurationMonths(duration.months);
  return true;
}

function finalizeObjective(obj) {
  obj.objectiveText = stripPlanBoilerplateLabels(stripObjectiveHeader(obj.objectiveText));
  const valid = isObjectiveScaleValid(obj.scaleCurrent, obj.scaleTarget);
  obj.scaleNeedsRewrite = !valid;
  if (valid && !obj.measurementMethod) {
    obj.measurementMethod = '1–10 scale (client self-report)';
  }
  if (valid) {
    obj.scaleDirection = inferScaleDirection(obj.scaleCurrent, obj.scaleTarget, obj.scaleDirection);
  }
  return obj;
}

function finalizeGoal(goal) {
  if (!goal) return goal;
  goal.goalText = stripPlanBoilerplateLabels(goal.goalText);
  goal.objectives = (goal.objectives || []).map((o) => finalizeObjective(o));
  return goal;
}

function emptyGoalShell(goalText = '') {
  return {
    goalText,
    projectedCompletion: null,
    durationMonths: null,
    durationLabel: null,
    parsedDateHint: null,
    objectives: []
  };
}

/** Split compound goal text into clauses. Returns [] unless natural clause count matches `want`. */
function splitGoalClauses(goalText, want) {
  const text = String(goalText || '').trim();
  if (!text || want < 2) return [];
  const parts = text
    .split(/\s*;\s*|\s*,\s*(?:and\s+)?|\s+\band\b\s+/i)
    .map((p) => p.replace(/^client will\s+/i, '').trim())
    .filter((p) => p.length > 8);
  if (parts.length !== want) return [];
  return parts.map((p) => (/^client will/i.test(p) ? p : `Client will ${p}`));
}

function goalTextFromObjective(objectiveText) {
  const raw = stripPlanBoilerplateLabels(String(objectiveText || ''));
  const withoutScale = raw
    .replace(/\s*Progress will be measured[^.]*\./i, '')
    .replace(/\s*where\s+1\s*=[^.]*\./i, '')
    .trim();
  const first = withoutScale.split(/(?<=\.)\s+/)[0] || withoutScale;
  return first.replace(/\.\s*$/, '').trim().slice(0, 400);
}

/**
 * When a single goal carries multiple objectives (common paste shape), expand to
 * one goal per objective so ratings and chart edits stay goal-scoped.
 */
export function expandGoalsOnePerObjective(goals = []) {
  const out = [];
  for (const g of goals || []) {
    const objs = Array.isArray(g.objectives) ? g.objectives : [];
    if (objs.length <= 1) {
      out.push(g);
      continue;
    }
    const clauses = splitGoalClauses(g.goalText, objs.length);
    const useClauses = clauses.length === objs.length;
    for (let i = 0; i < objs.length; i += 1) {
      const goalText =
        (useClauses && clauses[i])
        || goalTextFromObjective(objs[i]?.objectiveText)
        || String(g.goalText || '').trim()
        || `Goal ${out.length + 1}`;
      out.push({
        ...emptyGoalShell(goalText),
        projectedCompletion: g.projectedCompletion ?? null,
        durationMonths: g.durationMonths ?? null,
        durationLabel: g.durationLabel ?? null,
        parsedDateHint: g.parsedDateHint ?? null,
        objectives: [objs[i]]
      });
    }
  }
  return out;
}

function ensureGoalAtIndex(goals, index1Based, template = null) {
  const idx = Math.max(1, Number(index1Based) || 1) - 1;
  while (goals.length <= idx) {
    goals.push(emptyGoalShell(template?.goalText ? '' : `Goal ${goals.length + 1}`));
  }
  if (template) {
    const g = goals[idx];
    if (template.durationMonths != null && g.durationMonths == null) {
      g.durationMonths = template.durationMonths;
      g.durationLabel = template.durationLabel ?? null;
      g.projectedCompletion = template.projectedCompletion ?? null;
    }
  }
  return goals[idx];
}

function parseObjectiveMajorMinor(trimmed) {
  const m =
    String(trimmed || '').match(/^(?:objective|obj)\s*(\d+)(?:\.(\d+))?/i)
    || String(trimmed || '').match(/^o(\d+)(?:\.(\d+))?/i);
  if (!m) return null;
  return { major: Number(m[1]), minor: m[2] != null ? Number(m[2]) : null };
}

/**
 * @returns {{
 *   effectiveDate: string|null,
 *   diagnoses: Array<{icd10Code:string|null, description:string, justification:string, isPrimary:boolean}>,
 *   primaryDiagnosisIndex: number,
 *   presentingProblem: string|null,
 *   prescribedFrequency: string|null,
 *   dischargePlan: string|null,
 *   goals: Array<{goalText:string, projectedCompletion:string|null, objectives:Array}>
 * }}
 */
export function parseTreatmentPlanText(rawText) {
  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  const empty = {
    effectiveDate: null,
    diagnoses: [],
    primaryDiagnosisIndex: 0,
    presentingProblem: null,
    prescribedFrequency: null,
    dischargePlan: null,
    goals: []
  };
  if (!raw) return empty;

  const lines = raw.split('\n').map((l) => l.trimEnd());
  let effectiveDate = null;
  const diagnoses = [];
  let dischargePlan = null;
  let presentingProblem = null;
  let prescribedFrequency = null;
  const goals = [];
  let currentGoal = null;
  let mode = null; // dx | discharge | goals | presenting | frequency | justification | null
  let justificationBuffer = [];
  let presentingBuffer = [];

  const flushJustification = () => {
    if (!diagnoses.length || !justificationBuffer.length) {
      justificationBuffer = [];
      return;
    }
    const j = justificationBuffer.join(' ').trim();
    if (j) {
      // Attach full justification to primary (first) diagnosis; keep on last if only one
      const target = diagnoses.find((d) => d.isPrimary) || diagnoses[0];
      target.justification = [target.justification, j].filter(Boolean).join(' ').trim();
    }
    justificationBuffer = [];
  };

  const flushPresenting = () => {
    if (!presentingBuffer.length) return;
    presentingProblem = presentingBuffer.join(' ').trim() || presentingProblem;
    presentingBuffer = [];
  };

  for (const line of lines) {
    const trimmed = cleanLine(line);
    if (!trimmed) continue;

    if (!effectiveDate) {
      const dateHeader = trimmed.match(/^(?:effective|plan)\s*date\s*[:\-]?\s*(.+)$/i);
      if (dateHeader) {
        effectiveDate = parseDateLoose(dateHeader[1]) || parseDateLoose(trimmed);
        continue;
      }
      const embedded = parseDateLoose(trimmed);
      if (/date/i.test(trimmed) && embedded) {
        effectiveDate = embedded;
        continue;
      }
    }

    if (/^diagnostic\s+justification\b/i.test(trimmed) || /^justification\b/i.test(trimmed)) {
      flushPresenting();
      mode = 'justification';
      const rest = trimmed
        .replace(/^diagnostic\s+justification\s*[:\-]?\s*/i, '')
        .replace(/^justification\s*[:\-]?\s*/i, '')
        .trim();
      if (rest) justificationBuffer.push(rest);
      continue;
    }

    if (/^presenting\s+problem\b/i.test(trimmed)) {
      flushJustification();
      mode = 'presenting';
      const rest = trimmed.replace(/^presenting\s+problem\s*[:\-]?\s*/i, '').trim();
      if (rest) presentingBuffer.push(rest);
      continue;
    }

    if (/^prescribed\s+frequency\b/i.test(trimmed) || /^frequency\s+of\s+treatment\b/i.test(trimmed)) {
      flushJustification();
      flushPresenting();
      mode = 'frequency';
      const rest = trimmed
        .replace(/^prescribed\s+frequency(?:\s+of\s+treatment)?\s*[:\-]?\s*/i, '')
        .replace(/^frequency\s+of\s+treatment\s*[:\-]?\s*/i, '')
        .trim();
      prescribedFrequency = rest || '';
      continue;
    }

    if (
      /^discharge\s*(?:criteria|plan|criteria\/planning|criteria\/plan)?\b/i.test(trimmed)
      || /^discharge\b/i.test(trimmed)
    ) {
      flushJustification();
      flushPresenting();
      mode = 'discharge';
      const rest = trimmed
        .replace(/^discharge(?:\s*(?:criteria(?:\/planning)?|plan))?\s*[:\-]?\s*/i, '')
        .trim();
      dischargePlan = rest || '';
      continue;
    }

    if (/^medically\s+necessary\b/i.test(trimmed) || /^i\s+declare\s+that\b/i.test(trimmed)) {
      flushJustification();
      flushPresenting();
      mode = null;
      continue;
    }

    if (/^(?:diagnos(?:is|es)|dx|primary\s*diagnos)/i.test(trimmed)) {
      flushJustification();
      flushPresenting();
      mode = 'dx';
      const rest = trimmed.replace(/^(?:diagnos(?:is|es)|dx|primary\s*diagnos(?:is|es)?)\s*[:\-]?\s*/i, '').trim();
      if (rest) {
        const code = parseIcd10(rest);
        diagnoses.push({
          icd10Code: code,
          description: code ? rest.replace(code, '').replace(/^[\s\-–—:,\t]+/, '').trim() : rest,
          justification: '',
          isPrimary: diagnoses.length === 0
        });
      }
      continue;
    }

    if (
      /^treatment\s+goal\s*\d*\b/i.test(trimmed)
      || /^goal\s*\d*\b/i.test(trimmed)
      || /^g\d+\b/i.test(trimmed)
    ) {
      flushJustification();
      flushPresenting();
      mode = 'goals';
      const text = stripPlanBoilerplateLabels(
        trimmed
          .replace(/^treatment\s+goal\s*\d*\s*[:.\-)\]\s]*/i, '')
          .replace(/^goal\s*\d*\s*[:.\-)\]\s]*/i, '')
          .replace(/^g\d+\s*[:.\-)\]\s]*/i, '')
          .trim()
      );
      currentGoal = {
        goalText: isBoilerplateOnlyLine(text) ? '' : text,
        projectedCompletion: null,
        durationMonths: null,
        durationLabel: null,
        parsedDateHint: null,
        objectives: []
      };
      goals.push(currentGoal);
      applyGoalDuration(currentGoal, trimmed);
      continue;
    }

    if (
      /^(?:objective|obj)\s*\d*(?:\.\d+)?\b/i.test(trimmed)
      || /^o\d+(?:\.\d+)?\b/i.test(trimmed)
    ) {
      flushJustification();
      flushPresenting();
      mode = 'goals';
      const numbered = parseObjectiveMajorMinor(trimmed);
      if (numbered?.major) {
        currentGoal = ensureGoalAtIndex(goals, numbered.major, currentGoal);
      } else if (!currentGoal) {
        currentGoal = emptyGoalShell('Goal');
        goals.push(currentGoal);
      }
      const text = stripPlanBoilerplateLabels(
        stripObjectiveHeader(
          trimmed
            .replace(/^(?:objective|obj)\s+\d+(?:\.\d+)?\s*[:.\-)\]\s]*/i, '')
            .replace(/^o\d+(?:\.\d+)?\s*[:.\-)\]\s]*/i, '')
            .trim() || trimmed
        )
      );
      // Header-only lines ("Objective 1.1") still open an objective; body arrives on following lines.
      if (isBoilerplateOnlyLine(text) && !/^(?:objective|obj)\s*\d+/i.test(trimmed) && !/^o\d+/i.test(trimmed)) {
        continue;
      }
      const scales = parseScalePair(text);
      const directionHint = keywordScaleDirection(text);
      currentGoal.objectives.push(
        finalizeObjective({
          objectiveText: isBoilerplateOnlyLine(text) ? '' : text,
          scaleCurrent: scales.scaleCurrent,
          scaleTarget: scales.scaleTarget,
          scaleDirection: inferScaleDirection(scales.scaleCurrent, scales.scaleTarget, directionHint),
          measurementMethod: null,
          projectedCompletion: null
        })
      );
      continue;
    }

    if (/^estimated\s+completion\b/i.test(trimmed) || (/projected|timeframe|target date|completion/i.test(trimmed) && currentGoal)) {
      const rest = trimmed
        .replace(/^estimated\s+completion\s*[:\-]?\s*/i, '')
        .replace(/^(?:projected(?:\s*completion)?|timeframe|target date|completion)\s*[:\-]?\s*/i, '');
      if (applyGoalDuration(currentGoal, rest) || applyGoalDuration(currentGoal, trimmed)) {
        continue;
      }
      const dateHit = parseDateLoose(rest) || parseDateLoose(trimmed);
      if (currentGoal && dateHit) {
        currentGoal.parsedDateHint = dateHit;
      }
      continue;
    }

    if (mode === 'discharge') {
      dischargePlan = [dischargePlan, trimmed].filter(Boolean).join('\n');
      continue;
    }

    if (mode === 'presenting') {
      presentingBuffer.push(trimmed);
      continue;
    }

    if (mode === 'frequency') {
      prescribedFrequency = [prescribedFrequency, trimmed].filter(Boolean).join(' ').trim();
      continue;
    }

    if (mode === 'justification') {
      justificationBuffer.push(trimmed);
      continue;
    }

    if (mode === 'dx') {
      const code = parseIcd10(trimmed);
      if (code && !/justification/i.test(trimmed)) {
        diagnoses.push({
          icd10Code: code,
          description: trimmed.replace(code, '').replace(/^[\s\-–—:,\t]+/, '').trim(),
          justification: '',
          isPrimary: diagnoses.length === 0
        });
      } else if (/justification/i.test(trimmed)) {
        mode = 'justification';
        const rest = trimmed.replace(/^.*?justification\s*[:\-]?\s*/i, '').trim();
        if (rest) justificationBuffer.push(rest);
      } else {
        const last = diagnoses[diagnoses.length - 1];
        if (last && !String(last.description || '').trim()) {
          last.description = trimmed;
        } else {
          justificationBuffer.push(trimmed);
        }
      }
      continue;
    }

    if (mode === 'goals' && currentGoal) {
      // Continuation lines for long objectives / goals
      if (isBoilerplateOnlyLine(trimmed)) continue;
      const cleaned = stripPlanBoilerplateLabels(trimmed);
      if (!cleaned) continue;
      const lastObj = currentGoal.objectives[currentGoal.objectives.length - 1];
      if (lastObj) {
        lastObj.objectiveText = stripPlanBoilerplateLabels(
          stripObjectiveHeader(`${lastObj.objectiveText} ${cleaned}`.trim())
        );
        const scales = parseScalePair(lastObj.objectiveText);
        if (scales.scaleCurrent != null) lastObj.scaleCurrent = scales.scaleCurrent;
        if (scales.scaleTarget != null) lastObj.scaleTarget = scales.scaleTarget;
        lastObj.scaleDirection = inferScaleDirection(
          lastObj.scaleCurrent,
          lastObj.scaleTarget,
          keywordScaleDirection(lastObj.objectiveText)
        );
        finalizeObjective(lastObj);
      } else {
        currentGoal.goalText = stripPlanBoilerplateLabels(
          `${currentGoal.goalText} ${cleaned}`.trim()
        );
        applyGoalDuration(currentGoal, trimmed);
      }
      continue;
    }

    // Loose ICD line without header
    const looseCode = parseIcd10(trimmed);
    if (looseCode && diagnoses.length < 12 && trimmed.length < 160) {
      diagnoses.push({
        icd10Code: looseCode,
        description: trimmed.replace(looseCode, '').replace(/^[\s\-–—:,\t]+/, '').trim(),
        justification: '',
        isPrimary: diagnoses.length === 0
      });
      mode = 'dx';
    }
  }

  flushJustification();
  flushPresenting();

  // If no explicit goals but free text exists, stash as a single goal
  if (!goals.length && raw.length > 40) {
    const body = raw.slice(0, 4000);
    goals.push({
      goalText: body.split('\n').find((l) => cleanLine(l)) || 'Imported treatment plan',
      projectedCompletion: null,
      durationMonths: null,
      durationLabel: null,
      parsedDateHint: null,
      objectives: []
    });
  }

  for (const goal of goals) {
    finalizeGoal(goal);
    if (!goal.durationMonths && goal.projectedCompletion && /^\d{4}-\d{2}-\d{2}$/.test(goal.projectedCompletion)) {
      goal.parsedDateHint = goal.parsedDateHint || goal.projectedCompletion;
      goal.projectedCompletion = null;
    }
  }

  const expandedGoals = expandGoalsOnePerObjective(goals).filter(
    (g) => String(g.goalText || '').trim() || (g.objectives || []).some((o) => String(o.objectiveText || '').trim())
  );

  const primaryDiagnosisIndex = Math.max(
    0,
    diagnoses.findIndex((d) => d.isPrimary)
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  return {
    effectiveDate: effectiveDate || todayIso,
    diagnoses: diagnoses.map((d, i) => ({
      ...d,
      isPrimary: i === (primaryDiagnosisIndex >= 0 ? primaryDiagnosisIndex : 0)
    })),
    primaryDiagnosisIndex: primaryDiagnosisIndex >= 0 ? primaryDiagnosisIndex : 0,
    presentingProblem: presentingProblem ? String(presentingProblem).trim() : null,
    prescribedFrequency: prescribedFrequency ? String(prescribedFrequency).trim() : null,
    dischargePlan: dischargePlan ? String(dischargePlan).trim() : null,
    goals: expandedGoals
  };
}

export default {
  parseTreatmentPlanText,
  expandGoalsOnePerObjective,
  inferScaleDirection,
  parseDurationMonths,
  completionDateFromDurationMonths,
  isObjectiveScaleValid
};
