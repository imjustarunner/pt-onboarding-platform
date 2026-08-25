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

function parseScalePair(text) {
  const s = String(text || '');
  // "4 → 8", "4->8", "current 4 target 8", "4/10 to 8/10", "(4 to 8)"
  const arrow = s.match(/(\d{1,2})\s*(?:→|->|to|\/)\s*(\d{1,2})/i);
  if (arrow) {
    const current = Number(arrow[1]);
    const target = Number(arrow[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }
  const labeled = s.match(/current[^0-9]*(\d{1,2})[^0-9]+(?:goal|target)[^0-9]*(\d{1,2})/i);
  if (labeled) {
    const current = Number(labeled[1]);
    const target = Number(labeled[2]);
    if (current >= 1 && current <= 10 && target >= 1 && target <= 10) {
      return { scaleCurrent: current, scaleTarget: target };
    }
  }
  return { scaleCurrent: null, scaleTarget: null };
}

export function inferScaleDirection(scaleCurrent, scaleTarget, explicit = null) {
  const dir = String(explicit || '').toLowerCase();
  if (dir === 'increase' || dir === 'decrease') return dir;
  const cur = Number(scaleCurrent);
  const tgt = Number(scaleTarget);
  if (!Number.isFinite(cur) || !Number.isFinite(tgt)) return null;
  if (tgt > cur) return 'increase';
  if (tgt < cur) return 'decrease';
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

/**
 * @returns {{
 *   effectiveDate: string|null,
 *   diagnoses: Array<{icd10Code:string|null, description:string, justification:string, isPrimary:boolean}>,
 *   primaryDiagnosisIndex: number,
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
    dischargePlan: null,
    goals: []
  };
  if (!raw) return empty;

  const lines = raw.split('\n').map((l) => l.trimEnd());
  let effectiveDate = null;
  const diagnoses = [];
  let dischargePlan = null;
  const goals = [];
  let currentGoal = null;
  let mode = null; // dx | discharge | goals | null
  let justificationBuffer = [];

  const flushJustification = () => {
    if (!diagnoses.length || !justificationBuffer.length) {
      justificationBuffer = [];
      return;
    }
    const j = justificationBuffer.join(' ').trim();
    if (j) diagnoses[diagnoses.length - 1].justification = j;
    justificationBuffer = [];
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

    if (/^discharge\s*plan\b/i.test(trimmed) || /^discharge\b/i.test(trimmed)) {
      flushJustification();
      mode = 'discharge';
      const rest = trimmed.replace(/^discharge(?:\s*plan)?\s*[:\-]?\s*/i, '').trim();
      dischargePlan = rest || '';
      continue;
    }

    if (/^(?:diagnos(?:is|es)|dx|primary\s*diagnos)/i.test(trimmed)) {
      flushJustification();
      mode = 'dx';
      const rest = trimmed.replace(/^(?:diagnos(?:is|es)|dx|primary\s*diagnos(?:is|es)?)\s*[:\-]?\s*/i, '').trim();
      if (rest) {
        const code = parseIcd10(rest);
        diagnoses.push({
          icd10Code: code,
          description: code ? rest.replace(code, '').replace(/^[\s\-–—:,]+/, '').trim() : rest,
          justification: '',
          isPrimary: diagnoses.length === 0
        });
      }
      continue;
    }

    if (/^justification\b/i.test(trimmed)) {
      mode = 'dx';
      const rest = trimmed.replace(/^justification\s*[:\-]?\s*/i, '').trim();
      if (rest) justificationBuffer.push(rest);
      continue;
    }

    if (/^goal\s*\d*\b/i.test(trimmed) || /^g\d+\b/i.test(trimmed)) {
      flushJustification();
      mode = 'goals';
      const text = trimmed
        .replace(/^goal\s*\d*\s*[:.\-)\]\s]*/i, '')
        .replace(/^g\d+\s*[:.\-)\]\s]*/i, '')
        .trim();
      currentGoal = {
        goalText: text || trimmed,
        projectedCompletion: null,
        objectives: []
      };
      goals.push(currentGoal);
      continue;
    }

    if (/^(?:objective|obj)\s*\d*\b/i.test(trimmed) || /^o\d+\b/i.test(trimmed)) {
      flushJustification();
      mode = 'goals';
      if (!currentGoal) {
        currentGoal = { goalText: 'Goal', projectedCompletion: null, objectives: [] };
        goals.push(currentGoal);
      }
      const text = trimmed
        .replace(/^(?:objective|obj)\s*\d*\s*[:.\-)\]\s]*/i, '')
        .replace(/^o\d+\s*[:.\-)\]\s]*/i, '')
        .trim();
      const scales = parseScalePair(text);
      const directionHint = /decrease|reduce|lower/i.test(text)
        ? 'decrease'
        : /increase|improve|higher/i.test(text)
          ? 'increase'
          : null;
      const measurement =
        (text.match(/(?:measured by|measurement|via)\s*[:\-]?\s*(.+)$/i) || [])[1] || null;
      currentGoal.objectives.push({
        objectiveText: text || trimmed,
        scaleCurrent: scales.scaleCurrent,
        scaleTarget: scales.scaleTarget,
        scaleDirection: inferScaleDirection(scales.scaleCurrent, scales.scaleTarget, directionHint),
        measurementMethod: measurement ? String(measurement).trim() : null,
        projectedCompletion: null
      });
      continue;
    }

    if (/projected|timeframe|target date|completion/i.test(trimmed) && currentGoal) {
      const rest = trimmed.replace(/^(?:projected(?:\s*completion)?|timeframe|target date|completion)\s*[:\-]?\s*/i, '');
      currentGoal.projectedCompletion = rest || trimmed;
      continue;
    }

    if (mode === 'discharge') {
      dischargePlan = [dischargePlan, trimmed].filter(Boolean).join('\n');
      continue;
    }

    if (mode === 'dx') {
      const code = parseIcd10(trimmed);
      if (code && !/justification/i.test(trimmed)) {
        flushJustification();
        diagnoses.push({
          icd10Code: code,
          description: trimmed.replace(code, '').replace(/^[\s\-–—:,]+/, '').trim(),
          justification: '',
          isPrimary: diagnoses.length === 0
        });
      } else {
        justificationBuffer.push(trimmed);
      }
      continue;
    }

    // Loose ICD line without header
    const looseCode = parseIcd10(trimmed);
    if (looseCode && diagnoses.length < 8 && trimmed.length < 160) {
      diagnoses.push({
        icd10Code: looseCode,
        description: trimmed.replace(looseCode, '').replace(/^[\s\-–—:,]+/, '').trim(),
        justification: '',
        isPrimary: diagnoses.length === 0
      });
      mode = 'dx';
    }
  }

  flushJustification();

  // If no explicit goals but free text exists, stash as a single goal
  if (!goals.length && raw.length > 40) {
    const body = raw.slice(0, 4000);
    goals.push({
      goalText: body.split('\n').find((l) => cleanLine(l)) || 'Imported treatment plan',
      projectedCompletion: null,
      objectives: []
    });
  }

  const primaryDiagnosisIndex = Math.max(
    0,
    diagnoses.findIndex((d) => d.isPrimary)
  );

  return {
    effectiveDate,
    diagnoses: diagnoses.map((d, i) => ({
      ...d,
      isPrimary: i === (primaryDiagnosisIndex >= 0 ? primaryDiagnosisIndex : 0)
    })),
    primaryDiagnosisIndex: primaryDiagnosisIndex >= 0 ? primaryDiagnosisIndex : 0,
    dischargePlan: dischargePlan ? String(dischargePlan).trim() : null,
    goals
  };
}

export default { parseTreatmentPlanText, inferScaleDirection };
