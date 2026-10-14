import pool from '../config/database.js';
import Availability from './providerAvailability.service.js';
import { executedAgreement } from './employmentAgreementPolicy.service.js';
import { minimumWeeklyHours, weeklyRequiredHours } from '../utils/contractServiceExpectations.js';
import { utcDateToZonedYmd, wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';

const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : null;
const instant = value => value instanceof Date ? value.getTime() : Date.parse(String(value || '').replace(' ', 'T').replace(/Z?$/, 'Z'));
const hours = milliseconds => Math.round(milliseconds / 3600000 * 100) / 100;
export function schedulingWeek(now, timeZone) {
  const today = utcDateToZonedYmd(now, timeZone);
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const weekStart = monday.toISOString().slice(0, 10);
  monday.setUTCDate(monday.getUTCDate() + 7);
  const weekEnd = monday.toISOString().slice(0, 10);
  return { today, weekStart, weekEnd, timeZone,
    startAt: wallMysqlToUtcMysql(`${weekStart} 00:00:00`, timeZone),
    endAt: wallMysqlToUtcMysql(`${weekEnd} 00:00:00`, timeZone) };
}

export function activeSchedulingAgreement(rows, today) {
  const agreements = rows.map(executedAgreement).filter(Boolean).map(a => {
    const d = a.data;
    const raw = d.MIN_HOURS ?? d.MINHOURS ?? d.MIN_HOURS_PER_WEEK ?? d.CONTRACT_EXPECTATIONS?.directHours;
    return { ...a, raw, effectiveOn: [a.effectiveOn, day(d.START_DATE) || a.effectiveOn].sort().at(-1) };
  }).filter(a => a.raw !== undefined && a.effectiveOn <= today)
    .sort((a,b) => b.effectiveOn.localeCompare(a.effectiveOn) || b.id - a.id);
  const agreement = agreements[0];
  if (!agreement) return null;
  return { generationId: agreement.id, effectiveOn: agreement.effectiveOn,
    minimumHours: minimumWeeklyHours(agreement.raw), requiredHours: weeklyRequiredHours(agreement.raw) };
}

// Count occupied time once: duplicate records, simultaneous formats and group
// participants do not create extra hours. Clamp every interval to this week.
export function unionMilliseconds(intervals, startAt, endAt) {
  const from = instant(startAt), to = instant(endAt);
  const spans = intervals.map(row => [Math.max(from, instant(row.startAt ?? row.start_at)), Math.min(to, instant(row.endAt ?? row.end_at))])
    .filter(([start,end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a,b) => a[0]-b[0]);
  let total = 0, start = null, end = null;
  for (const [s,e] of spans) {
    if (start == null) { start=s; end=e; }
    else if (s <= end) end=Math.max(end,e);
    else { total+=end-start; start=s; end=e; }
  }
  return total + (start == null ? 0 : end-start);
}

export async function readContractSchedulingExpectation({providerId, agencyId, now = new Date()}, {db = pool, availability = Availability} = {}) {
  const timeZone = await availability.resolveAgencyTimeZone({agencyId});
  const week = schedulingWeek(now, timeZone);
  const [agreements] = await db.execute(`SELECT g.id,g.token_values_json,t.metadata,s.signed_pdf_path,s.audit_trail
    FROM contract_generations g JOIN tasks t ON t.id=g.task_id JOIN signed_documents s ON s.task_id=t.id
    WHERE g.candidate_user_id=? AND g.agency_id=? ORDER BY g.id DESC`, [providerId,agencyId]);
  const agreement = activeSchedulingAgreement(agreements, week.today);
  const result = {agencyId, providerId, weekStart:week.weekStart, weekEnd:week.weekEnd, timeZone, agreement, checkedAt:now.toISOString()};
  if (!agreement || agreement.requiredHours == null) return {...result,status:'no_expectation',showNotice:false};
  // Do not label a midweek start as failing a full week's expectation.
  if (agreement.effectiveOn > week.weekStart) return {...result,status:'partial_week',showNotice:false};
  const [appointments] = await db.execute(`SELECT start_at,end_at FROM appointments
    WHERE provider_user_id=? AND (agency_id=? OR parent_agency_id=?) AND start_at<? AND end_at>?
      AND status IN ('scheduled','confirmed','completed','no_show')`, [providerId,agencyId,agencyId,week.endAt,week.startAt]);
  const [tutoringSessions] = await db.execute(`SELECT s.starts_at AS start_at,s.ends_at AS end_at
    FROM learning_class_sessions s JOIN learning_program_classes c ON c.id=s.learning_class_id
    WHERE s.session_subtype='tutoring' AND s.status IN ('scheduled','live','ended')
      AND (c.organization_id=? OR EXISTS (SELECT 1 FROM organization_affiliations oa
        WHERE oa.organization_id=c.organization_id AND oa.agency_id=? AND oa.is_active=1))
      AND EXISTS (SELECT 1 FROM learning_class_session_participants p WHERE p.session_id=s.id AND p.user_id=? AND p.role='presenter')
      AND s.starts_at<? AND s.ends_at>?`, [agencyId,agencyId,providerId,week.endAt,week.startAt]);
  const scheduled = [...appointments,...tutoringSessions];
  const scheduledMs = unionMilliseconds(scheduled, week.startAt, week.endAt);
  const targetMs = agreement.requiredHours * 3600000;
  const scheduledHours = hours(scheduledMs);
  if (scheduledMs >= targetMs) return {...result,status:'met',showNotice:false,scheduledHours};
  let capacityHours = null, capacityShortfallHours = null, availabilityStatus = 'unavailable';
  try {
    const available = await availability.computeWeekAvailability({agencyId,providerId,weekStartYmd:week.weekStart,
      slotMinutes:60,intakeOnly:true,includeExternalBusy:true,materializeOfficeEvents:false});
    if (available?.ok && !available.calendarWarnings?.length) {
      const open = [...(available.virtualSlots || []),...(available.inPersonSlots || [])];
      const capacityMs = unionMilliseconds([...scheduled,...open],week.startAt,week.endAt);
      capacityHours = hours(capacityMs);
      capacityShortfallHours = hours(Math.max(0,targetMs-capacityMs));
      availabilityStatus = 'checked';
    }
  } catch { /* A failed calendar check is unknown, never zero availability. */ }
  return {...result,status:'below_target',showNotice:true,scheduledHours,
    scheduledShortfallHours:hours(targetMs-scheduledMs),capacityHours,capacityShortfallHours,availabilityStatus};
}
