import { MSE_DOMAIN_DEFS, RISK_DOMAIN_DEFS, buildDeniedRiskAssessment, emptyRiskAssessment, domainSelectionLabel } from './noteAidMseCatalog';
import { parseScalePair, inferScaleDirection, DEFAULT_MEASUREMENT_METHOD } from './treatmentPlanDuration';

const clean = (value) => String(value || '').replace(/\*\*/g, '').trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
export function intakeSection(sections, ...names) {
  const found = Object.entries(sections || {}).find(([name]) => names.some((n) => key(n) === key(name)));
  return clean(found?.[1]);
}

export function intakeDiagnoses(sections) {
  const text = intakeSection(sections, 'Diagnosis', 'Diagnoses');
  const justification = intakeSection(sections, 'Diagnostic Justification');
  const rows = [];
  const lines = text.split('\n').map(clean);
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(?:[-•]\s*|\d+[.)]\s*)?(?:(?:primary|secondary|diagnosis)\s*:\s*)?([A-TV-Z]\d[\dA-Z](?:\.[A-Z0-9]{1,4})?)\b[\s:–—-]*(.*)$/i);
    if (!match || rows.some((d) => d.icd10_code === match[1].toUpperCase())) continue;
    const description = match[2] || (lines[i + 1] && !/^[A-TV-Z]\d/.test(lines[i + 1]) ? lines[++i] : '');
    rows.push({ icd10_code: match[1].toUpperCase(), description, is_primary: rows.length ? 0 : 1, is_active: 1, justification });
  }
  return rows;
}

const mseAliases = {
  generalappearance: ['Appearance'], dress: ['Appearance'], interviewbehavior: ['Behavior'],
  motoractivity: ['Psychomotor Activity'], attentionconcentration: ['Attention and Concentration'],
  judgmentimpulsecontrol: ['Judgment', 'Impulse Control']
};
export function intakeAssessments(sections) {
  const mseText = intakeSection(sections, 'Mental Status Examination', 'Mental Status Exam', 'Current Mental Status');
  const domains = {};
  const unmapped = [];
  for (const line of mseText.split('\n').filter(Boolean)) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    const aliases = match && mseAliases[key(match[1])];
    const defs = match && (Array.isArray(aliases) ? aliases : MSE_DOMAIN_DEFS.filter((d) => key(d.key) === key(match[1])).map((d) => d.key));
    if (!defs?.length) { unmapped.push(line); continue; }
    for (const domain of defs) {
      const value = clean(match[2]);
      // Preserve the supplied observation (including orientation ×3); do not infer normal findings.
      domains[domain] = { status: /^(not assessed|unable to assess)$/i.test(value) ? 'not_assessed' : 'selected', option: value, detail: '' };
    }
  }
  const riskText = intakeSection(sections, 'Risk Assessment');
  let risk = emptyRiskAssessment();
  // Only this explicit global denial supports the global toggle. Additional findings require review.
  if (/^(?:patient|client) denies all areas of risk[.]?\s*(?:no contrary clinical indications present[.]?|and no contraindications[.]?)?$/i.test(riskText)) {
    risk = buildDeniedRiskAssessment(riskText);
  } else {
    risk.notes = riskText;
    for (const line of riskText.split('\n')) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      const def = match && RISK_DOMAIN_DEFS.find((d) => key(d.key) === key(match[1]));
      if (def) risk.items[def.key] = { status: 'selected', option: clean(match[2]), detail: '' };
    }
  }
  return { mentalStatusExam: { allNormal: false, allNotAssessed: false, domains }, riskAssessment: risk, unmappedMse: unmapped };
}

/** Update generated cells, preserving fields the clinician changed after generation. */
export function mergeGeneratedAssessment(current, previous, next) {
  const result = JSON.parse(JSON.stringify(current));
  if (next.domains && (current.allNormal || current.allNotAssessed)) return result;
  for (const field of ['domains', 'items']) {
    if (!next[field]) continue;
    result[field] ||= {};
    for (const name of new Set([...Object.keys(previous?.[field] || {}), ...Object.keys(next[field])])) {
      const existing = current?.[field]?.[name];
      const prior = previous?.[field]?.[name];
      if (prior ? JSON.stringify(existing) === JSON.stringify(prior) : !existing?.status && !existing?.option) {
        result[field][name] = next[field][name] || { status: '', option: '', detail: '' };
      }
    }
  }
  for (const field of ['patientDeniesAll', 'notes']) {
    const unedited = previous ? current[field] === previous[field] : !current?.[field];
    const existingRiskFindings = !previous && field === 'patientDeniesAll' && Object.values(current.items || {}).some((cell) => cell?.option || cell?.status);
    if (field in next && unedited && !existingRiskFindings) result[field] = next[field];
  }
  return result;
}

