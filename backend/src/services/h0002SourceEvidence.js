import { hydrateOfficeQuestionnaireSteps } from '../utils/officeQuestionnaireSteps.js';
import { linkLooksLikeOfficeIntake } from '../utils/officeIntakeLink.js';
import { extractSmartSchoolRoi } from './schoolRoiChartText.service.js';

const parse = value => typeof value === 'string' ? JSON.parse(value || '[]') : value;
export function screeningResponseBags(data = {}, clientIndex = 0) {
  const responses = data.responses || {};
  const submission = { ...data.submission, ...responses.submission };
  const client = responses.clients?.[clientIndex] || data.clients?.[clientIndex] || {};
  return [client, submission, { ...data.guardianResponses, ...responses.guardian }, submission.clinicalResponses || {}, client.clinicalResponses || {}];
}

// Use the same definitions added to the public office questionnaire. Never
// guess whether an unrecognized numeric response means 0/1/2 or 1/2/3.
export function screeningSourceFields(link = {}) {
  const raw = parse(link.intake_steps) || [];
  const originalSteps = Array.isArray(raw) ? raw : raw.steps || [];
  const steps = hydrateOfficeQuestionnaireSteps(originalSteps, { isOffice: linkLooksLikeOfficeIntake(link) });
  const explicit = [...(parse(link.intake_fields) || []), ...originalSteps.flatMap(step => step.fields || [])];
  const byKey = new Map(explicit.filter(f => f?.key).map(f => [f.key, f]));
  for (const field of steps.flatMap(step => step.fields || [])) {
    if (field?.key && !byKey.has(field.key)) byKey.set(field.key, field);
  }
  return [...byKey.values()];
}

export function screeningSourceKind(link, data, clientIndex = 0) {
  const bags = screeningResponseBags(data, clientIndex);
  const clinicalKey = /^(?:psc_\d+|phq\w*_\d+|gad\w*_\d+|(?:p[12]_)?(?:reason|concern|goal|gain|helpful|self_harm|trauma|medical|mental_health|counsel|therapy|medication|allerg|presenting|treatment|safety_immediate|talked_wanting))/i;
  const hasClinicalResponses = bags.some(bag => Object.entries(bag).some(([key, value]) => clinicalKey.test(key) && value != null && String(value).trim() !== ''));
  const roi = extractSmartSchoolRoi(data);
  const roiOnly = ['smart_school_roi', 'school_roi'].includes(String(link?.form_type || '').toLowerCase())
    || (!!roi && Object.keys(roi).length > 0 && !hasClinicalResponses);
  return { roiOnly, hasClinicalResponses };
}
