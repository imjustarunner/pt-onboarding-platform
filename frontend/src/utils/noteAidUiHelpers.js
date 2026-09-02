/**
 * Helpers for Note Aid workspace: SOAP mapping, treatment plans, interventions, copy text.
 */

export const SOAP_SECTION_DEFS = [
  { key: 'Subjective', letter: 'S', label: 'Subjective', aliases: ['Symptom Description and Subjective Report', 'S - Subjective'] },
  { key: 'Objective', letter: 'O', label: 'Objective', aliases: ['Objective Content', 'O - Objective'] },
  { key: 'Interventions', letter: 'I', label: 'Interventions', aliases: ['Interventions Used', 'I - Interventions'] },
  { key: 'Plan', letter: 'P', label: 'Plan', aliases: ['P - Plan'] }
];

const SOAP_HEADER_NAMES =
  'Symptom Description and Subjective Report|Subjective|S\\s*-\\s*Subjective|Objective Content|Objective|O\\s*-\\s*Objective|Interventions Used|Interventions|I\\s*-\\s*Interventions|Plan|P\\s*-\\s*Plan';

/**
 * Match SOAP headers including common model formats:
 *   **1. Symptom Description and Subjective Report**
 *   1. Subjective:
 *   **Objective Content**
 */
const SOAP_INLINE_HEADER_RE = new RegExp(
  `^(?:\\*\\*)?(?:\\d+[\\.\\)\\s-]*)?(?:\\*\\*)?(${SOAP_HEADER_NAMES})(?:\\*\\*)?\\s*:?\\s*(.*)$`,
  'i'
);

/** Goal N / Objective N / Discharge / Projected Time — EHR paste + structured plan UI. */
const TREATMENT_PLAN_HEADER_RE =
  /^(?:\d+[\).\s-]*)?(?:\*\*)?(Goal\s*(\d+)|Objective\s*(\d+(?:\.\d+)?)|Projected\s*Time\s*(?:to\s*Completion)?(?:\s*\d+)?|Discharge\s*Plan|Discharge)(?:\*\*)?\s*:?\s*(.*)$/i;

function normalizeSectionKey(title) {
  let t = String(title || '').trim().toLowerCase();
  t = t.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '');
  t = t.replace(/^\d+[\).\s-]+/, '').trim();
  for (const def of SOAP_SECTION_DEFS) {
    if (t === def.key.toLowerCase()) return def.key;
    if (def.aliases.some((a) => t === String(a).toLowerCase())) return def.key;
    if (t.startsWith(`${def.letter.toLowerCase()} -`) || t.startsWith(`${def.letter.toLowerCase()} `)) return def.key;
  }
  return null;
}

/**
 * Split treatment-plan prose into Goal N / Objective N / Projected Time / Discharge panels.
 * Returns ordered panel defs: { id, title, text, isTreatmentPlan, kind, index }.
 */
export function parseTreatmentPlanPanelsFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const lines = raw.split(/\r?\n/);
  const panels = [];
  let current = null;
  let lastGoalIndex = null;

  const flush = () => {
    if (!current) return;
    const body = current.buffer.join('\n').trim();
    if (body || current.kind === 'goal' || current.kind === 'objective') {
      panels.push({
        id: current.id,
        title: current.title,
        text: body,
        isTreatmentPlan: true,
        kind: current.kind,
        index: current.index
      });
    }
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) current.buffer.push(line);
      continue;
    }
    const match = trimmed.match(TREATMENT_PLAN_HEADER_RE);
    if (match) {
      flush();
      const label = String(match[1] || '').trim();
      const goalNum = match[2] ? Number(match[2]) : null;
      const objRef = match[3] ? String(match[3]).trim() : null;
      const inline = String(match[4] || '').trim();
      let kind = 'other';
      let index = null;
      let id = label;
      let title = label;
      if (goalNum != null && !Number.isNaN(goalNum)) {
        kind = 'goal';
        index = goalNum;
        lastGoalIndex = goalNum;
        id = `Goal ${goalNum}`;
        title = `Goal ${goalNum}`;
      } else if (objRef) {
        kind = 'objective';
        index = Number(objRef.split('.')[0]) || 1;
        id = `Objective ${objRef}`;
        title = `Objective ${objRef}`;
      } else if (/^projected\s*time/i.test(label)) {
        kind = 'projected_time';
        index = lastGoalIndex;
        id = lastGoalIndex != null ? `Projected Time ${lastGoalIndex}` : 'Projected Time';
        title = id;
      } else if (/^discharge/i.test(label)) {
        kind = 'discharge';
        id = 'Discharge Plan';
        title = 'Discharge Plan';
      }
      current = { id, title, kind, index, buffer: inline ? [inline] : [] };
      continue;
    }
    if (!current) {
      // preamble before first Goal — keep as Intro if substantial
      current = { id: 'Treatment Plan Intro', title: 'Treatment Plan Intro', kind: 'intro', index: null, buffer: [line] };
    } else {
      current.buffer.push(line);
    }
  }
  flush();

  // Prefer real plan structure: at least one Goal + one Objective
  const hasGoal = panels.some((p) => p.kind === 'goal');
  const hasObj = panels.some((p) => p.kind === 'objective');
  if (!hasGoal || !hasObj) return [];
  return panels;
}

