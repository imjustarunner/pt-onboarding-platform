/**
 * Event Type → payroll rate-card slot.
 *
 * Skill Builders keeps its existing direct-cap / leftover-indirect split.
 * School / Outreach kiosk events (and any future type) map to a rate-card slot
 * such as other_1 ("Outreach") without rewriting payroll math per type.
 */

import pool from '../config/database.js';
import PayrollEventTypeRateMap from '../models/PayrollEventTypeRateMap.model.js';

export const EVENT_PAYROLL_RATE_SLOTS = ['direct', 'indirect', 'other_1', 'other_2', 'other_3'];

export const KNOWN_EVENT_PAYROLL_TYPES = [
  { eventType: 'skills_group', label: 'Skill Builders / Summer Skills', defaultSlot: 'indirect', defaultSplit: true },
  { eventType: 'school_back_to_school', label: 'Back to School', defaultSlot: 'other_1', defaultSplit: false },
  { eventType: 'school_open_house', label: 'Open House', defaultSlot: 'other_1', defaultSplit: false },
  { eventType: 'school_resource_fair', label: 'Resource Fair', defaultSlot: 'other_1', defaultSplit: false },
  { eventType: 'school_family_night', label: 'Family Night', defaultSlot: 'other_1', defaultSplit: false },
  { eventType: 'school_orientation', label: 'Orientation', defaultSlot: 'other_1', defaultSplit: false },
  { eventType: 'school_other', label: 'School Event', defaultSlot: 'other_1', defaultSplit: false },
  { eventType: 'school_fall_check_in', label: 'Fall School Check-in', defaultSlot: 'other_1', defaultSplit: false },
  { eventType: 'school_spring_event', label: 'Spring School Check-in', defaultSlot: 'other_1', defaultSplit: false },
  { eventType: 'school_first_day', label: 'First Day of School', defaultSlot: 'other_1', defaultSplit: false },
  { eventType: 'school_holiday', label: 'Holiday', defaultSlot: 'indirect', defaultSplit: false },
  { eventType: 'school_day_off', label: 'Day Off', defaultSlot: 'indirect', defaultSplit: false },
  { eventType: 'program_event', label: 'Program Event', defaultSlot: 'indirect', defaultSplit: false },
  { eventType: 'guardian_program_class', label: 'Guardian Program', defaultSlot: 'indirect', defaultSplit: false },
  { eventType: 'company_event', label: 'Company Event', defaultSlot: 'indirect', defaultSplit: false }
];

const eventContextCache = new Map();
const EVENT_CONTEXT_TTL_MS = 2 * 60 * 1000;

