import { createHash } from 'node:crypto';

export const PAYROLL_RANKING_SOURCE = 'payroll-last-three-v1';
const amount = value => Math.max(0, Number(value) || 0);
const rounded = value => Number(value.toFixed(2));

export function rankPayrollProviders(providers, summaries, entries) {
  return providers.map(provider => {
    const rows = summaries.filter(row => Number(row.user_id) === provider.id);
    const sum = field => rounded(rows.reduce((total, row) => total + amount(row[field]), 0));
    return { ...provider, providerId: provider.id, directCreditHours: sum('direct_hours'), totalCreditHours: sum('total_hours'),
      currentTierCredits: sum('tier_credits_current'), payrollUnits: sum('total_units'),
      serviceEntries: entries.filter(row => Number(row.user_id) === provider.id).reduce((total, row) => total + amount(row.service_entries), 0),
      periodsWithActivity: rows.filter(row => ['direct_hours','total_hours','tier_credits_current','total_units'].some(key => amount(row[key]) > 0)).length };
  }).filter(row => [row.directCreditHours,row.totalCreditHours,row.currentTierCredits,row.payrollUnits,row.serviceEntries].some(value => value > 0))
    .sort((a,b) => a.directCreditHours-b.directCreditHours || a.totalCreditHours-b.totalCreditHours || a.serviceEntries-b.serviceEntries || a.payrollUnits-b.payrollUnits || a.providerId-b.providerId)
    .map((row,index) => ({ ...row, rank:index+1, cohort:Math.floor(index/5)+1 }));
}

// Replacing the old staff/app-appointment ranking must never apply a completed
// group checklist to different people. Individual/client work stays intact;
// old group evidence is retained here and in the original append-only events.
export function applyPayrollTransitionRanking(state, data, now = new Date()) {
  const rows = data.people;
  const key = createHash('sha256').update(JSON.stringify({ source:PAYROLL_RANKING_SOURCE,
    periods:data.payroll.periods.map(p=>p.id), providers:rows.map(p=>p.providerId) })).digest('hex');
  const previous = state.ranking;
  const changed = previous?.key !== key;
  const groupsChanged = previous?.sourceType !== PAYROLL_RANKING_SOURCE ||
    JSON.stringify(previous.rows.map(p=>[p.providerId,p.cohort])) !== JSON.stringify(rows.map(p=>[p.providerId,p.cohort]));
  const archived = groupsChanged && (previous || Object.keys(state.workspace.groups || {}).length || Object.keys(state.cohorts || {}).length);
  const rankingHistory = [...(state.rankingHistory || [])];
  if (archived) rankingHistory.push({ ranking:previous, groups:state.workspace.groups, cohorts:state.cohorts,
    archivedAt:now.toISOString(), reason:'Replaced by provider-only payroll workload order; individual and client checklists retained.' });
  const tasks = { ...state.tasks };
  if (groupsChanged) for (const id of ['cohort_ranking','cohort_google','cohort_ehr','cohort_observation']) {
    if (tasks[id]?.status === 'passed') tasks[id] = { ...tasks[id], status:'in_progress', nextAction:'Review the payroll-based provider groups before recording this group’s acceptance.' };
  }
  return { ...state, tasks, rankingHistory, cohorts:groupsChanged?{}:state.cohorts,
    workspace:{ ...state.workspace, groups:groupsChanged?{}:state.workspace.groups, rankingDraft:null },
    ranking:{ sourceType:PAYROLL_RANKING_SOURCE, key, sourceReference:data.payroll.description,
      frozenAt:changed?now.toISOString():previous.frozenAt, periods:data.payroll.periods, rows } };
}
