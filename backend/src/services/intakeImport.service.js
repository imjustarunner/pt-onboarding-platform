/**
 * Parse pasted intake note text into ordered independent sections for review.
 */

export const CANONICAL_INTAKE_SECTIONS = [
  'Presenting Problem',
  'Chief Complaint',
  'History of Present Illness',
  'Psychiatric History',
  'Substance Use History',
  'Medical History',
  'Family History',
  'Social History',
  'Mental Status Examination',
  'Risk Assessment',
  'Diagnosis',
  'Clinical Impressions',
  'Assessment',
  'Plan',
  'Treatment Recommendations',
  'Goals',
  'Objective',
  'Subjective',
  'Interventions',
  'Discharge Plan'
];

function normalizeHeader(key) {
  const s = String(key || '').trim().toLowerCase();
  const match = CANONICAL_INTAKE_SECTIONS.find((c) => c.toLowerCase() === s);
  return match || String(key || '').trim();
}

/**
 * @returns {{
 *   sections: Array<{ key: string, title: string, content: string, order: number }>,
 *   diagnosisText: string|null,
 *   sourceOrder: string[]
 * }}
 */
export function parseIntakeSections(rawText) {
  const raw = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!raw) {
    return { sections: [], diagnosisText: null, sourceOrder: [] };
  }

  const lines = raw.split('\n');
  const sections = [];
  let currentKey = null;
  let buffer = [];

  const flush = () => {
    if (!currentKey) return;
    const content = buffer.join('\n').trim();
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

  const headerRe = new RegExp(
    `^(?:\\d+[.)\\s-]+)?(?:\\*{1,2})?` +
      `(${CANONICAL_INTAKE_SECTIONS.map((k) => k.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|')})` +
      `(?:\\*{1,2})?\\s*:?\\s*(.*)$`,
    'i'
  );

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
      buffer = rest ? [rest] : [];
      continue;
    }
    if (!currentKey) {
      currentKey = 'Narrative';
    }
    buffer.push(trimmed);
  }
  flush();

  // Merge duplicate keys while preserving first-seen order
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

  const dx = merged.find((s) => /^diagnos/i.test(s.key));
  return {
    sections: merged,
    diagnosisText: dx?.content || null,
    sourceOrder: merged.map((s) => s.key)
  };
}

export default { parseIntakeSections, CANONICAL_INTAKE_SECTIONS };
