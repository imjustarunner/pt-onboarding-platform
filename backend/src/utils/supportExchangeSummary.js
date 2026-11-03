import { exchangeExclusionConcerns } from './clientExchangeMatching.js';
// Exchange operational staff need matching inputs, not excerpts automatically
// extracted from screening, intake notes or treatment plans.
export function supportExchangeSummary(summary = {}) {
  const preferences = summary.preferences || {};
  const schedule = preferences.schedule;
  const sharedConcern = String(preferences.sharedMatchingConcern || '').trim();
  const sharedNotes = preferences.sharedSchedulingNotes;
  const scheduleNotesRestricted = Boolean(schedule?.notes && sharedNotes == null);
  const matchingTopics = exchangeExclusionConcerns(summary);
  return {
    demographics: summary.demographics || {}, diagnoses: [], presentingProblems: sharedConcern ? [sharedConcern] : [],
    matchingTopics,
    hasClinicalConcerns: Boolean(summary.presentingProblems?.length || summary.hasClinicalConcerns),
    presentingProblemSource: sharedConcern ? 'Matching concern' : null, presentingProblemUpdatedAt: sharedConcern ? summary.presentingProblemUpdatedAt : null,
    preferences: {
      sharedMatchingConcern: sharedConcern || null,
      sharedSchedulingNotes: sharedNotes ?? null,
      scheduleNotesRestricted,
      serviceLocationSource: preferences.serviceLocationSource || null,
      serviceLocation: preferences.serviceLocation || null, insurance: preferences.insurance || null, modality: preferences.modality || null,
      providerGender: preferences.providerGender || null,
      matchingPreferences: preferences.matchingPreferences || null,
      schedule: schedule ? { days: schedule.days, periods: schedule.periods, windows: schedule.windows, timezone: schedule.timezone, ...(sharedNotes != null ? { notes: sharedNotes } : {}) } : null
    }
  };
}
