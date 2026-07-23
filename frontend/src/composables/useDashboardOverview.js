/**
 * useDashboardOverview — parallel fetch for My Dashboard Overview landing.
 * Composes existing endpoints (no aggregator API).
 */
import { computed, ref, watch } from 'vue';
import api from '../services/api';

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
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) ? t : null;
}

function isSameLocalDay(ms, ymd) {
  if (ms == null) return false;
  return localYmd(new Date(ms)) === ymd;
}

function formatTimeRange(startMs, endMs) {
  const opts = { hour: 'numeric', minute: '2-digit' };
  const start = startMs != null ? new Date(startMs).toLocaleTimeString([], opts) : '';
  const end = endMs != null ? new Date(endMs).toLocaleTimeString([], opts) : '';
  if (start && end) return `${start} – ${end}`;
  return start || end || 'Time TBD';
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

/**
 * @param {object} opts
 * @param {import('vue').Ref|import('vue').ComputedRef} opts.userId
 * @param {import('vue').Ref|import('vue').ComputedRef} opts.agencyId
 * @param {import('vue').Ref|import('vue').ComputedRef} [opts.enabled]
 * @param {import('vue').Ref|import('vue').ComputedRef} [opts.companyEvents] — optional parent-supplied events
 * @param {import('vue').Ref|import('vue').ComputedRef} [opts.supervisionPrompts] — optional parent-supplied prompts
 */
export function useDashboardOverview(opts = {}) {
  const loading = ref(false);
  const error = ref('');
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

  const todayYmd = computed(() => localYmd());

  const resolve = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);

  const effectiveCompanyEvents = computed(() => {
    const fromParent = resolve(opts.companyEvents);
    if (Array.isArray(fromParent)) return fromParent;
    return localCompanyEvents.value;
  });

  const effectiveSupervisionPrompts = computed(() => {
    const fromParent = resolve(opts.supervisionPrompts);
    return Array.isArray(fromParent) ? fromParent : [];
  });

  const todayScheduleItems = computed(() => {
    const s = scheduleSummary.value || {};
    const ymd = todayYmd.value;
    const now = Date.now();
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
      items.push({
        id: `sched-${e.kind || 'evt'}-${e.id || startMs}`,
        kind: String(e.kind || 'event').toLowerCase(),
        title: e.title || e.kind || 'Scheduled event',
        subtitle: e.location || e.subtitle || '',
        startMs,
        endMs,
        timeLabel: formatTimeRange(startMs, endMs),
        status: statusForWindow(startMs, endMs, now)
      });
    }

    for (const e of s.supervisionSessions || []) {
      const startMs = parseAt(e.startAt || e.startsAt);
      const endMs = parseAt(e.endAt || e.endsAt);
      if (!isSameLocalDay(startMs, ymd) && !isSameLocalDay(endMs, ymd)) continue;
      items.push({
        id: `supv-${e.id || startMs}`,
        kind: 'supervision',
        title: e.title || 'Supervision',
        subtitle: e.sessionType || e.superviseeName || '',
        startMs,
        endMs,
        timeLabel: formatTimeRange(startMs, endMs),
        status: statusForWindow(startMs, endMs, now),
        joinUrl: e.joinUrl || e.meetingUrl || null
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
    const lastFromSummary = Number(summary.value?.lastPaycheck?.totalPay);
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
    const ymd = todayYmd.value;
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

    const fromCompany = (effectiveCompanyEvents.value || []).map((e) => {
      const enriched = calendarEventsById.value.get(Number(e.id)) || e;
      const startMs = parseAt(enriched.nextOccurrenceStart || enriched.startsAt || e.nextOccurrenceStart || e.startsAt);
      const endMs = parseAt(enriched.endsAt || e.endsAt);
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
      return {
        id: `ce-${e.id}`,
        title,
        subtitle: formatTimeRange(startMs, endMs),
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
      if (e.startMs == null) return true;
      // Today or future
      return isSameLocalDay(e.startMs, ymd) || e.startMs >= now - 60 * 60 * 1000;
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
    for (const n of notifications.value.slice(0, 8)) {
      items.push({
        id: `n-${n.id}`,
        kind: 'notification',
        title: n.title || n.message || n.type || 'Notification',
        subtitle: n.message && n.title ? n.message : '',
        at: n.created_at || n.createdAt || null,
        unread: !n.is_read && !n.is_resolved
      });
    }
    if (taskCount.value > 0) {
      items.push({
        id: 'tasks-open',
        kind: 'tasks',
        title: `${taskCount.value} open task${taskCount.value === 1 ? '' : 's'}`,
        subtitle: 'View Momentum List',
        at: null,
        unread: false
      });
    }
    if (ticketCount.value > 0) {
      items.push({
        id: 'tickets-open',
        kind: 'tickets',
        title: `${ticketCount.value} support ticket${ticketCount.value === 1 ? '' : 's'}`,
        subtitle: 'View Momentum List',
        at: null,
        unread: false
      });
    }
    if (notesToSignCount.value > 0) {
      items.push({
        id: 'notes-to-sign',
        kind: 'notes_to_sign',
        title: `${notesToSignCount.value} note${notesToSignCount.value === 1 ? '' : 's'} to sign`,
        subtitle: 'Open Momentum List',
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

  const load = async () => {
    const enabled = resolve(opts.enabled);
    if (enabled === false) return;

    const uid = Number(resolve(opts.userId) || 0);
    const aid = Number(resolve(opts.agencyId) || 0);
    if (!uid || !aid) return;

    loading.value = true;
    error.value = '';
    try {
      const weekStart = startOfWeekMondayYmd(new Date());
      const hasParentEvents = Array.isArray(resolve(opts.companyEvents));

      const requests = [
        api.get('/payroll/me/dashboard-summary', { params: { agencyId: aid }, skipGlobalLoading: true })
          .then((r) => { summary.value = r.data || null; })
          .catch(() => { summary.value = null; }),
        api.get('/payroll/me/current-tier', { params: { agencyId: aid }, skipGlobalLoading: true })
          .then((r) => {
            const t = r.data?.tier || null;
            tier.value = t
              ? {
                  label: String(t.label || '').trim(),
                  status: String(t.status || '').trim().toLowerCase(),
                  periodStart: r.data?.periodStart || null,
                  periodEnd: r.data?.periodEnd || null
                }
              : null;
          })
          .catch(() => { tier.value = null; }),
        api.get(`/users/${uid}/schedule-summary`, {
          params: { agencyId: aid, weekStart },
          skipGlobalLoading: true
        })
          .then((r) => { scheduleSummary.value = r.data || null; })
          .catch(() => { scheduleSummary.value = null; }),
        api.get('/notifications', {
          params: { agencyId: aid, limit: 10 },
          skipGlobalLoading: true
        })
          .then((r) => {
            notifications.value = Array.isArray(r.data) ? r.data : [];
          })
          .catch(() => { notifications.value = []; }),
        api.get('/notifications/counts', { skipGlobalLoading: true })
          .then((r) => {
            const counts = r.data || {};
            unreadCount.value = Number(counts[aid] ?? Object.values(counts).reduce((s, n) => s + Number(n || 0), 0)) || 0;
          })
          .catch(() => { unreadCount.value = 0; }),
        api.get('/tasks', { skipGlobalLoading: true })
          .then((r) => {
            const rows = Array.isArray(r.data) ? r.data : (r.data?.tasks || []);
            taskCount.value = rows.filter((t) => {
              const st = String(t.status || t.task_status || '').toLowerCase();
              return !st || st === 'open' || st === 'pending' || st === 'in_progress';
            }).length;
          })
          .catch(() => { taskCount.value = 0; }),
        api.get('/support-tickets/mine', { skipGlobalLoading: true })
          .then((r) => {
            const rows = Array.isArray(r.data) ? r.data : (r.data?.tickets || []);
            ticketCount.value = rows.filter((t) => String(t.status || '').toLowerCase() !== 'closed').length;
          })
          .catch(() => { ticketCount.value = 0; }),
        api.get('/me/notes-to-sign/count', { skipGlobalLoading: true })
          .then((r) => { notesToSignCount.value = Number(r.data?.count || 0) || 0; })
          .catch(() => { notesToSignCount.value = 0; }),
        api.get('/payroll/me/periods', { params: { agencyId: aid }, skipGlobalLoading: true })
          .then((r) => {
            // /me/periods already returns posted/finalized only (newest first).
            const rows = Array.isArray(r.data) ? r.data : [];
            recentPayAmounts.value = rows
              .map((p) => Number(p.total_amount ?? p.totalPay ?? p.total_pay ?? 0))
              .filter((n) => Number.isFinite(n))
              .slice(0, 10);
          })
          .catch(() => { recentPayAmounts.value = []; })
      ];

      if (!hasParentEvents) {
        requests.push(
          api.get('/me/company-events', { skipGlobalLoading: true })
            .then((r) => {
              const rows = Array.isArray(r.data) ? r.data : [];
              localCompanyEvents.value = rows
                .slice()
                .sort((a, b) => {
                  const aTime = new Date(a?.nextOccurrenceStart || a?.startsAt || 0).getTime();
                  const bTime = new Date(b?.nextOccurrenceStart || b?.startsAt || 0).getTime();
                  return aTime - bTime;
                })
                .slice(0, 20);
            })
            .catch(() => { localCompanyEvents.value = []; })
        );
      }

      requests.push(
        api.get('/me/company-events/calendar', { skipGlobalLoading: true })
          .then((r) => {
            const rows = Array.isArray(r.data) ? r.data : [];
            const map = new Map();
            for (const row of rows) {
              const id = Number(row?.id);
              if (id) map.set(id, row);
            }
            calendarEventsById.value = map;
          })
          .catch(() => { calendarEventsById.value = new Map(); })
      );

      await Promise.all(requests);
    } catch (e) {
      error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load overview';
    } finally {
      loading.value = false;
    }
  };

  watch(
    () => [resolve(opts.userId), resolve(opts.agencyId), resolve(opts.enabled)],
    ([uid, aid, en]) => {
      if (en === false) return;
      if (uid && aid) void load();
    },
    { immediate: true }
  );

  return {
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