/** Build alternating Goal/Objective panels from a sections map or Output blob. */
export function buildTreatmentPlanPanels(sectionsObj) {
  const sections = sectionsObj && typeof sectionsObj === 'object' ? { ...sectionsObj } : {};
  const fromKeys = [];
  const keyRe = /^(Goal|Objective|Projected\s*Time(?:\s*to\s*Completion)?|Discharge(?:\s*Plan)?)\s*(\d+)?$/i;
  for (const [k, v] of Object.entries(sections)) {
    const m = String(k || '').trim().match(keyRe);
    if (!m) continue;
    const text = String(v || '').trim();
    if (!text) continue;
    const label = m[1];
    const num = m[2] ? Number(m[2]) : null;
    let kind = 'other';
    let id = String(k).trim();
    let title = id;
    if (/^goal$/i.test(label) && num != null) {
      kind = 'goal';
      id = `Goal ${num}`;
      title = id;
    } else if (/^objective$/i.test(label) && num != null) {
      kind = 'objective';
      id = `Objective ${num}`;
      title = id;
    } else if (/^projected/i.test(label)) {
      kind = 'projected_time';
      id = num != null ? `Projected Time ${num}` : 'Projected Time';
      title = id;
    } else if (/^discharge/i.test(label)) {
      kind = 'discharge';
      id = 'Discharge Plan';
      title = id;
    }
    fromKeys.push({ id, title, text, isTreatmentPlan: true, kind, index: num });
  }
  if (fromKeys.filter((p) => p.kind === 'goal').length && fromKeys.filter((p) => p.kind === 'objective').length) {
    // Sort Goal1, Obj1, Time1, Goal2, ...
    fromKeys.sort((a, b) => {
      const ai = a.index ?? (a.kind === 'discharge' ? 999 : 0);
      const bi = b.index ?? (b.kind === 'discharge' ? 999 : 0);
      if (ai !== bi) return ai - bi;
      const order = { goal: 0, objective: 1, projected_time: 2, discharge: 3, intro: -1, other: 4 };
      return (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
    });
    return fromKeys;
  }

  const blob =
    String(sections.Output || '').trim()
    || String(sections['Treatment Plan'] || '').trim()
    || (Object.keys(sections).length === 1 ? String(Object.values(sections)[0] || '').trim() : '');
  if (blob) return parseTreatmentPlanPanelsFromText(blob);
  return [];
}

/**
 * Split raw note text (including a single "Output" blob) into SOAP section keys.
 * Handles inline headers like "1. Subjective: Client reported…"
 */
export function parseSoapSectionsFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};

  const lines = raw.split(/\r?\n/);
  const sections = {};
  let currentKey = null;
  let buffer = [];

  const flush = () => {
    if (!currentKey) return;
    const content = buffer.join('\n').trim();
    if (content) sections[currentKey] = content;
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentKey) buffer.push(line);
      continue;
    }
    const match = trimmed.match(SOAP_INLINE_HEADER_RE);
    if (match) {
      const key = normalizeSectionKey(match[1]);
      if (key) {
        flush();
        currentKey = key;
        const inlineBody = String(match[2] || '').trim();
        if (inlineBody) buffer.push(inlineBody);
        continue;
      }
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

/** Expand a sections map when the model returned one numbered Output blob. */
export function expandSoapSections(sectionsObj) {
  const sections = sectionsObj && typeof sectionsObj === 'object' ? { ...sectionsObj } : {};
  const soapCount = SOAP_SECTION_DEFS.filter((d) => String(sections[d.key] || '').trim()).length;
  if (soapCount >= 2) return sections;

  const blob =
    String(sections.Output || '').trim() ||
    (Object.keys(sections).length === 1 ? String(Object.values(sections)[0] || '').trim() : '');
  if (!blob) return sections;

  const parsed = parseSoapSectionsFromText(blob);
  if (Object.keys(parsed).length < 2) return sections;

  const { Output: _drop, ...rest } = sections;
  return { ...rest, ...parsed };
}

export function extractSections(obj) {
  if (!obj || typeof obj !== 'object') return {};
  let out = {};
  if (obj.sections && typeof obj.sections === 'object' && !Array.isArray(obj.sections)) {
    out = { ...obj.sections };
  } else {
    for (const [k, v] of Object.entries(obj)) {
      const key = String(k || '').trim();
      if (!key) continue;
      if (key.toLowerCase() === 'meta' || key.toLowerCase() === 'metadata') continue;
      if (typeof v === 'string') out[key] = v;
    }
  }
  return expandSoapSections(out);
}

export function parseDraftOutputObject(draft) {
  const raw = draft?.output_json ?? draft?.outputJson ?? draft?.raw?.output_json ?? draft?.raw?.outputJson;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export function soapSectionTextFromDraft(draft, key) {
  const sections = extractSections(parseDraftOutputObject(draft) || {});
  return String(sections[key] || '').trim();
}

/**
 * Returns ordered display panels.
 * Prefer SOAP when ≥2 SOAP sections; else treatment-plan Goal/Objective pairs; else raw sections.
 */
export function buildDisplaySections(sectionsObj) {
  const sections = expandSoapSections(
    sectionsObj && typeof sectionsObj === 'object' ? sectionsObj : {}
  );
  const usedKeys = new Set();
  const soapPanels = [];

  for (const def of SOAP_SECTION_DEFS) {
    let text = '';
    for (const [k, v] of Object.entries(sections)) {
      const mapped = normalizeSectionKey(k);
      if (mapped === def.key) {
        text = String(v || '').trim();
        usedKeys.add(k);
        break;
      }
    }
    if (text) {
      soapPanels.push({
        id: def.key,
        letter: def.letter,
        title: `${def.letter} - ${def.label}`,
        text,
        isSoap: true,
        isTreatmentPlan: false
      });
    }
  }

  if (soapPanels.length >= 2) {
    const otherPanels = [];
    for (const [k, v] of Object.entries(sections)) {
      if (usedKeys.has(k)) continue;
      const text = String(v || '').trim();
      if (!text) continue;
      otherPanels.push({
        id: k,
        letter: '',
        title: k,
        text,
        isSoap: false,
        isTreatmentPlan: false
      });
    }
    return [...soapPanels, ...otherPanels];
  }

  const planPanels = buildTreatmentPlanPanels(sections);
  if (planPanels.length >= 2) {
    return planPanels.map((p) => ({
      ...p,
      letter: p.kind === 'goal' ? 'G' : p.kind === 'objective' ? 'O' : '',
      isSoap: false
    }));
  }

  // Not enough SOAP / plan structure — show all sections in original order
  return Object.entries(sections)
    .map(([k, v]) => ({
      id: k,
      letter: normalizeSectionKey(k)
        ? SOAP_SECTION_DEFS.find((d) => d.key === normalizeSectionKey(k))?.letter || ''
        : '',
      title: normalizeSectionKey(k)
        ? `${SOAP_SECTION_DEFS.find((d) => d.key === normalizeSectionKey(k)).letter} - ${SOAP_SECTION_DEFS.find((d) => d.key === normalizeSectionKey(k)).label}`
        : k,
      text: String(v || '').trim(),
      isSoap: !!normalizeSectionKey(k),
      isTreatmentPlan: false
    }))
    .filter((p) => p.text);
}

export function formatFullNoteCopy({
  sections = {},
  meta = {},
  initials = '',
  dateOfService = '',
  dateWritten = '',
  noteTypeLabel = 'Progress Note',
  includeInteractiveComplexity = false
}) {
  const panels = buildDisplaySections(sections);
  const lines = [];
  lines.push('AI Generated Clinical Note');
  lines.push(`Client: ${initials || meta.initials || '—'}`);
  lines.push(`Date of Service: ${dateOfService || meta.dateOfService || '—'}`);
  const created = dateWritten || meta.dateWritten || meta.createdAt || '';
  if (created) lines.push(`Created: ${created}`);
  lines.push(`Note Type: ${noteTypeLabel}`);
  if (includeInteractiveComplexity || meta.includeInteractiveComplexity) {
    lines.push('Interactive Complexity: Included');
  }
  lines.push('');
  for (const panel of panels) {
    lines.push(panel.title);
    lines.push(panel.text);
    lines.push('');
  }
  return lines.join('\n').trim();
}

function mseStatusLabel(status) {
  const s = String(status || 'normal').toLowerCase();
  if (s === 'not_assessed') return 'Not assessed';
  if (s === 'abnormal') return 'Abnormal';
  return 'Normal';
}

/** Read-only MSE lines for chart copy / display. */
export function formatMentalStatusExamLines(mse, { domains = [] } = {}) {
  if (!mse) return [];
  if (mse.allNotAssessed) return ['All domains not assessed'];
  if (mse.allNormal) return ['All domains within normal limits'];
  const list = domains.length ? domains : Object.keys(mse.domains || {});
  const lines = [];
  for (const domain of list) {
    const val = mse.domains?.[domain] || { status: 'normal', detail: '' };
    const label = mseStatusLabel(val.status);
    const detail = String(val.detail || '').trim();
    lines.push(detail && val.status === 'abnormal' ? `${domain}: ${label} — ${detail}` : `${domain}: ${label}`);
  }
  return lines;
}

export function formatRiskAssessmentText(risk) {
  if (!risk) return '';
  if (risk.patientDeniesAll) return 'Patient denies all areas of risk.';
  const areas = Array.isArray(risk.areas) ? risk.areas : [];
  const bits = areas
    .filter((a) => String(a?.name || '').trim())
    .map((a) => {
      const level = a.level ? ` (${String(a.level).replace(/_/g, ' ')})` : '';
      const details = String(a.details || '').trim();
      return details ? `${a.name}${level}: ${details}` : `${a.name}${level}`;
    });
  return bits.length ? bits.join('\n') : 'Risk areas documented.';
}

export function formatMedicationsText(medications) {
  if (!medications) return '';
  if (medications.noneCurrently) {
    const comments = String(medications.commentsHtml || medications.comments || '').trim();
    return comments ? `None currently.\n${comments}` : 'None currently.';
  }
  const items = (medications.items || [])
    .filter((m) => String(m?.name || '').trim())
    .map((m) => {
      const dose = String(m.dose || '').trim();
      return dose ? `${m.name} — ${dose}` : m.name;
    });
  const comments = String(medications.commentsHtml || medications.comments || '').trim();
  return [...items, comments].filter(Boolean).join('\n');
}

export function formatObjectiveRatingLine(r) {
  const goal = r.goalIndex != null ? `G${r.goalIndex}` : '';
  const obj = r.objectiveIndex != null ? `O${r.objectiveIndex}` : '';
  const prefix = [goal, obj].filter(Boolean).join(' · ');
  const text = r.objectiveText || r.goalText || 'Objective';
  const disp = String(r.disposition || 'rated').replace(/_/g, ' ');
  if (r.disposition && r.disposition !== 'rated') {
    return `${prefix ? `${prefix} ` : ''}${text}: ${disp}`;
  }
  const val = r.scaleValue != null ? `${r.scaleValue}/10` : '—';
  const target = r.scaleTarget != null ? ` (goal ${r.scaleTarget})` : '';
  const progress = r.progressLabel ? ` · ${String(r.progressLabel).replace(/_/g, ' ')}` : '';
  const rater =
    r.raterKind && r.raterKind !== 'clinician'
      ? ` · ${r.raterLabel || r.raterKind}`
      : '';
  return `${prefix ? `${prefix} ` : ''}${text}: ${val}${target}${progress}${rater}`;
}

/** Full chart note text including clinical sections + SOAP (for EHR paste). */
export function formatChartClinicalNoteCopy({
  note = {},
  panels = [],
  mseDomains = []
} = {}) {
  const lines = [];
  const title = note.title || 'Clinical note';
  lines.push(title);
  if (note.dateOfService) lines.push(`Date of service: ${String(note.dateOfService).slice(0, 10)}`);
  if (note.serviceCode) lines.push(`Service code: ${note.serviceCode}`);
  if (note.noteType) lines.push(`Note type: ${String(note.noteType).replace(/_/g, ' ')}`);
  const sc = note.structuredChart || note.metadata?.structuredChart || {};
  if (sc.participants) lines.push(`Participants: ${sc.participants}`);
  if (sc.durationMinutes != null && sc.durationMinutes !== '') {
    lines.push(`Duration: ${sc.durationMinutes} min`);
  }
  lines.push('');

  const dx = note.primaryDiagnosis;
  if (dx?.icd10Code || dx?.description) {
    lines.push('Diagnosis');
    lines.push([dx.icd10Code, dx.description].filter(Boolean).join(' — '));
    lines.push('');
  }
  const justification = note.diagnosticJustification || sc.diagnosticJustification;
  if (justification) {
    lines.push('Diagnostic justification');
    lines.push(String(justification).trim());
    lines.push('');
  }

  const ratings = note.objectiveRatings || [];
  if (ratings.length) {
    lines.push('Treatment objective ratings');
    for (const r of ratings) lines.push(formatObjectiveRatingLine(r));
    lines.push('');
  }

  if (sc.skippedMseReason) {
    lines.push('Mental status exam');
    lines.push(`Skipped (${sc.skippedMseReason})`);
    lines.push('');
  } else if (sc.mentalStatusExam) {
    lines.push('Mental status exam');
    for (const line of formatMentalStatusExamLines(sc.mentalStatusExam, { domains: mseDomains })) {
      lines.push(line);
    }
    lines.push('');
  }

  const riskText = formatRiskAssessmentText(sc.riskAssessment);
  if (riskText) {
    lines.push('Risk assessment');
    lines.push(riskText);
    lines.push('');
  }

  const medText = formatMedicationsText(sc.medications);
  if (medText) {
    lines.push('Medications');
    lines.push(medText);
    lines.push('');
  }

  for (const panel of panels) {
    lines.push(panel.title);
    lines.push(panel.text);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function formatDraftListDate(raw) {
  try {
    if (!raw) return { month: '', day: '' };
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return { month: '', day: '' };
    return {
      month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
      day: String(d.getDate()).padStart(2, '0')
    };
  } catch {
    return { month: '', day: '' };
  }
}

export function formatDraftListTime(raw) {
  try {
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
