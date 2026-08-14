import { buildPsc17Fields, buildStandardQuestionnaireFields } from '../data/validatedClinicalScreens.en.js';

const ADULT_INSTRUMENTS = new Set(['phq9', 'gad7', 'auditc', 'dast10', 'pcptsd5', 'asrs', 'mdq']);

export function looksLikeQuestionnaireStep(step) {
  const type = String(step?.type || '').toLowerCase();
  const id = String(step?.id || '').toLowerCase();
  const label = String(step?.label || '').toLowerCase();
  if (type === 'clinical_questions') return true;
  if (type !== 'questions') return false;
  return id.includes('questionnaire') || label.includes('questionnaire');
}

export function fieldLooksLikePsc17(field) {
  const key = String(field?.key || '');
  if (/^psc[_-]?0*\d{1,2}$/i.test(key)) return true;
  return String(field?.instrument || '').toLowerCase() === 'psc17';
}

export function fieldLooksLikeAdultScreen(field) {
  const instrument = String(field?.instrument || '').toLowerCase();
  if (ADULT_INSTRUMENTS.has(instrument)) return true;
  const key = String(field?.key || '').toLowerCase();
  return /^(phq|gad|audit|dast|pc_?ptsd|asrs|mdq)_/.test(key);
}

function stepHasPsc17(step) {
  return (Array.isArray(step?.fields) ? step.fields : []).some(fieldLooksLikePsc17);
}

function stepHasInstrumentFields(step) {
  return (Array.isArray(step?.fields) ? step.fields : []).some(
    (field) => fieldLooksLikePsc17(field) || fieldLooksLikeAdultScreen(field)
  );
}

function stepHasAdultScreen(step) {
  return (Array.isArray(step?.fields) ? step.fields : []).some(fieldLooksLikeAdultScreen);
}

function stepsHavePsc17(steps) {
  return (Array.isArray(steps) ? steps : []).some(stepHasPsc17);
}

function buildChildPsc17Step() {
  return {
    id: 'questionnaires_psc17',
    type: 'questions',
    label: 'Questionnaires',
    helperText:
      'These give the provider another view of how your child is doing and provide a baseline we can compare with later.',
    audience: 'dependent',
    scope: 'client',
    repeatPerClient: true,
    visibility: 'always',
    fields: buildPsc17Fields({ scope: 'client' })
  };
}

function hydrateEmptyStep(step, { isOffice = false } = {}) {
  const type = String(step?.type || '').toLowerCase();
  if (!looksLikeQuestionnaireStep(step) || stepHasInstrumentFields(step)) return step;
  const audience = String(step?.audience || '').toLowerCase();
  if (audience === 'dependent' || audience === 'client') {
    return { ...step, fields: buildPsc17Fields({ scope: 'client' }) };
  }
  if (type === 'clinical_questions' || type === 'questions') {
    return {
      ...step,
      ...(isOffice ? { audience: step.audience || 'self' } : {}),
      fields: buildStandardQuestionnaireFields()
    };
  }
  return step;
}

function tagAdultQuestionnaireAudience(step) {
  if (!looksLikeQuestionnaireStep(step)) return step;
  if (step?.audience) return step;
  if (stepHasAdultScreen(step) && !stepHasPsc17(step)) {
    return { ...step, audience: 'self' };
  }
  return step;
}

function insertChildPsc17Step(steps) {
  const list = [...steps];
  const childStep = buildChildPsc17Step();
  let insertAt = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (looksLikeQuestionnaireStep(list[i])) {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt < 0) {
    insertAt = list.findIndex((step) => {
      const type = String(step?.type || '').toLowerCase();
      return type === 'document'
        || type.startsWith('packet_')
        || type === 'smart_disclosure'
        || type === 'disclosure';
    });
  }
  if (insertAt < 0) list.push(childStep);
  else list.splice(insertAt, 0, childStep);
  return list;
}

/**
 * Fill empty Standard Questionnaires pages, and for office parent-for-kid
 * flows ensure the school PSC-17 items are present so they score in Clinical.
 * School packets are left alone except for empty-page hydration.
 */
export function hydrateOfficeQuestionnaireSteps(steps, { isOffice = false } = {}) {
  const hydrated = (Array.isArray(steps) ? steps : []).map((step) => {
    const filled = hydrateEmptyStep(step, { isOffice });
    return isOffice ? tagAdultQuestionnaireAudience(filled) : filled;
  });
  if (!isOffice || stepsHavePsc17(hydrated)) return hydrated;
  return insertChildPsc17Step(hydrated);
}
