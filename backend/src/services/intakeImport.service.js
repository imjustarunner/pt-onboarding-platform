/**
 * Parse pasted intake note text into ordered independent sections for review.
 */

export const CANONICAL_INTAKE_SECTIONS = [
  'Biopsychosocial Assessment',
  'Presenting Problem',
  'Chief Complaint',
  'Identification',
  'History of Present Problem',
  'History of Present Illness',
  'Psychiatric History',
  'Trauma History',
  'Family Psychiatric History',
  'Medical Conditions & History',
  'Medical History',
  'Substance Use',
  'Substance Use History',
  'Current Medications',
  'Family History',
  'Social History',
  'Spiritual/Cultural Factors',
  'Developmental History',
  'Educational/Vocational History',
  'Legal History',
  'SNAP',
  'Other Important Information',
  'Mental Status Examination',
  'Risk Assessment',
  'Objective',
  'Subjective',
  'Assessment',
  'Clinical Impressions',
  'Diagnosis',
  'Diagnostic Justification',
  'Plan',
  'Treatment Recommendations',
  'Goals',
  'Interventions',
  'Discharge Plan'
];

/** Alternate headers seen in pasted notes → canonical titles. */
const SECTION_HEADER_ALIASES = {
  'current mental status': 'Mental Status Examination',
  'mental status exam': 'Mental Status Examination',
  'mental status examination': 'Mental Status Examination',
  'mental status': 'Mental Status Examination',
  'mse': 'Mental Status Examination',
  'objective content': 'Objective',
  'other important infor': 'Other Important Information'
};

const HEADER_MATCH_NAMES = [
  ...CANONICAL_INTAKE_SECTIONS,
  'Current Mental Status',
  'Mental Status Exam',
  'Mental Status',
  'MSE',
  'Objective Content',
  'Other Important Infor'
];

/** Sub-headers that should not become their own section or pollute titles. */
const SUBSECTION_SKIP_LINES = new Set([
  'content',
  'data',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'narrative'
]);

/** Standard MSE items (label on one line, value on the next, or "Label: Value"). */
export const MSE_FIELD_LABELS = [
  'Orientation',
  'General Appearance',
  'Dress',
  'Motor Activity',
  'Interview Behavior',
  'Speech',
  'Mood',
  'Affect',
  'Insight',
  'Judgment/Impulse Control',
  'Memory',
  'Attention/Concentration',
  'Thought Process',
  'Thought Content',
  'Perception',
  'Functional Status'
];

