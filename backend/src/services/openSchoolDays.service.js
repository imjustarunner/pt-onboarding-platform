/**
 * Derived open school-day opportunities (no parallel marketplace table).
 */
import { getSchoolCoverageSummary, WEEKDAYS } from './schoolCoverageMetrics.service.js';

/**
 * @returns {{ agencyId, refreshedAt, days, summary }}
 */
export async function getOpenSchoolDays(agencyId, { schoolId = null } = {}) {
  const summary = await getSchoolCoverageSummary(agencyId, { orgType: 'school' });
  const days = [];

  for (const s of summary.schools || []) {
    if (schoolId && Number(s.schoolId) !== Number(schoolId)) continue;

    for (const d of s.days || []) {
      const reasons = [];
      let urgency = 'low';

      if (d.unstaffed) {
        reasons.push('unstaffed_with_clients');
        urgency = 'high';
      }
      if (Number(d.slotsAvailable || 0) > 0) {
        reasons.push('open_capacity');
        if (urgency !== 'high') urgency = 'medium';
      }
      if (s.waitlistCount > 0 && Number(d.slotsAvailable || 0) > 0) {
        reasons.push('waitlist_with_capacity');
        urgency = 'high';
      }
      if (s.waitlistCount > 0 && d.providersCount === 0) {
        reasons.push('waitlist_unstaffed_day');
        urgency = 'high';
      }

      if (!reasons.length) continue;

      days.push({
        id: `${s.schoolId}-${d.dayOfWeek}`,
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        districtName: s.districtName,
        dayOfWeek: d.dayOfWeek,
        providersCount: d.providersCount,
        clientsCount: d.clientsCount,
        openSlots: Number(d.slotsAvailable || 0),
        slotsTotal: Number(d.slotsTotal || 0),
        waitlist: Number(s.waitlistCount || 0),
        urgency,
        reasons,
        reason: reasons[0],
        applyHint: `Request ${d.dayOfWeek} at ${s.schoolName}`
      });
    }

    // School-level: waitlist + no capacity anywhere → surface as needing any day
    if (s.waitlistCount > 0 && s.slotsAvailable === 0 && s.providersCount === 0) {
      for (const dayOfWeek of WEEKDAYS) {
        const already = days.some((x) => x.schoolId === s.schoolId && x.dayOfWeek === dayOfWeek);
        if (already) continue;
        days.push({
          id: `${s.schoolId}-${dayOfWeek}-need`,
          schoolId: s.schoolId,
          schoolName: s.schoolName,
          districtName: s.districtName,
          dayOfWeek,
          providersCount: 0,
          clientsCount: 0,
          openSlots: 0,
          slotsTotal: 0,
          waitlist: Number(s.waitlistCount || 0),
          urgency: 'high',
          reasons: ['coverage_need'],
          reason: 'coverage_need',
          applyHint: `Coverage needed ${dayOfWeek} at ${s.schoolName}`
        });
      }
    }
  }

  const urgencyRank = { high: 0, medium: 1, low: 2 };
  days.sort((a, b) => {
    const u = (urgencyRank[a.urgency] ?? 9) - (urgencyRank[b.urgency] ?? 9);
    if (u !== 0) return u;
    return String(a.schoolName || '').localeCompare(String(b.schoolName || ''));
  });

  return {
    agencyId,
    refreshedAt: new Date().toISOString(),
    days,
    summary: {
      total: days.length,
      highUrgency: days.filter((d) => d.urgency === 'high').length,
      schoolsAffected: new Set(days.map((d) => d.schoolId)).size
    }
  };
}