export function generatedTreatmentPlan(sections, { effectiveDate, diagnoses = [], diagnosticJustification = '' } = {}) {
  const goals = new Map();
  const entries = Object.entries(sections || {});
  for (const [name, value] of entries) {
    const match = clean(name).match(/^(?:Treatment\s+)?Goal\s+(\d+)$/i);
    if (match) goals.set(Number(match[1]), { goalText: clean(value), objectives: [] });
  }
  for (const [name, value] of entries) {
    const match = clean(name).match(/^Objective\s+(\d+)(?:\.(\d+))?$/i);
    if (!match || !goals.has(Number(match[1]))) continue;
    const scales = parseScalePair(value);
    const interventions = intakeSection(sections, `Interventions ${match[1]}.${match[2] || 1}`, `Intervention ${match[1]}.${match[2] || 1}`);
    goals.get(Number(match[1])).objectives.push({
      objectiveIndex: Number(match[2] || 1), objectiveText: clean(value), ...scales,
      scaleDirection: inferScaleDirection(scales.scaleCurrent, scales.scaleTarget),
      measurementMethod: DEFAULT_MEASUREMENT_METHOD,
      interventions: interventions.split(/\n|;|,/).map((value) => clean(value).replace(/^[-•]\s*/, '')).filter(Boolean)
    });
  }
  for (const [index, goal] of goals) {
    const time = intakeSection(sections, `Projected Time ${index}`, `Projected Completion ${index}`);
    const months = time.match(/(\d+)\s*(months?|years?)/i);
    goal.durationMonths = months ? Number(months[1]) * (/year/i.test(months[2]) ? 12 : 1) : null;
    goal.projectedCompletion = /^\d{4}-\d{2}-\d{2}$/.test(time) ? time : null;
    goal.objectives.sort((a, b) => a.objectiveIndex - b.objectiveIndex);
  }
  return {
    effectiveDate,
    diagnoses: diagnoses.map((d) => ({ icd10Code: d.icd10_code, description: d.description, isPrimary: !!Number(d.is_primary) })),
    diagnosticJustification,
    presentingProblem: intakeSection(sections, 'Presenting Problem'),
    prescribedFrequency: intakeSection(sections, 'Prescribed Frequency of Treatment', 'Prescribed Treatment Frequency', 'Prescribed Frequency'),
    dischargePlan: intakeSection(sections, 'Discharge Plan', 'Discharge Criteria/Planning'),
    goals: [...goals.entries()].sort(([a], [b]) => a - b).map(([, g]) => g)
  };
}

export function intakeSectionsForRecord(sections, { mentalStatusExam, riskAssessment, diagnoses, diagnosticJustification }) {
  const result = { ...sections };
  const set = (names, text) => {
    const existing = Object.keys(result).find((name) => names.some((n) => key(n) === key(name)));
    if (text || existing) result[existing || names[0]] = text;
  };
  const mseLines = Object.entries(mentalStatusExam?.domains || {}).map(([domain, cell]) => {
    const label = domainSelectionLabel(cell);
    return label ? `${domain}: ${label}` : '';
  }).filter(Boolean);
  set(['Mental Status Examination', 'Mental Status Exam', 'Current Mental Status'], [...mseLines, ...intakeAssessments(sections).unmappedMse].join('\n'));
  if (riskAssessment) {
    const riskLines = Object.entries(riskAssessment.items || {}).map(([domain, cell]) => {
      const label = domainSelectionLabel(cell);
      return label ? `${domain}: ${label}` : '';
    }).filter(Boolean);
    const notes = riskAssessment.notes || '';
    set(['Risk Assessment'], riskAssessment.patientDeniesAll
      ? 'Patient denies all areas of risk. No contrary clinical indications present.'
      : [...riskLines, /^(?:patient|client) denies all areas of risk/i.test(notes) ? '' : notes].filter(Boolean).join('\n'));
  }
  if (diagnoses?.length) {
    set(['Diagnosis', 'Diagnoses'], diagnoses.map((d) => `${d.icd10_code} ${d.description || ''}`.trim()).join('\n'));
    set(['Diagnostic Justification'], diagnosticJustification || '');
  }
  return result;
}