const ICD10_RE = /\b([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)\b/i;
const ICD10_LINE_RE = /^([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)(?:\s+(.+))?$/i;

function normalizeHeader(key) {
  const s = String(key || '').trim();
  const lower = s.toLowerCase();
  if (SECTION_HEADER_ALIASES[lower]) return SECTION_HEADER_ALIASES[lower];
  const match = CANONICAL_INTAKE_SECTIONS.find((c) => c.toLowerCase() === lower);
  return match || s;
}

function stripSubsectionLead(content) {
  const lines = String(content || '').split('\n');
  while (lines.length && SUBSECTION_SKIP_LINES.has(String(lines[0] || '').trim().toLowerCase())) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

function buildHeaderRegex() {
  const escaped = [...HEADER_MATCH_NAMES]
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(
    `^(?:\\d+[.)\\s-]+)?(?:\\*{1,2})?(${escaped.join('|')})(?:\\*{1,2})?\\s*:?\\s*(.*)$`,
    'i'
  );
}

const headerRe = buildHeaderRegex();

const mseFieldRe = new RegExp(
  `^(${MSE_FIELD_LABELS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:?\\s*(.*)$`,
  'i'
);

function canonicalMseLabel(raw) {
  const lower = String(raw || '').trim().toLowerCase();
  return MSE_FIELD_LABELS.find((l) => l.toLowerCase() === lower) || String(raw || '').trim();
}

/**
 * Turn label/value MSE lines into "Label: Value" per field.
 */
export function formatMentalStatusContent(content) {
  const lines = String(content || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^current mental status$/i.test(l) && !/^mental status( exam(ination)?)?$/i.test(l));
  const out = [];
  let pending = null;
  for (const line of lines) {
    const m = line.match(mseFieldRe);
    if (m) {
      const label = canonicalMseLabel(m[1]);
      const rest = String(m[2] || '').trim();
      if (rest) {
        out.push(`${label}: ${rest}`);
        pending = null;
      } else {
        pending = label;
      }
      continue;
    }
    if (pending) {
      out.push(`${pending}: ${line}`);
      pending = null;
      continue;
    }
    out.push(line);
  }
  if (pending) out.push(`${pending}:`);
  return out.join('\n').trim();
}

/**
 * Parse ICD-10 diagnosis lines from a diagnosis block or full note.
 * Supports "F41.1 GAD" on one line or code on one line and description on the next.
 * Shared diagnostic justification is stored on the first (primary) diagnosis only.
 * @returns {Array<{ code: string, description: string, justification: string, isPrimary: boolean }>}
 */
export function parseIntakeDiagnoses(rawText) {
  const raw = String(rawText || '').replace(/\r\n/g, '\n');
  const diagnoses = [];
  const seen = new Set();

  const addDx = (code, description) => {
    const c = String(code || '').trim().toUpperCase();
    if (!c || seen.has(c)) return;
    seen.add(c);
    diagnoses.push({
      code: c,
      description: String(description || '').trim(),
      justification: '',
      isPrimary: diagnoses.length === 0
    });
  };

  let pendingCode = null;
  for (const line of raw.split('\n')) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    if (/^diagnos(?:is|es|tic)?\b/i.test(trimmed) && !ICD10_RE.test(trimmed) && !/justification/i.test(trimmed)) {
      continue;
    }
    if (/^diagnostic\s+justification/i.test(trimmed)) break;

    if (pendingCode && !ICD10_RE.test(trimmed)) {
      addDx(pendingCode, trimmed);
      pendingCode = null;
      continue;
    }

    const lineMatch = trimmed.match(ICD10_LINE_RE);
    if (lineMatch && !/^diagnos/i.test(trimmed.split(/\s+/)[0] || '')) {
      const code = lineMatch[1];
      const rest = String(lineMatch[2] || '').trim();
      if (rest) {
        pendingCode = null;
        addDx(code, rest);
      } else {
        pendingCode = code;
      }
      continue;
    }

    const codes = trimmed.match(/([A-TV-Z][0-9][0-9A-Z](?:\.[0-9A-Z]{1,4})?)/gi);
    if (codes?.length === 1) {
      const code = codes[0].toUpperCase();
      let rest = trimmed.replace(new RegExp(code.replace('.', '\\.'), 'i'), '').trim();
      rest = rest.replace(/^diagnos(?:is|tic)?(?:\s+code)?\s*[:\-]?\s*/i, '').trim();
      rest = rest.replace(/^[\s\-–—:]+/, '').trim();
      if (rest) {
        pendingCode = null;
        addDx(code, rest);
      } else {
        pendingCode = code;
      }
    }
  }
  if (pendingCode) addDx(pendingCode, '');

  const justMatch = raw.match(
    /\bDiagnostic\s+Justification\s*:?\s*([\s\S]+?)(?:\n\s*\n(?:Plan|Treatment|Goal|Discharge|\d+\.)|\n\s*(?:Plan|Treatment Goal)\b|$)/i
  );
  const sharedJustification = justMatch ? justMatch[1].trim() : '';
  if (sharedJustification && diagnoses.length) {
    diagnoses[0].justification = sharedJustification;
  }

  return diagnoses;
}

/**
 * @returns {{
 *   sections: Array<{ key: string, title: string, content: string, order: number }>,
 *   diagnoses: Array<{ code: string, description: string, justification: string, isPrimary: boolean }>,
 *   diagnosisText: string|null,
 *   sourceOrder: string[]
 * }}
 */
export function parseIntakeSections(rawText) {
  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!raw) {
    return { sections: [], diagnoses: [], diagnosisText: null, sourceOrder: [] };
  }

  const lines = raw.split('\n');
  const sections = [];
  let currentKey = null;
  let buffer = [];

  const flush = () => {
    if (!currentKey) return;
    let content = buffer.join('\n').trim();
    content = stripSubsectionLead(content);
    if (/^diagnos/i.test(currentKey)) {
      buffer = [];
      currentKey = null;
      return;
    }
    if (currentKey === 'Mental Status Examination') {
      content = formatMentalStatusContent(content);
    }
    if (content) {
      sections.push({
        key: currentKey,
        title: currentKey,
        content,
        order: sections.length + 1
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentKey) buffer.push('');
      continue;
    }
    const m = trimmed.match(headerRe);
    if (m) {
      flush();
      currentKey = normalizeHeader(m[1]);
      const rest = String(m[2] || '').trim();
      buffer = rest && !SUBSECTION_SKIP_LINES.has(rest.toLowerCase()) ? [rest] : [];
      continue;
    }
    if (!currentKey) {
      currentKey = 'Narrative';
    }
    buffer.push(trimmed);
  }
  flush();

  const merged = [];
  const indexByKey = new Map();
  for (const sec of sections) {
    const existing = indexByKey.get(sec.key);
    if (existing == null) {
      indexByKey.set(sec.key, merged.length);
      merged.push({ ...sec, order: merged.length + 1 });
    } else {
      merged[existing].content = `${merged[existing].content}\n\n${sec.content}`.trim();
    }
  }

  const diagnoses = parseIntakeDiagnoses(raw);
  const dxSection = merged.find((s) => /^diagnos/i.test(s.key) && !/justification/i.test(s.key));
  const diagnosisText = dxSection?.content || null;

  return {
    sections: merged.filter((s) => !/^diagnos/i.test(s.key) || /justification/i.test(s.key)),
    diagnoses,
    diagnosisText,
    sourceOrder: merged.map((s) => s.key)
  };
}

export default { parseIntakeSections, parseIntakeDiagnoses, formatMentalStatusContent, CANONICAL_INTAKE_SECTIONS };
