const allowed = new Set(['TUTORING', 'HOMEWORK HELP']);

export function selectedLearningServiceCode(value, fallback = 'TUTORING') {
  let code = String(value || fallback).trim().toUpperCase().replace(/\s+15\s+MIN$/, '');
  if (['TUTORING VIRTUAL', 'TUTORING IN PERSON'].includes(code)) code = 'TUTORING';
  if (!allowed.has(code)) throw Object.assign(new Error('Choose Tutoring or Homework Help as the learning service. Clinical skills services require their clinical encounter workflow.'), { status: 409 });
  return code;
}

export function learningServiceMetadata(session) {
  const raw = session?.metadata_json;
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}

export function learningSessionServiceCode(session) {
  return selectedLearningServiceCode(learningServiceMetadata(session).learningServiceCode);
}

export function canOpenLearningWorkspace(appointment, actorUserId) {
  return Number(appointment?.providerUserId || appointment?.provider_user_id) === Number(actorUserId)
    && ['learning','tutoring'].includes(String(appointment?.businessType || appointment?.business_type).toLowerCase())
    && ['IN_PERSON','VIRTUAL','TELEHEALTH'].includes(String(appointment?.modality).toUpperCase())
    && ['scheduled','confirmed','client_confirmed','in_progress','completed'].includes(String(appointment?.status).toLowerCase());
}

export function canOpenInPersonLearning(appointment, actorUserId) {
  return canOpenLearningWorkspace(appointment, actorUserId)
    && String(appointment?.modality).toUpperCase() === 'IN_PERSON';
}
