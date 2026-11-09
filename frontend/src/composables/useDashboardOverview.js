/**
 * useDashboardOverview — parallel fetch for My Dashboard Overview landing.
 * Composes existing endpoints (no aggregator API).
 */
import { getScheduleSummaryResponse } from '../utils/scheduleSummaryRequests';
import { computed, ref, reactive, watch, onScopeDispose } from 'vue';
import api from '../services/api';
import { buildRecentSubmissionActivityItems } from '../utils/submitSubmissionHistory';
import { shouldShowOnProviderDashboardEvents, companyEventDisplayWindow } from '../utils/companyEventStaffing';
import { formatViewerTimeRangeMs, formatSchoolEventWhen, schoolEventDisplayTimezone } from '../utils/timezones.js';
import { parseScheduleUtcInstant } from '../utils/scheduleEventInstants.js';
import { notificationDestination } from '../utils/notificationActions.js';

function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekMondayYmd(dateLike = new Date()) {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return localYmd();
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return localYmd(d);
}

function parseAt(v) {
  const d = parseScheduleUtcInstant(v);
  return d ? d.getTime() : null;
}

function isSameLocalDay(ms, ymd) {
  if (ms == null) return false;
  return localYmd(new Date(ms)) === ymd;
}

function formatTimeRange(startMs, endMs) {
  const range = formatViewerTimeRangeMs(startMs, endMs);
  return range || 'Time TBD';
}

function statusForWindow(startMs, endMs, now = Date.now()) {
  if (startMs != null && endMs != null) {
    if (now >= startMs && now <= endMs) return 'in_progress';
    if (now > endMs) return 'completed';
    return 'upcoming';
  }
  if (startMs != null) {
    if (now >= startMs) return 'in_progress';
    return 'upcoming';
  }
  return 'upcoming';
}

function fallCheckinModalityFromTitle(title) {
  return /virtual/i.test(String(title || '')) ? 'Virtual' : 'In person';
}

function fallCheckinSchoolFromTitle(title) {
  const raw = String(title || '').trim();
  if (!raw) return '';
  const dashMatch = raw.match(/school visit\s*[—-]\s*(.+)$/i);
  if (dashMatch) return String(dashMatch[1] || '').trim();
  // Legacy titles: "In person Columbia" / "Virtual Columbia" / "In person Columbia High"
  const legacy = raw.match(/^(?:in\s*person|virtual)\s+(.+)$/i);
  if (legacy) return String(legacy[1] || '').trim();
  return '';
}

/**
 * @param {object} opts
 * @param {import('vue').Ref|import('vue').ComputedRef} opts.userId
 * @param {import('vue').Ref|import('vue').ComputedRef} opts.agencyId
 * @param {import('vue').Ref|import('vue').ComputedRef} [opts.enabled]
 * @param {import('vue').Ref|import('vue').ComputedRef} [opts.companyEvents] — optional parent-supplied events
 * @param {import('vue').Ref|import('vue').ComputedRef} [opts.supervisionPrompts] — optional parent-supplied prompts
 */
