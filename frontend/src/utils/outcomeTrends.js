const normalized = value => String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function outcomeReporter(response) {
  const respondent = response.respondent;
  if (respondent?.type === 'guardian' && respondent.userId) return { key:`guardian:${respondent.userId}`, label:respondent.label || 'Parent / guardian' };
  if (respondent?.type === 'other') return { key:`other:${normalized(respondent.label)}:${normalized(respondent.relationship)}`, label:`${respondent.label} (${respondent.relationship})` };
  if (respondent?.type === 'client') return { key:`client:${respondent.clientId || response.clientId || ''}`, label:'Client' };
  if (response.questionnaire?.respondent === 'caregiver') {
    const userId = response.source === 'family_portal' && (response.respondentUserId || response.recordedBy);
    if (userId) return { key:`guardian:${userId}`, label:response.answers?.informant || 'Parent / guardian' };
    const informant = normalized(response.answers?.informant);
    return informant ? { key:`manual:${informant}`, label:response.answers.informant } : null;
  }
  if (response.questionnaire?.respondent === 'observer') return response.recordedBy ? { key:`observer:${response.recordedBy}`, label:'Staff observer' } : null;
  return { key:`client:${response.clientId || ''}`, label:'Client' };
}
export function outcomeTrendSeries(responses) {
  const groups = new Map();
  for (const response of responses) {
    const q = response.questionnaire, reporter = outcomeReporter(response);
    if (!q || !reporter || !response.result?.complete || !Number.isFinite(new Date(response.recordedAt).getTime())) continue;
    const baseKey = `${q.comparisonFamily || response.measureId || q.id}:${q.comparisonVersion || response.version}:${reporter.key}`;
    const values = response.result.total != null ? [['',response.result.total]] : Object.entries(response.result.domains || {}).filter(([,value])=>typeof value==='number' && Number.isFinite(value));
    for (const [domain,value] of values) {
      const key = `${baseKey}:${domain}`;
      if (!groups.has(key)) groups.set(key, { key, domain, title:(q.comparisonFamily === 'vanderbilt-parent' ? 'Vanderbilt · Parent initial & follow-up' : q.title)+(domain?` · ${domain}`:''), reporter:reporter.label, questionnaire:q, rows:[] });
      groups.get(key).rows.push({...response,trendValue:value});
    }
  }
  return [...groups.values()].map(group => ({ ...group, rows:group.rows.sort((a,b) => new Date(a.recordedAt) - new Date(b.recordedAt) || Number(a.id) - Number(b.id)) }));
}