export async function loadAgencyOtherRateTitles(agencyId) {
  const base = { title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' };
  const aid = Number(agencyId);
  if (!aid) return base;
  try {
    const [rows] = await pool.execute(
      `SELECT title_1, title_2, title_3
       FROM payroll_other_rate_titles
       WHERE agency_id = ?
       LIMIT 1`,
      [aid]
    );
    const row = rows?.[0] || null;
    return {
      title1: String(row?.title_1 || '').trim() || base.title1,
      title2: String(row?.title_2 || '').trim() || base.title2,
      title3: String(row?.title_3 || '').trim() || base.title3
    };
  } catch {
    return base;
  }
}

export function normalizeEventPayrollRateSlot(raw, fallback = 'indirect') {
  const s = String(raw || '').trim().toLowerCase();
  return EVENT_PAYROLL_RATE_SLOTS.includes(s) ? s : fallback;
}

export function isSkillBuildersPayrollEventType(eventType) {
  const t = String(eventType || '').trim().toLowerCase();
  return t === 'skills_group' || t.startsWith('skill_builder');
}

export function isSchoolPortalPayrollEventType(eventType) {
  return String(eventType || '').trim().toLowerCase().startsWith('school_');
}

export function defaultTreatmentForEventType(eventType) {
  const t = String(eventType || '').trim().toLowerCase();
  const known = KNOWN_EVENT_PAYROLL_TYPES.find((row) => row.eventType === t);
  if (known) {
    return {
      eventType: t,
      rateSlot: known.defaultSlot,
      useDirectIndirectSplit: !!known.defaultSplit
    };
  }
  if (isSkillBuildersPayrollEventType(t)) {
    return { eventType: t, rateSlot: 'indirect', useDirectIndirectSplit: true };
  }
  if (isSchoolPortalPayrollEventType(t)) {
    return { eventType: t, rateSlot: 'other_1', useDirectIndirectSplit: false };
  }
  return { eventType: t || 'company_event', rateSlot: 'indirect', useDirectIndirectSplit: false };
}

export function eventTypePayrollLabel(eventType) {
  const t = String(eventType || '').trim().toLowerCase();
  const known = KNOWN_EVENT_PAYROLL_TYPES.find((row) => row.eventType === t);
  if (known) return known.label;
  if (!t) return 'Event';
  if (t.startsWith('program_')) return 'Program Event';
  if (t.startsWith('skill_builder') || t === 'skills_group') return 'Skill Builders';
  if (t.startsWith('school_')) {
    return t.replace(/^school_/, '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseMoneyFromRateTitle(raw) {
  const text = String(raw || '').trim().replace(/,/g, '');
  const m = text.match(/^\$?(\d+(?:\.\d+)?)$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function rateSlotLabel(slot, titles = {}) {
  const s = normalizeEventPayrollRateSlot(slot);
  if (s === 'direct') return 'Direct';
  if (s === 'indirect') return 'Indirect';
  const raw = s === 'other_1'
    ? String(titles.title1 || '').trim()
    : s === 'other_2'
      ? String(titles.title2 || '').trim()
      : s === 'other_3'
        ? String(titles.title3 || '').trim()
        : '';
  const numeric = parseMoneyFromRateTitle(raw);
  if (numeric > 0) {
    const shown = Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
    return `$${shown}/hr`;
  }
  if (s === 'other_1') return raw || 'Other 1';
  if (s === 'other_2') return raw || 'Other 2';
  if (s === 'other_3') return raw || 'Other 3';
  return 'Indirect';
}

export function rateAmountForSlot(rateCard, slot, titles = {}) {
  const s = normalizeEventPayrollRateSlot(slot);
  let amount = 0;
  if (s === 'direct') amount = Number(rateCard?.direct_rate || 0) || 0;
  else if (s === 'other_1') amount = Number(rateCard?.other_rate_1 || 0) || 0;
  else if (s === 'other_2') amount = Number(rateCard?.other_rate_2 || 0) || 0;
  else if (s === 'other_3') amount = Number(rateCard?.other_rate_3 || 0) || 0;
  else amount = Number(rateCard?.indirect_rate || 0) || 0;
  if (amount > 0) return amount;
  if (s === 'other_1') return parseMoneyFromRateTitle(titles.title1);
  if (s === 'other_2') return parseMoneyFromRateTitle(titles.title2);
  if (s === 'other_3') return parseMoneyFromRateTitle(titles.title3);
  return 0;
}

/** Direct/Indirect/ADP hour columns. Other-slot event time counts as Indirect unless the rate card says Direct. */
export function reportingBucketForRateSlot(slot, rateCard = null) {
  const s = normalizeEventPayrollRateSlot(slot);
  if (s === 'direct') return 'direct';
  if (s === 'indirect') return 'indirect';
  const raw = s === 'other_1'
    ? rateCard?.other_rate_1_bucket
    : s === 'other_2'
      ? rateCard?.other_rate_2_bucket
      : s === 'other_3'
        ? rateCard?.other_rate_3_bucket
        : '';
  return String(raw || '').trim().toLowerCase() === 'direct' ? 'direct' : 'indirect';
}

export async function resolveEventPayrollTreatment({ agencyId, eventType, titles = {} }) {
  const defaults = defaultTreatmentForEventType(eventType);
  let mapped = null;
  try {
    mapped = await PayrollEventTypeRateMap.getForEventType(agencyId, defaults.eventType);
  } catch {
    mapped = null;
  }
  const rateSlot = normalizeEventPayrollRateSlot(mapped?.rateSlot || defaults.rateSlot);
  const useDirectIndirectSplit = mapped
    ? !!mapped.useDirectIndirectSplit
    : !!defaults.useDirectIndirectSplit;
  return {
    eventType: defaults.eventType,
    eventTypeLabel: eventTypePayrollLabel(defaults.eventType),
    rateSlot,
    rateSlotLabel: rateSlotLabel(rateSlot, titles),
    useDirectIndirectSplit
  };
}

export async function loadEventPayrollContext({ agencyId, eventId, titles = null }) {
  const aid = Number(agencyId);
  const eid = Number(eventId);
  if (!aid || !eid) return null;
  const cacheKey = `${aid}:${eid}`;
  const cached = eventContextCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < EVENT_CONTEXT_TTL_MS) {
    if (!cached.ctx) return null;
    const resolvedTitles = titles || await loadAgencyOtherRateTitles(aid);
    return {
      ...cached.ctx,
      rateSlotLabel: rateSlotLabel(cached.ctx.rateSlot, resolvedTitles)
    };
  }

  let row = null;
  try {
    const [rows] = await pool.execute(
      `SELECT id, title, event_type, skill_builder_direct_hours, timezone
       FROM company_events
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [eid, aid]
    );
    row = rows?.[0] || null;
  } catch {
    row = null;
  }
  if (!row) {
    eventContextCache.set(cacheKey, { at: Date.now(), ctx: null });
    return null;
  }
  const resolvedTitles = titles || await loadAgencyOtherRateTitles(aid);
  const treatment = await resolveEventPayrollTreatment({
    agencyId: aid,
    eventType: row.event_type,
    titles: resolvedTitles
  });
  const ctx = {
    eventId: eid,
    eventTitle: String(row.title || '').trim() || treatment.eventTypeLabel || 'Event',
    eventType: String(row.event_type || '').trim().toLowerCase(),
    timezone: String(row.timezone || '').trim() || 'America/Denver',
    skillBuilderDirectHours: row.skill_builder_direct_hours != null
      ? Number(row.skill_builder_direct_hours)
      : null,
    ...treatment
  };
  eventContextCache.set(cacheKey, { at: Date.now(), ctx });
  return ctx;
}

export function formatEventPayrollDateLabel(claimDate, clockInAt, timezone = 'America/Denver') {
  let iso = clockInAt || null;
  if (!iso && claimDate instanceof Date && Number.isFinite(claimDate.getTime())) {
    iso = claimDate.toISOString();
  }
  if (!iso) {
    const s = String(claimDate || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) iso = `${s.slice(0, 10)}T12:00:00`;
  }
  const d = iso ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: timezone || 'America/Denver'
    });
  } catch {
    return '';
  }
}

export async function listEventPayrollRateMapsForAgency(agencyId) {
  const stored = await PayrollEventTypeRateMap.listForAgency(agencyId);
  const byType = new Map(stored.map((row) => [row.eventType, row]));
  const extra = stored.filter((row) => !KNOWN_EVENT_PAYROLL_TYPES.some((k) => k.eventType === row.eventType));
  const rows = [
    ...KNOWN_EVENT_PAYROLL_TYPES.map((known) => {
      const saved = byType.get(known.eventType);
      return {
        eventType: known.eventType,
        label: known.label,
        rateSlot: saved?.rateSlot || known.defaultSlot,
        useDirectIndirectSplit: saved ? !!saved.useDirectIndirectSplit : !!known.defaultSplit,
        isCustom: false,
        isSaved: !!saved
      };
    }),
    ...extra.map((row) => ({
      eventType: row.eventType,
      label: eventTypePayrollLabel(row.eventType),
      rateSlot: row.rateSlot,
      useDirectIndirectSplit: !!row.useDirectIndirectSplit,
      isCustom: true,
      isSaved: true
    }))
  ];
  return rows;
}

export async function applyEventPayrollMapToSubmissions(agencyId, submissions) {
  const list = Array.isArray(submissions) ? submissions : [];
  if (!list.length) return list;
  const titles = await loadAgencyOtherRateTitles(agencyId);
  const types = [...new Set(list.map((s) => String(s?.eventType || '').trim().toLowerCase()).filter(Boolean))];
  const byType = new Map();
  for (const t of types) {
    byType.set(t, await resolveEventPayrollTreatment({ agencyId, eventType: t, titles }));
  }
  for (const s of list) {
    const t = String(s?.eventType || '').trim().toLowerCase();
    const treatment = t ? byType.get(t) : null;
    if (!treatment) continue;
    if (!s.eventTypeLabel) s.eventTypeLabel = treatment.eventTypeLabel;
    if (!treatment.useDirectIndirectSplit) {
      const stored = String(s.remainderBucket || '').toLowerCase();
      if (!stored || stored === 'indirect') s.remainderBucket = treatment.rateSlot;
    }
    s.payrollRateSlot = s.payrollRateSlot || treatment.rateSlot;
    s.payrollRateLabel = s.payrollRateLabel || treatment.rateSlotLabel;
  }
  return list;
}
