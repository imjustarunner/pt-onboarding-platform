export function documentAnalyticsIntent(prompt, now = new Date()) {
  const s = String(prompt || '').toLowerCase();
  if (!/handbook|guide|manual|document|library|sop|group psychotherapy/.test(s) || !/statistic|analytic|report|who.*(?:open|read|view)|how (?:many|long)|click|helpful|questions.*ask|most.*(?:read|view)|usage/.test(s)) return null;
  const args = {};
  const key = s.match(/\b(?:nlu-learning-pilot-guide|clinical-note-aid-guide|workplace-handbook|provider-guide|school-practice-guide|counseling-guide|skill-development-guide|facilities-guide|crisis-response-guide|facilitator-coding-protocol|service-documentation-standards|group-psychotherapy-sop|caseload-management-sop|mandated-reporting-sop|resource:\d+)\b/);
  if (key) args.documentKey = key[0];
  else {
    const aliases = [['nlu learning pilot', 'nlu-learning-pilot-guide'], ['clinical note aid', 'clinical-note-aid-guide'], ['care continuity guide', 'clinical-note-aid-guide'], ['caseload', 'caseload-management-sop'], ['mandated reporting', 'mandated-reporting-sop'], ['mandated reporter', 'mandated-reporting-sop'], ['group psychotherapy', 'group-psychotherapy-sop'], ['group therapy sop', 'group-psychotherapy-sop'], ['group sop', 'group-psychotherapy-sop'], ['documentation standards', 'service-documentation-standards'], ['provider', 'provider-guide'], ['school practice', 'school-practice-guide'], ['facilitator', 'facilitator-coding-protocol'], ['facilities', 'facilities-guide'], ['crisis', 'crisis-response-guide'], ['skill development', 'skill-development-guide'], ['care approaches', 'counseling-guide'], ['handbook', 'workplace-handbook']];
    const hit = aliases.find(([label]) => s.includes(label));
    if (hit) args.documentKey = hit[1];
    else { const quoted = String(prompt).match(/[“"]([^”"]{2,180})[”"]/); if (quoted) args.documentQuery = quoted[1]; }
  }
  args.detail = /what questions|which questions|questions.*ask|asked.*questions/.test(s) ? 'questions' : /who|readers|people/.test(s) ? 'people' : /links|click/.test(s) ? 'links' : /sections|helpful/.test(s) ? 'sections' : /where/.test(s) ? 'surfaces' : 'documents';
  const dates = s.match(/\b\d{4}-\d{2}-\d{2}\b/g);
  if (dates?.length >= 2) [args.startDate, args.endDate] = dates;
  else if (dates?.length === 1) { args.startDate = dates[0]; args.endDate = dates[0]; }
  else {
    const days = s.match(/(?:last|past) (\d{1,3}) days/);
    if (days && +days[1] > 0 && +days[1] <= 366) { args.endDate = now.toISOString().slice(0, 10); args.startDate = new Date(now.getTime() - (+days[1] - 1) * 86400000).toISOString().slice(0, 10); }
    else if (/last week|last month|this month|this year|yesterday|today|since|before|after|january|february|march|april|june|july|august|september|october|november|december/.test(s)) return null; // Let the existing semantic/LLM router resolve explicit dates.
  }
  const company = s.match(/company\s+(\d+)/); if (company) args.requestedAgencyId = +company[1];
  return { intent: 'document_analytics', capabilityId: 'document_analytics', toolCalls: [{ name: 'queryDocumentAnalytics', args }] };
}
