import { INTAKE_SECTION_TITLES } from '../config/clinicalNotePlanOutput.js';
import { CANONICAL_INTAKE_SECTIONS } from './intakeImport.service.js';

const aliases = new Map(Object.entries({
  'symptom description and subjective report': 'Subjective', 's - subjective': 'Subjective',
  's subjective': 'Subjective', 'objective content': 'Objective Content', 'o - objective': 'Objective',
  'o objective': 'Objective', 'interventions used': 'Interventions', 'i - interventions': 'Interventions',
  'i interventions': 'Interventions', 'p - plan': 'Plan', 'p plan': 'Plan',
  'diagnoses': 'Diagnosis', 'history of present problems': 'History of Present Illness',
  'history of present problem': 'History of Present Illness', 'medical conditions and history': 'Medical History',
  'medical conditions & history': 'Medical History', 'substance use': 'Substance Use History',
  'educational/vocational history': 'Educational / Occupational History',
  'educational and vocational history': 'Educational / Occupational History',
  'spiritual and cultural factors': 'Spiritual/Cultural Factors',
  'current mental status': 'Mental Status Examination', 'mental status exam': 'Mental Status Examination'
}));
const titles = [...CANONICAL_INTAKE_SECTIONS, 'Subjective', 'Objective', 'Interventions', 'Plan',
  'Objective Content', 'Educational / Occupational History', 'Additional Notes / Assessment',
  'Code', 'Rationale', 'Progress Note', 'Consultation Note', 'Reason for Termination',
  'Treatment Modality and Interventions', 'Treatment Goals and Outcome', 'Recommendations'];

function sectionKey(title, { intake = false } = {}) {
  const interventions = title.match(/^Interventions?\s+(\d+\.\d+)$/i);
  if (interventions) return `Interventions ${interventions[1]}`;
  const goal = title.match(/^(Goal|Objective)\s*(\d+(?:\.\d+)?)$/i);
  if (goal) return `${goal[1].toLowerCase() === 'goal' ? 'Goal' : 'Objective'} ${goal[2]}`;
  const projected = title.match(/^Projected\s*Time(?:\s*to\s*Completion)?(?:\s*(\d+))?$/i);
  if (projected) return `Projected Time${projected[1] ? ` ${projected[1]}` : ''}`;
  if (/^discharge(?:\s*plan)?$/i.test(title)) return 'Discharge Plan';
  const key = aliases.get(title.toLowerCase()) || titles.find((name) => name.toLowerCase() === title.toLowerCase());
  return !intake && key === 'Objective Content' ? 'Objective' : key;
}

/** Exact headings or heading-colon-body, never a prefix such as "Objective" in "Objective 3.1". */
export function parseNoteSections(text, options = {}) {
  const sections = {};
  let key = null;
  let buffer = [];
  let lastGoal = null;
  const flush = () => {
    const body = buffer.join('\n').trim();
    if (key && body) sections[key] = [sections[key], body].filter(Boolean).join('\n\n');
    buffer = [];
  };
  for (const line of String(text || '').split(/\r?\n/)) {
    const cleaned = line.trim().replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').replace(/^\d+[.)]\s*/, '').trim();
    const colon = cleaned.indexOf(':');
    const title = (colon < 0 ? cleaned : cleaned.slice(0, colon)).trim();
    const nextKey = sectionKey(title, options);
    if (nextKey) {
      flush();
      key = nextKey;
      if (/^Goal \d+$/.test(key)) lastGoal = key.slice(5);
      if (key === 'Projected Time' && lastGoal) key = `Projected Time ${lastGoal}`;
      if (colon >= 0 && cleaned.slice(colon + 1).trim()) buffer.push(cleaned.slice(colon + 1).trim());
    } else {
      // Keep substantive text before the first recognized heading as well.
      if (!key && line.trim()) key = 'Introduction';
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/** A partial intake must never be presented as a complete note ready for review. */
export function intakeOutputError(toolId, sections, finishReason) {
  if (!['clinical_90791_intake_plan', 'clinical_90791_note_aid', 'clinical_h0031_intake'].includes(toolId)) return null;
  if (finishReason && finishReason !== 'STOP') return 'The intake response was interrupted. Please regenerate or complete the intake manually.';
  const missing = INTAKE_SECTION_TITLES.filter((title) => !String(sections[title] || '').trim());
  return missing.length ? `The intake response is missing required sections: ${missing.join(', ')}. Please regenerate or complete the intake manually.` : null;
}
