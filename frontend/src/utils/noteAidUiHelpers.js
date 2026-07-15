/**
 * Helpers for Note Aid workspace: SOAP mapping, interventions, copy text.
 */

export const SOAP_SECTION_DEFS = [
  { key: 'Subjective', letter: 'S', label: 'Subjective', aliases: ['Symptom Description and Subjective Report', 'S - Subjective'] },
  { key: 'Objective', letter: 'O', label: 'Objective', aliases: ['Objective Content', 'O - Objective'] },
  { key: 'Interventions', letter: 'I', label: 'Interventions', aliases: ['Interventions Used', 'I - Interventions'] },
  { key: 'Plan', letter: 'P', label: 'Plan', aliases: ['P - Plan'] }
];

export const INTERVENTION_TYPE_OPTIONS = [
  'CBT',
  'DBT',
  'Mindfulness-Based',
  'Psychoeducation',
  'Motivational Interviewing',
  'Supportive Therapy',
  'Behavioral Activation',
  'Problem Solving',
  'Relapse Prevention',
  'Family/Caregiver Involvement',
  'Crisis Intervention',
  'Other'
];

export function extractSections(obj) {
  if (!obj || typeof obj !== 'object') return {};
  if (obj.sections && typeof obj.sections === 'object' && !Array.isArray(obj.sections)) return obj.sections;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k || '').trim();
    if (!key) continue;
    if (key.toLowerCase() === 'meta' || key.toLowerCase() === 'metadata') continue;
    if (typeof v === 'string') out[key] = v;
  }
  return out;
}

function normalizeSectionKey(title) {
  const t = String(title || '').trim().toLowerCase();
  for (const def of SOAP_SECTION_DEFS) {
    if (t === def.key.toLowerCase()) return def.key;
    if (def.aliases.some((a) => t === String(a).toLowerCase())) return def.key;
    if (t.startsWith(`${def.letter.toLowerCase()} -`) || t.startsWith(`${def.letter.toLowerCase()} `)) return def.key;
  }
  return null;
}

/**
 * Returns ordered display panels. SOAP panels first when any SOAP content exists;
 * remaining non-SOAP sections follow.
 */
export function buildDisplaySections(sectionsObj) {
  const sections = sectionsObj && typeof sectionsObj === 'object' ? sectionsObj : {};
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
        isSoap: true
      });
    }
  }

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
      isSoap: false
    });
  }

  if (soapPanels.length >= 2) return [...soapPanels, ...otherPanels];
  // Not enough SOAP structure — show all sections in original order
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
      isSoap: !!normalizeSectionKey(k)
    }))
    .filter((p) => p.text);
}

export function inferInterventionTypes(interventionsText) {
  const raw = String(interventionsText || '').toLowerCase();
  if (!raw) return [];
  return INTERVENTION_TYPE_OPTIONS.filter((opt) => {
    if (opt === 'Other') return false;
    const needle = opt.toLowerCase();
    if (needle === 'cbt') return /\bcbt\b|cognitive.?behavioral/i.test(raw);
    if (needle === 'dbt') return /\bdbt\b|dialectical/i.test(raw);
    if (needle === 'mindfulness-based') return /mindfulness/i.test(raw);
    if (needle === 'psychoeducation') return /psychoeducation|psycho.?ed/i.test(raw);
    if (needle === 'motivational interviewing') return /motivational interviewing|\bmi\b/i.test(raw);
    if (needle === 'supportive therapy') return /supportive/i.test(raw);
    if (needle === 'behavioral activation') return /behavioral activation/i.test(raw);
    if (needle === 'problem solving') return /problem.?solv/i.test(raw);
    if (needle === 'relapse prevention') return /relapse/i.test(raw);
    if (needle === 'family/caregiver involvement') return /family|caregiver|collateral/i.test(raw);
    if (needle === 'crisis intervention') return /crisis/i.test(raw);
    return raw.includes(needle);
  });
}

export function formatFullNoteCopy({
  sections = {},
  meta = {},
  initials = '',
  dateOfService = '',
  dateWritten = '',
  noteTypeLabel = 'Progress Note',
  includeInteractiveComplexity = false,
  interventionTypes = []
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
  if (interventionTypes.length) {
    lines.push(`Intervention Types: ${interventionTypes.join(', ')}`);
  }
  lines.push('');
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
