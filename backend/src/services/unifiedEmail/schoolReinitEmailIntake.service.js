import { callGeminiText } from '../geminiText.service.js';
import {
  SECTION_KEYS,
  currentSchoolYear,
  getOrCreateCycle,
  getSectionProgress,
  upsertSectionProgress
} from '../schoolReinit.service.js';

const EXTRACTABLE_SECTIONS = new Set([
  'school_events',
  'materials',
  'needs_assessment',
  'growth_feedback',
  'assigned_providers'
]);

function parseJsonObject(text) {
  const raw = String(text || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeSectionData(existing, patch) {
  const base = isPlainObject(existing) ? { ...existing } : {};
  if (!isPlainObject(patch)) return base;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '') continue;
    if (isPlainObject(value) && isPlainObject(base[key])) {
      base[key] = mergeSectionData(base[key], value);
    } else {
      base[key] = value;
    }
  }
  return base;
}

function sanitizeReinitPatches(patches) {
  const out = {};
  if (!isPlainObject(patches)) return out;
  for (const [sectionKey, data] of Object.entries(patches)) {
    if (!EXTRACTABLE_SECTIONS.has(sectionKey)) continue;
    if (!isPlainObject(data) || !Object.keys(data).length) continue;
    // Never auto-book fall check-in from email.
    if (sectionKey === 'fall_check_in') continue;
    out[sectionKey] = data;
  }
  return out;
}

/**
 * Ask Gemini whether the email is providing collaborative year-update details.
 */
export async function classifyReinitIntent({ subject, bodyText }) {
  const text = `${String(subject || '')}\n${String(bodyText || '')}`.toLowerCase();
  const heuristic =
    /\bfirst day of school\b/.test(text) ||
    /\bback[- ]to[- ]school\b/.test(text) ||
    /\bmaterials?\b/.test(text) && /\b(packet|trifold|delivery)\b/.test(text) ||
    /\bdays per week\b/.test(text) ||
    /\bprovider (preference|days|schedule)\b/.test(text) ||
    /\byear update\b/.test(text) ||
    /\bcollaborative year\b/.test(text);

  try {
    const prompt = [
      'Classify if this school email is providing information for a collaborative school year update / reinitialization.',
      'Examples: first day of school date, back-to-school event details, materials needs, days/week onsite, provider preferences, satisfaction feedback.',
      'Return JSON only:',
      '{"isReinitIntent": boolean, "confidence": number, "summary": string|null}',
      '',
      `Subject: ${String(subject || '')}`,
      'Body:',
      String(bodyText || '').slice(0, 6000)
    ].join('\n');
    const { text: aiText } = await callGeminiText({ prompt, temperature: 0.1, maxOutputTokens: 220 });
    const parsed = parseJsonObject(aiText) || {};
    const aiIntent = parsed.isReinitIntent === true;
    const confidence = Number(parsed.confidence);
    return {
      isReinitIntent: aiIntent || heuristic,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : (heuristic ? 0.6 : 0),
      summary: parsed.summary ? String(parsed.summary).trim() : null
    };
  } catch {
    return {
      isReinitIntent: heuristic,
      confidence: heuristic ? 0.55 : 0,
      summary: null
    };
  }
}

/**
 * Extract section-shaped patches for school reinit from an inbound email.
 */
export async function extractReinitSectionPatches({ subject, bodyText, schoolName }) {
  const prompt = [
    'Extract collaborative school year-update fields from this email.',
    'Return JSON only with this shape:',
    '{',
    '  "school_events": {',
    '    "first_day_of_school": "YYYY-MM-DD"|null,',
    '    "bts_event_date": "YYYY-MM-DD"|null,',
    '    "bts_event_title": string|null,',
    '    "bts_note": string|null,',
    '    "bts_partner_invited": boolean|null,',
    '    "bts_marketing_table": boolean|null,',
    '    "bts_active_signups": boolean|null',
    '  },',
    '  "materials": {',
    '    "need_paper_packets": boolean|null,',
    '    "need_trifolds": boolean|null,',
    '    "materials_delivery_required": boolean|null,',
    '    "materials_notes": string|null',
    '  },',
    '  "needs_assessment": {',
    '    "days_per_week_onsite": number|null,',
    '    "provider_preferences": string|null',
    '  },',
    '  "assigned_providers": {',
    '    "preferred_service_days": string[]|null,',
    '    "capacity_outlook": "same"|"more"|"less"|null,',
    '    "notes": string|null',
    '  },',
    '  "growth_feedback": {',
    '    "looking_forward_to": string|null,',
    '    "marketing_quote": string|null,',
    '    "district_contacts": string|null,',
    '    "annual_feedback_more": string|null,',
    '    "annual_feedback_less": string|null',
    '  }',
    '}',
    'Omit keys that are not clearly stated. Do not invent dates or numbers.',
    `School: ${schoolName || 'Unknown'}`,
    `Subject: ${String(subject || '')}`,
    'Body:',
    String(bodyText || '').slice(0, 7000)
  ].join('\n');

  try {
    const { text } = await callGeminiText({ prompt, temperature: 0.1, maxOutputTokens: 900 });
    return sanitizeReinitPatches(parseJsonObject(text) || {});
  } catch {
    return {};
  }
}

/**
 * Apply extracted patches onto an incomplete school reinit cycle.
 * Does not finalize; marks sections reviewed by Email AI but not completed.
 */
export async function applyReinitPatchesFromEmail({
  agencyId,
  schoolOrganizationId,
  subject,
  bodyText,
  schoolName,
  actorUserId
}) {
  const year = currentSchoolYear();
  const cycle = await getOrCreateCycle({
    agencyId: Number(agencyId),
    schoolOrganizationId: Number(schoolOrganizationId),
    schoolYear: year
  });

  if (!cycle?.id) {
    return { applied: false, reason: 'no_cycle', cycle: null, patches: {}, updatedSections: [] };
  }
  if (String(cycle.status || '').toLowerCase() === 'finalized') {
    return {
      applied: false,
      reason: 'cycle_finalized',
      cycle: { id: Number(cycle.id), status: cycle.status, schoolYear: cycle.school_year || year },
      patches: {},
      updatedSections: []
    };
  }

  const patches = await extractReinitSectionPatches({ subject, bodyText, schoolName });
  const sectionKeys = Object.keys(patches);
  if (!sectionKeys.length) {
    return {
      applied: false,
      reason: 'no_extractable_fields',
      cycle: { id: Number(cycle.id), status: cycle.status, schoolYear: cycle.school_year || year },
      patches: {},
      updatedSections: []
    };
  }

  const existing = await getSectionProgress(cycle.id);
  const byKey = new Map((existing || []).map((s) => [s.sectionKey, s]));
  const updatedSections = [];
  const actor = {
    actorType: 'admin',
    userId: actorUserId || null,
    displayName: 'Email AI'
  };

  for (const sectionKey of sectionKeys) {
    if (!SECTION_KEYS.includes(sectionKey)) continue;
    const prev = byKey.get(sectionKey);
    const merged = mergeSectionData(prev?.data, patches[sectionKey]);
    await upsertSectionProgress({
      cycleId: Number(cycle.id),
      sectionKey,
      data: merged,
      reviewed: true,
      completed: false,
      actor
    });
    updatedSections.push(sectionKey);
  }

  return {
    applied: updatedSections.length > 0,
    reason: updatedSections.length ? 'applied' : 'nothing_written',
    cycle: { id: Number(cycle.id), status: cycle.status, schoolYear: cycle.school_year || year },
    patches,
    updatedSections
  };
}
