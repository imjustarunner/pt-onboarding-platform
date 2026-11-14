import { getScheduleSummaryResponse } from './scheduleSummaryRequests.js';
import { getScheduleSummary, setScheduleSummary } from './scheduleSummaryCache.js';

export async function prefetchNextScheduleWeek(url, config, cacheKey, isCurrent = () => true) {
  if (!isCurrent()) return;
  const date = new Date(`${config.params.weekStart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  if (Number.isNaN(+date)) return;
  const nextWeek = date.toISOString().slice(0,10), parts = cacheKey.split('|');
  parts[2] = nextWeek;
  const key = parts.join('|');
  if (getScheduleSummary(key)) return;
  try {
    const { data } = await getScheduleSummaryResponse(url, { params: { ...config.params, weekStart: nextWeek, skipOfficeMaterialize: 'true' }, skipGlobalLoading: true });
    if (!data || !isCurrent()) return;
    const tagged = { ...data };
    for (const field of ['scheduleEvents','officeEvents','supervisionSessions','schoolAssignments','officeRequests','schoolRequests','virtualWorkingHours']) {
      tagged[field] = (data[field] || []).map(row => ({ ...row, _agencyId: Number(row.agencyId || 0) || null }));
    }
    setScheduleSummary(key, tagged);
  } catch { /* A speculative read must never block or replace the visible week. */ }
}
