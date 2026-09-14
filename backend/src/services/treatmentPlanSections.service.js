export function splitTreatmentPlanSections(plan = {}) {
  const raw = String(plan.discharge_plan || plan.dischargePlan || '').trim();
  const result = { presentingProblem: plan.presenting_problem || plan.presentingProblem || '', prescribedFrequency: plan.prescribed_frequency || plan.prescribedFrequency || '', dischargePlan: '' };
  let key = 'dischargePlan';
  const parts = { presentingProblem: [], prescribedFrequency: [], dischargePlan: [] };
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.trim().replace(/\*\*/g, '');
    const match = clean.match(/^(Presenting Problem|Prescribed Frequency(?: of Treatment)?|Discharge Criteria\s*\/\s*Planning|Discharge Plan)\s*:?(.*)$/i);
    if (match) {
      key = /^Presenting/i.test(match[1]) ? 'presentingProblem' : /^Prescribed/i.test(match[1]) ? 'prescribedFrequency' : 'dischargePlan';
      if (match[2].trim()) parts[key].push(match[2].trim());
    } else parts[key].push(line);
  }
  for (const name of Object.keys(parts)) if (!result[name]) result[name] = parts[name].join('\n').trim();
  return result;
}
