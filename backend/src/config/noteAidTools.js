import { CLINICAL_NOTE_AGENT_TOOLS } from './clinicalNoteAgentTools.js';

// Global (platform-wide) Note Aid tools.
// These are “Gem-like” prompt templates, defined in code for predictability.
//
// IMPORTANT:
// - Do not include PHI/PII in these definitions.
// - The user-provided input may include PHI/PII; we intentionally do NOT persist it.
//
// Tool schema:
// {
//   id: string,
//   name: string,
//   description: string,
//   category: string,
//   systemPrompt: string,
//   outputInstructions: string,
//   temperature?: number,
//   maxOutputTokens?: number
// }

export const NOTE_AID_TOOLS = [
  {
    id: 'clean_and_bullet',
    name: 'Clean + Bulletize',
    description: 'Turns pasted text into clear, structured bullets without changing meaning.',
    category: 'Formatting',
    systemPrompt: [
      'You help a clinician or staff member clean up rough notes.',
      'Be concise. Preserve meaning. Do not invent facts.',
      'Keep names, dates, and numbers exactly as provided.',
      'If content is unclear, keep it as-is and mark as [unclear].'
    ].join('\n'),
    outputInstructions: [
      'Return plain text.',
      'Format as short sections with bullet points.',
      'Do not use markdown code fences.'
    ].join('\n'),
    temperature: 0.2,
    maxOutputTokens: 900
  },
  {
    id: 'soap_note',
    name: 'SOAP Note Draft',
    description: 'Drafts a SOAP-style note from pasted text (S/O/A/P headings).',
    category: 'Clinical',
    systemPrompt: [
      'You draft a SOAP-style note based strictly on user-provided text.',
      'Do not add diagnosis, treatment, or medical advice not present in the input.',
      'Keep it professional and concise.',
      'If a section has no info, write "None provided."'
    ].join('\n'),
    outputInstructions: [
      'Return plain text with headings:',
      'Subjective:',
      'Objective:',
      'Assessment:',
      'Plan:',
      'Do not include any extra commentary.'
    ].join('\n'),
    temperature: 0.2,
    maxOutputTokens: 1200
  },
  {
    id: 'family_friendly_summary',
    name: 'Family-Friendly Summary',
    description: 'Rewrites a note into a clear, non-technical summary appropriate for families.',
    category: 'Communication',
    systemPrompt: [
      'You rewrite clinical/staff notes for a non-technical audience.',
      'Use simple language and short sentences.',
      'Do not change facts or add new information.',
      'Avoid jargon; if necessary, explain it briefly.'
    ].join('\n'),
    outputInstructions: [
      'Return plain text as 1–3 short paragraphs, then 3–7 bullet points of key takeaways.',
      'No markdown code fences.'
    ].join('\n'),
    temperature: 0.3,
    maxOutputTokens: 900
  },
  {
    id: 'action_items',
    name: 'Action Items + Next Steps',
    description: 'Extracts a checklist of action items and assigns owners if mentioned.',
    category: 'Productivity',
    systemPrompt: [
      'You extract action items from the input.',
      'Do not invent tasks or owners; only use what is present.',
      'If an owner is unclear, mark owner as "Unassigned".'
    ].join('\n'),
    outputInstructions: [
      'Return plain text as a checklist:',
      '- [ ] Task (Owner: X) (Due: Y)',
      'If due date is not present, omit it.'
    ].join('\n'),
    temperature: 0.2,
    maxOutputTokens: 700
  },
  ...CLINICAL_NOTE_AGENT_TOOLS
];

export function getPublicNoteAidTools() {
  return NOTE_AID_TOOLS.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category
  }));
}

export function getNoteAidToolById(toolId) {
  const id = String(toolId || '').trim();
  if (!id) return null;
  return NOTE_AID_TOOLS.find((t) => t && String(t.id) === id) || null;
}

