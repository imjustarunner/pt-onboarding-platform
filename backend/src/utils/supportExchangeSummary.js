// Exchange operational staff need matching inputs, not excerpts automatically
// extracted from screening, intake notes or treatment plans.
export function supportExchangeSummary(summary = {}) {
  const preferences = summary.preferences || {};
  const schedule = preferences.schedule;
  return {
    demographics: summary.demographics || {}, diagnoses: [], presentingProblems: [],
    hasClinicalConcerns: Boolean(summary.presentingProblems?.length || summary.hasClinicalConcerns),
    presentingProblemSource: null, presentingProblemUpdatedAt: null,
    preferences: {
      serviceLocationSource: preferences.serviceLocationSource || null,
      serviceLocation: preferences.serviceLocation || null, insurance: preferences.insurance || null, modality: preferences.modality || null,
      providerGender: preferences.providerGender || null,
      matchingPreferences: preferences.matchingPreferences || null,
      schedule: schedule ? { days: schedule.days, periods: schedule.periods, windows: schedule.windows, timezone: schedule.timezone } : null
    }
  };
}
