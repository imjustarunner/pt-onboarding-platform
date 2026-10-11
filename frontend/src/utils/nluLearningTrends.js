// Only compare a fixed version, domain, respondent identity and administration.
export function nluLearningTrends(responses) {
  const groups = new Map();
  for (const response of responses) {
    if (response.questionnaire?.kind !== 'original_pilot' || !response.questionnaire.domains || !response.pilotContext) continue;
    const context = response.pilotContext;
    const groupKey = [response.measureId, response.version, response.administration, context.respondentSeries].join(':');
    if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, title: response.questionnaire.title, instrumentVersion: response.questionnaire.instrumentVersion, respondent: context.respondentSeries, administration: response.administration, domains: response.questionnaire.domains, records: [] });
    groups.get(groupKey).records.push(response);
  }
  return [...groups.values()].map(group => {
    const records = [...group.records].sort((a,b) => a.pilotContext.observedOn.localeCompare(b.pilotContext.observedOn) || new Date(a.recordedAt) - new Date(b.recordedAt) || a.id - b.id);
    return { ...group, records: undefined, metrics: group.domains.map(domain => {
      const observations = records.filter(r => Number.isFinite(r.result.domains[domain.label]));
      const first = observations[0], last = observations.at(-1);
      return { label: domain.label, direction: domain.direction, count: observations.length, firstDate: first?.pilotContext.observedOn, lastDate: last?.pilotContext.observedOn, value: last?.result.domains[domain.label] ?? null,
        change: first && last && first.pilotContext.observedOn < last.pilotContext.observedOn ? Math.round((last.result.domains[domain.label] - first.result.domains[domain.label]) * 100) / 100 : null };
    }) };
  });
}