export function useDashboardOverview(opts = {}) {
  const sectionState = reactive(Object.fromEntries(['schedule', 'pay', 'activity', 'events']
    .map(key => [key, { loading: true, error: '' }])));
  const loading = computed(() => Object.values(sectionState).some(state => state.loading));
  const error = computed(() => Object.values(sectionState).find(state => state.error)?.error || '');
  let contextGeneration = 0;
  const runs = {};
  onScopeDispose(() => { contextGeneration++; });
  const summary = ref(null);
  const tier = ref(null);
  const scheduleSummary = ref(null);
  const localCompanyEvents = ref([]);
  const calendarEventsById = ref(new Map());
  const notifications = ref([]);
  const unreadCount = ref(0);
  const taskCount = ref(0);
  const ticketCount = ref(0);
  const notesToSignCount = ref(0);
  const recentPayAmounts = ref([]); // last up to 10 posted paycheck totals (newest first)
  const submissionActivityItems = ref([]);

  const todayYmd = computed(() => localYmd());

  const resolve = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);

  const effectiveCompanyEvents = computed(() => {
    const fromParent = resolve(opts.companyEvents);
    const list = Array.isArray(fromParent) ? fromParent : localCompanyEvents.value;
    const merged = new Map((Array.isArray(list) ? list : []).map((event) => [Number(event.id), event]));
    for (const [id, event] of calendarEventsById.value) merged.set(id, event);
    return [...merged.values()].filter((event) => shouldShowOnProviderDashboardEvents(event));
  });

  const effectiveSupervisionPrompts = computed(() => {
    const fromParent = resolve(opts.supervisionPrompts);
    return Array.isArray(fromParent) ? fromParent : [];
  });

  const todayScheduleItems = computed(() => {
    const s = scheduleSummary.value || {};
    const ymd = todayYmd.value;
    const now = Date.now();
    const viewerId = Number(resolve(opts.userId) || 0);
    const items = [];

    for (const e of s.officeEvents || []) {
      const startMs = parseAt(e.startAt || e.startsAt);
      const endMs = parseAt(e.endAt || e.endsAt);
      if (!isSameLocalDay(startMs, ymd) && !isSameLocalDay(endMs, ymd)) continue;
      const room = [e.buildingName, e.roomLabel].filter(Boolean).join(' · ');
      items.push({
        id: `office-${e.id || startMs}`,
        kind: 'office',
        title: room || 'Office appointment',
        subtitle: e.displayStatus || 'Office',
        startMs,
        endMs,
        timeLabel: formatTimeRange(startMs, endMs),
        status: statusForWindow(startMs, endMs, now)
      });
    }

    for (const e of s.scheduleEvents || []) {
      const startMs = parseAt(e.startAt || e.startsAt || e.startDate);
      const endMs = parseAt(e.endAt || e.endsAt || e.endDate);
      if (!isSameLocalDay(startMs, ymd) && !isSameLocalDay(endMs, ymd)) continue;
      const eventKind = String(e.kind || '').trim().toUpperCase();
      const isPreslot = eventKind === 'FALL_CHECKIN_PRESLOT';
      const isBookedVisit = eventKind === 'FALL_CHECKIN_BOOKED';
      const schoolName = String(e.schoolName || fallCheckinSchoolFromTitle(e.title) || '').trim();
      const modality = fallCheckinModalityFromTitle(e.title);
      let title = e.title || e.kind || 'Scheduled event';
      let subtitle = e.location || e.subtitle || '';
      if (isPreslot) {
        title = 'Open visit slot';
        subtitle = 'Open until a school books';
      } else if (isBookedVisit) {
        title = schoolName ? `${schoolName} · ${modality}` : title;
        subtitle = String(e.locationAddress || e.description || '').trim() || subtitle;
      }
      items.push({
        id: `sched-${e.kind || 'evt'}-${e.id || startMs}`,
        eventId: Number(e.id || 0) || null,
        kind: String(e.kind || 'event').toLowerCase(),
        eventKind,
        reasonCode: String(e.reasonCode || '').trim().toUpperCase() || null,
        focusSessionEnabled: e.focusSessionEnabled === true || Number(e.focus_session_enabled || 0) === 1,
        title,
        subtitle,
        startMs,
        endMs,
        timeLabel: formatTimeRange(startMs, endMs),
        status: statusForWindow(startMs, endMs, now),
        featured: isBookedVisit,
        preslot: isPreslot,
        logoAgencyId: isBookedVisit ? Number(e.agencyId || 0) || null : null,
        schoolName: schoolName || null,
        schoolLogoUrl: String(e.schoolLogoUrl || '').trim() || null,
        locationAddress: String(e.locationAddress || '').trim() || null,
        mapsUrl: String(e.mapsUrl || '').trim() || null,
        modality: isBookedVisit ? modality : null,
        joinUrl: (() => {
          const isHost = e.isHost === true
            || (viewerId > 0 && Number(e.createdByUserId || 0) === viewerId);
          return String((isHost ? e.hostJoinUrl : null) || e.appJoinUrl || e.participantJoinUrl || '').trim() || null;
        })()
      });
    }

    for (const e of s.supervisionSessions || []) {
      const startMs = parseAt(e.startAt || e.startsAt);
      const endMs = parseAt(e.endAt || e.endsAt);
      if (!isSameLocalDay(startMs, ymd) && !isSameLocalDay(endMs, ymd)) continue;
      const sessionType = String(e.sessionType || e.session_type || '').trim();
      const who = String(e.counterpartyName || e.superviseeName || e.supervisorName || '').trim();
      items.push({
        id: `supv-${e.id || startMs}`,
        kind: 'supervision',
        title: who ? `Supervision · ${who}` : (e.title || 'Supervision'),
        subtitle: sessionType ? `Supervision (${sessionType})` : 'Supervision',
        startMs,
        endMs,
        timeLabel: formatTimeRange(startMs, endMs),
        status: statusForWindow(startMs, endMs, now),
        joinUrl: String(
          ((String(e.role || '').toLowerCase() === 'supervisor' || e.isSupervisor === true) ? e.hostJoinUrl : null)
          || e.joinUrl
          || e.participantJoinUrl
          || e.meetingUrl
          || ''
        ).trim() || null,
        modality: e.modality || null,
        sessionType
      });
    }

    items.sort((a, b) => (a.startMs || 0) - (b.startMs || 0));
    return items;
  });

  const nextScheduleItem = computed(() => {
    const now = Date.now();
    return todayScheduleItems.value.find((i) => i.status === 'in_progress' || (i.startMs != null && i.startMs >= now))
      || todayScheduleItems.value[0]
      || null;
  });

  const notesStats = computed(() => {
    const unpaid = summary.value?.unpaidNotes?.lastPayPeriod || null;
    if (!unpaid) {
      return { incomplete: 0, total: 0, completedPct: null, periodLabel: '', noNote: 0, draft: 0 };
    }
    const incomplete = Number(unpaid.totalNotes ?? unpaid.totalUnits ?? 0) || 0;
    // Only real unpaid-note counts — no invented completion %.
    return {
      incomplete,
      total: incomplete,
      completedPct: null,
      periodLabel: unpaid.periodStart && unpaid.periodEnd
        ? `${unpaid.periodStart} – ${unpaid.periodEnd}`
        : 'Last Pay Period',
      noNote: Number(unpaid.noNoteNotes ?? unpaid.noNoteUnits ?? 0) || 0,
      draft: Number(unpaid.draftNotes ?? unpaid.draftUnits ?? 0) || 0
    };
  });

  const directIndirect = computed(() => {
    const di = summary.value?.directIndirect || null;
    if (!di || di.disabled) return null;
    return di;
  });

  const supervisionHours = computed(() => summary.value?.supervision || null);

  const payPeriod = computed(() => {
    const lp = summary.value?.lastPaycheck || null;
    const t = tier.value;
    return {
      lastPaycheck: lp,
      periodStart: lp?.periodStart || t?.periodStart || null,
      periodEnd: lp?.periodEnd || t?.periodEnd || null,
      totalPay: lp?.totalPay ?? null,
      totalCredits: lp?.totalUnpaidUnits ?? null,
      tierLabel: t?.label || '',
      tierStatus: t?.status || ''
    };
  });

  /**
   * Compare last paycheck to the average of the last (up to) 10 posted checks.
   * ratio = last / average; 1 = at average, >1 above, <0.9 below the 90% band.
   */
  const paycheckCompare = computed(() => {
    const amounts = (recentPayAmounts.value || [])
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n >= 0);
    const lastFromSummary = summary.value?.lastPaycheck?.totalPay == null ? NaN : Number(summary.value.lastPaycheck.totalPay);
    let series = amounts.slice(0, 10);
    if (!series.length && Number.isFinite(lastFromSummary)) {
      series = [lastFromSummary];
    }
    if (!series.length) {
      return { ratio: null, average: null, sampleSize: 0, last: null };
    }
    const last = series[0];
    const avg = series.reduce((a, b) => a + b, 0) / series.length;
    if (!(avg > 0)) {
      return { ratio: last > 0 ? 1 : 0, average: avg, sampleSize: series.length, last };
    }
    return {
      ratio: last / avg,
      average: avg,
      sampleSize: series.length,
      last
    };
  });

  const upcomingEvents = computed(() => {
    const now = Date.now();
    const fromPrompts = (effectiveSupervisionPrompts.value || []).map((p) => {
      const startMs = parseAt(p.startAt);
      const endMs = parseAt(p.endAt);
      return {
        id: `prompt-${p.id}`,
        title: p.sessionTypeLabel || p.title || 'Supervision',
        subtitle: p.timeLabel || formatTimeRange(startMs, endMs),
        whereLine: String(p.location || p.where || '').trim(),
        schoolName: '',
        location: String(p.location || p.where || '').trim(),
        startMs,
        endMs,
        isLive: !!p.isLive || statusForWindow(startMs, endMs, now) === 'in_progress',
        joinUrl: p.joinUrl || null,
        kind: 'supervision'
      };
    });

    const fromCompany = (effectiveCompanyEvents.value || []).filter(e => !['team_poll', 'direct_notice'].includes(String(e.eventType || e.event_type || '').toLowerCase())).map((e) => {
      const enriched = calendarEventsById.value.get(Number(e.id)) || e;
      const window = companyEventDisplayWindow(enriched);
      const startMs = parseAt(window.startsAt);
      const endMs = parseAt(window.endsAt);
      const title = String(enriched.title || enriched.name || e.title || e.name || 'Company event').trim();
      const schoolName = String(enriched.schoolName || enriched.organizationName || e.schoolName || e.organizationName || '').trim();
      const location = String(
        enriched.location || enriched.eventLocationName || enriched.eventLocationAddress || enriched.publicLocationAddress ||
        e.location || e.eventLocationName || e.eventLocationAddress || e.publicLocationAddress || ''
      ).trim();
      const whereParts = [];
      // Show affiliated school when it adds info beyond the title
      if (schoolName && schoolName.toLowerCase() !== title.toLowerCase()) {
        whereParts.push(schoolName);
      }
      if (
        location &&
        location.toLowerCase() !== schoolName.toLowerCase() &&
        location.toLowerCase() !== title.toLowerCase()
      ) {
        whereParts.push(location);
      }
      const city = String(enriched.schoolCity || enriched.city || enriched.eventLocationCity || e.schoolCity || e.city || '').trim();
      const address = String(enriched.eventLocationAddress || enriched.publicLocationAddress || enriched.schoolAddress || e.eventLocationAddress || e.publicLocationAddress || e.schoolAddress || '').trim();
      for (const part of [address, city]) if (part && !whereParts.some(p => p.toLowerCase().includes(part.toLowerCase()))) whereParts.push(part);
      return {
        id: `ce-${e.id}`,
        title,
        subtitle: formatTimeRange(startMs, endMs),
        eventTimeLabel: `Event time: ${formatSchoolEventWhen(window.startsAt, window.endsAt, enriched.timezone)} (${schoolEventDisplayTimezone(enriched.timezone)})`,
        whereLine: whereParts.length ? whereParts.join(' · ') : '',
        schoolName: schoolName || '',
        location: location || '',
        startMs,
        endMs,
        isLive: statusForWindow(startMs, endMs, now) === 'in_progress',
        joinUrl: enriched.joinUrl || enriched.meetingUrl || e.joinUrl || e.meetingUrl || null,
        kind: 'company',
        raw: enriched
      };
    }).filter((e) => {
      return e.endMs != null && e.endMs > now;
    });

    const merged = [...fromPrompts, ...fromCompany]
      .sort((a, b) => (a.startMs || 0) - (b.startMs || 0))
      .slice(0, 8);
    return merged;
  });

  const featuredEvent = computed(() => {
    const live = upcomingEvents.value.find((e) => e.isLive);
    if (live) return live;
    const today = upcomingEvents.value.find((e) => isSameLocalDay(e.startMs, todayYmd.value));
    return today || upcomingEvents.value[0] || null;
  });

  const recentActivityItems = computed(() => {
    const items = [];
    for (const s of submissionActivityItems.value) {
      items.push({
        id: `sub-${s.id}`,
        kind: 'submission_update',
        title: s.title,
        subtitle: s.subtitle,
        at: s.sortMs ? new Date(s.sortMs).toISOString() : null,
        unread: s.unread,
        navTarget: s.navTarget,
        status: s.status,
        statusClass: s.statusClass,
      });
    }
    for (const n of notifications.value.slice(0, 8)) {
      const dest = notificationDestination(n, {
        organizationSlug: resolve(opts.organizationSlug) || null,
        role: resolve(opts.role) || null
      });
      items.push({
        id: `n-${n.id}`,
        kind: 'notification',
        title: n.title || n.message || n.type || 'Notification',
        subtitle: n.message && n.title ? n.message : '',
        at: n.created_at || n.createdAt || null,
        unread: !n.is_read && !n.is_resolved,
        navTarget: dest || 'notifications'
      });
    }
    if (taskCount.value > 0) {
      items.push({
        id: 'tasks-open',
        kind: 'tasks',
        title: `${taskCount.value} open task${taskCount.value === 1 ? '' : 's'}`,
        subtitle: 'View My Work',
        at: null,
        unread: false
      });
    }
    if (ticketCount.value > 0) {
      items.push({
        id: 'tickets-open',
        kind: 'tickets',
        title: `${ticketCount.value} support ticket${ticketCount.value === 1 ? '' : 's'}`,
        subtitle: 'View My Work',
        at: null,
        unread: false
      });
    }
    if (notesToSignCount.value > 0) {
      items.push({
        id: 'notes-to-sign',
        kind: 'notes_to_sign',
        title: `${notesToSignCount.value} note${notesToSignCount.value === 1 ? '' : 's'} to sign`,
        subtitle: 'Open My Work',
        at: null,
        unread: true
      });
    }
    return items.slice(0, 10);
  });

  const greetingName = computed(() => {
    // filled by consumer from auth; placeholder here unused
    return '';
  });

  const reset = () => {
    summary.value = tier.value = scheduleSummary.value = null;
    localCompanyEvents.value = notifications.value = recentPayAmounts.value = submissionActivityItems.value = [];
    calendarEventsById.value = new Map();
    unreadCount.value = taskCount.value = ticketCount.value = notesToSignCount.value = 0;
  };

  const load = async (onlySection = null) => {
    if (resolve(opts.enabled) === false) return;
    const uid = Number(resolve(opts.userId) || 0);
    const aid = Number(resolve(opts.agencyId) || 0);
    if (!uid || !aid) return;
    const generation = contextGeneration;
    const config = { timeout: 12000, skipGlobalLoading: true };
    const get = (url, params) => api.get(url, { ...config, ...(params ? { params } : {}) }).then(r => r.data);
    const list = data => Array.isArray(data) ? data : [];
    const scoped = { agencyId: aid };
    const groups = {
      schedule: async (apply) => {
        const { data } = await getScheduleSummaryResponse(`/users/${uid}/schedule-summary`, {
          ...config, params: { agencyId: aid, weekStart: startOfWeekMondayYmd(), includeAllAgencies: 1 }
        });
        apply(() => { scheduleSummary.value = data || {}; });
      },
      pay: async (apply) => {
        const [pay, currentTier, periods] = await Promise.all([
          get('/payroll/me/dashboard-summary', scoped), get('/payroll/me/current-tier', scoped), get('/payroll/me/periods', scoped)
        ]);
        apply(() => {
          summary.value = pay || null;
          const t = currentTier?.tier;
          tier.value = t ? { label: String(t.label || '').trim(), status: String(t.status || '').toLowerCase(),
            periodStart: currentTier.periodStart, periodEnd: currentTier.periodEnd } : null;
          recentPayAmounts.value = list(periods).map(p => Number(p.total_amount ?? p.totalPay ?? p.total_pay ?? 0))
            .filter(Number.isFinite).slice(0, 10);
        });
      },
      activity: async (apply) => {
        const submissions = resolve(opts.includeSubmissionUpdates) !== false
          ? Promise.all(['time-claims', 'mileage-claims', 'pto-requests', 'reimbursement-claims', 'company-card-expenses', 'medcancel-claims']
            .map(path => get(`/payroll/me/${path}`, scoped).then(list))) : Promise.resolve(null);
        const [notices, counts, tasks, tickets, notes, claims] = await Promise.all([
          get('/notifications', { agencyId: aid, limit: 10 }), get('/notifications/counts'),
          get('/tasks'), get('/support-tickets/mine'), get('/me/notes-to-sign/count'), submissions
        ]);
        apply(() => {
          notifications.value = list(notices);
          unreadCount.value = Number(counts?.[aid] ?? 0) || 0;
          taskCount.value = list(tasks?.tasks || tasks).filter(t =>
            ['', 'open', 'pending', 'in_progress'].includes(String(t.status || t.task_status || '').toLowerCase())).length;
          ticketCount.value = list(tickets?.tickets || tickets).filter(t => String(t.status || '').toLowerCase() !== 'closed').length;
          notesToSignCount.value = Number(notes?.count || 0);
          if (claims) {
            const [timeClaims, mileageClaims, ptoRequests, reimbursementClaims, companyCardExpenses, medcancelClaims] = claims;
            submissionActivityItems.value = buildRecentSubmissionActivityItems({ timeClaims, mileageClaims, ptoRequests,
              reimbursementClaims, companyCardExpenses, medcancelClaims, limit: 6 });
          }
        });
      },
      events: async (apply) => {
        const [events, calendar] = await Promise.all([
          Array.isArray(resolve(opts.companyEvents)) ? null : get('/me/company-events'), get('/me/company-events/calendar')
        ]);
        apply(() => {
          localCompanyEvents.value = list(events).slice().sort((a, b) =>
            new Date(a.nextOccurrenceStart || a.startsAt || 0) - new Date(b.nextOccurrenceStart || b.startsAt || 0)).slice(0, 20);
          calendarEventsById.value = new Map(list(calendar).filter(row => Number(row.id)).map(row => [Number(row.id), row]));
        });
      }
    };
    // Schedule is dispatched first and each card settles independently. A retry
    // refreshes only that card. Late replies from another tenant never paint here.
    await Promise.all(Object.entries(groups).filter(([key]) => !onlySection || key === onlySection).map(async ([key, run]) => {
      const runId = runs[key] = (runs[key] || 0) + 1;
      const current = () => generation === contextGeneration && runs[key] === runId;
      sectionState[key] = { loading: true, error: '' };
      try { await run(update => { if (current()) update(); }); }
      catch { if (current()) sectionState[key].error = 'This information could not be loaded. Please try again.'; }
      finally { if (current()) sectionState[key].loading = false; }
    }));
  };

  watch(
    () => [resolve(opts.userId), resolve(opts.agencyId), resolve(opts.enabled)],
    ([uid, aid, enabled]) => {
      contextGeneration++;
      reset();
      for (const key of Object.keys(sectionState)) sectionState[key] = { loading: !!uid && !!aid && enabled !== false, error: '' };
      if (uid && aid && enabled !== false) void load();
    },
    { immediate: true }
  );

  return {
    sectionState,
    loading,
    error,
    summary,
    tier,
    scheduleSummary,
    todayYmd,
    todayScheduleItems,
    nextScheduleItem,
    notesStats,
    directIndirect,
    supervisionHours,
    payPeriod,
    paycheckCompare,
    upcomingEvents,
    featuredEvent,
    recentActivityItems,
    unreadCount,
    taskCount,
    ticketCount,
    notesToSignCount,
    greetingName,
    refresh: load,
    localYmd,
    formatTimeRange
  };
}
