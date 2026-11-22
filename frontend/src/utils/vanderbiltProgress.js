import { outcomeReporter } from './outcomeTrends.js';
// Never compare different reporters or incompatible core scoring versions.
export function vanderbiltProgress(responses) {
  const groups = new Map();
  for (const response of responses) {
    const measure = response.questionnaire;
    if (measure?.comparisonFamily !== 'vanderbilt-parent' || !measure.comparisonVersion || !response.result?.complete || response.result.total == null || response.result.average == null) continue;
    const informant = String(response.answers?.informant || '').trim();
    const portalId = response.source === 'family_portal' && response.respondentUserId;
    if (!portalId && !informant && !response.respondent) continue;
    const reporter = outcomeReporter(response)?.key;
    if (!reporter) continue;
    const groupKey = `${measure.comparisonVersion}:${reporter}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, reporter: outcomeReporter(response)?.label || informant || 'Reporting caregiver', channel: response.source === 'live_session' ? 'Live session' : portalId ? 'Family portal' : 'Recorded with staff', rows: [] });
    groups.get(groupKey).rows.push(response);
  }
  return [...groups.values()].map(group => {
    group.rows.sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt) || Number(a.id) - Number(b.id));
    let baseline = null;
    group.rows = group.rows.map((response, index, rows) => {
      if (!baseline && response.questionnaire.phase === 'initial') baseline = response;
      const previous = rows[index - 1];
      return { ...response, baselineChange: baseline && baseline !== response ? response.result.total - baseline.result.total : null,
        priorChange: previous ? response.result.total - previous.result.total : null,
        performanceChange: baseline && baseline !== response ? response.result.average - baseline.result.average : null };
    });
    return group;
  });
}
