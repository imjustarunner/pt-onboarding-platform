import { buildDisplaySections, extractSections } from './noteAidUiHelpers.js';

const text = value => value == null ? '' : String(value).trim();

export function parseReviewContent(content) {
  if (content && typeof content === 'object') return content;
  try { return JSON.parse(content); } catch { return { note: text(content), addenda: [] }; }
}

export function supervisorNoteSections(payload) {
  if (typeof payload === 'string') {
    try { return supervisorNoteSections(JSON.parse(payload)); }
    catch { return text(payload) ? [{ id: 'narrative', title: 'Note content', text: text(payload) }] : []; }
  }
  return buildDisplaySections(extractSections(payload || {})).filter(section => text(section.text));
}

// Only explicit normal findings are collapsed. Never infer normality from an unanswered field.
export function supervisorMentalStatus(mse) {
  if (!mse || typeof mse !== 'object') return { notable: [], normal: [] };
  const rows = Object.entries(mse.domains || {}).flatMap(([domain, value]) => {
    const status = text(value?.status).toLowerCase();
    const option = text(value?.option);
    const detail = text(value?.detail);
    if (!status && !option && !detail) return [];
    if (status === 'selected' && !option && !detail) return [];
    return [{ domain, status: option || status.replace(/_/g, ' '), detail, normal: status === 'normal' && !detail }];
  });
  const notable = rows.filter(row => !row.normal);
  const normal = rows.filter(row => row.normal);
  if (mse.allNormal && !notable.length) return { notable: [], normal: [{ domain: 'All domains', status: 'Within normal limits', detail: '' }] };
  if (mse.allNotAssessed && !rows.length) notable.push({ domain: 'All domains', status: 'Not assessed', detail: '' });
  return { notable, normal };
}

export function supervisorObjectiveRatings(ratings) {
  return (Array.isArray(ratings) ? ratings : []).map((row, index) => ({
    ...row,
    key: row.id || `${row.objectiveId || index}-${row.raterKind || 'clinician'}`,
    label: [row.goalIndex != null ? `Goal ${row.goalIndex}` : 'Goal', row.objectiveIndex != null ? `objective ${row.objectiveIndex}` : 'objective'].join(' · '),
    start: row.scaleStart ?? row.scale_start ?? row.startValue ?? null,
    recent: row.scalePrevious ?? row.scale_previous ?? row.previousValue ?? null,
    current: row.disposition && row.disposition !== 'rated' ? row.disposition.replace(/_/g, ' ') : row.scaleValue ?? null,
    target: row.scaleTarget ?? null,
    detail: [row.goalText, row.objectiveText, row.raterLabel || row.raterKind, row.progressLabel?.replace(/_/g, ' '), row.dateOfService ? `Date of service: ${String(row.dateOfService).slice(0, 10)}` : ''].filter(Boolean).join('\n')
  }));
}

export function supervisorServiceDetails(note) {
  const chart = note?.structuredChart || note?.metadata?.structuredChart || {};
  const base = {
    durationMinutes: note?.durationMinutes ?? chart.durationMinutes ?? note?.sessionTiming?.durationMinutes ?? null,
    locationLabel: note?.locationLabel || chart.locationLabel || note?.sessionTiming?.locationLabel || '',
    startTime: note?.startTime || chart.startTime || '',
    endTime: note?.endTime || chart.endTime || '',
    placeOfService: note?.placeOfService || chart.placeOfService || note?.metadata?.placeOfService || '',
    participants: chart.participants || '', patientPresent: typeof chart.patientPresent === 'boolean' ? chart.patientPresent : null,
    serviceLocationId: note?.serviceLocationId || chart.serviceLocationId || note?.sessionTiming?.serviceLocationId || null
  };
  return { ...base, ...(note?.effectiveServiceDetails || {}), ...(note?.pendingServiceDetails || {}) };
}

export function missingSupervisorServiceDetails(details, { requirePlaceOfService = false, requireParticipants = false } = {}) {
  return [
    ['durationMinutes', 'duration'], ['locationLabel', 'location'], ['startTime', 'start time'], ['endTime', 'end time'], ...(requirePlaceOfService ? [['placeOfService', 'place of service']] : []), ...(requireParticipants ? [['participants','participants']] : [])
  ].filter(([key]) => !text(details?.[key]) || (key === 'durationMinutes' && Number(details[key]) <= 0)).map(([, label]) => label).concat(requireParticipants && typeof details?.patientPresent !== 'boolean' ? ['patient presence'] : []);
}
