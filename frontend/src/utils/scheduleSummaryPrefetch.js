import { getScheduleSummaryResponse } from './scheduleSummaryRequests.js';
import { getScheduleSummary, setScheduleSummary, scheduleSummaryRevision } from './scheduleSummaryCache.js';

export async function prefetchNextScheduleWeek(url, config, cacheKey, isCurrent = () => true) {
  return prefetchScheduleWeek(url, config, cacheKey, isCurrent, 7);
}

// Sequential speculation leaves capacity for the visible week and dashboard.
export async function prefetchAdjacentScheduleWeeks(url, config, cacheKey, isCurrent = () => true) {
  await prefetchScheduleWeek(url, config, cacheKey, isCurrent, 7);
  await prefetchScheduleWeek(url, config, cacheKey, isCurrent, -7);
}

async function prefetchScheduleWeek(url, config, cacheKey, isCurrent, days) {
  if (!isCurrent()) return;
  const date = new Date(`${config.params.weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  if (Number.isNaN(+date)) return;
  const nextWeek = date.toISOString().slice(0,10), parts = cacheKey.split('|');
  parts[2] = nextWeek;
  const key = parts.join('|');
  if (getScheduleSummary(key)) return;
  const userId = Number(cacheKey.split('|')[0]);
  const revision = scheduleSummaryRevision(userId);
  try {
    const { data } = await getScheduleSummaryResponse(url, { ...config, params: { ...config.params, weekStart: nextWeek, skipOfficeMaterialize: 'true' }, skipGlobalLoading: true });
    if (!data || (data.weekStart && data.weekStart !== nextWeek) || !isCurrent() || revision !== scheduleSummaryRevision(userId)) return;
    const tagged = { ...data };
    for (const field of ['scheduleEvents','officeEvents','supervisionSessions','schoolAssignments','officeRequests','schoolRequests','virtualWorkingHours']) {
      tagged[field] = (data[field] || []).map(row => ({ ...row, _agencyId: Number(row.agencyId || 0) || null }));
    }
    setScheduleSummary(key, tagged);
  } catch { /* A speculative read must never block or replace the visible week. */ }
}
