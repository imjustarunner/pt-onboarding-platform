import { computed, ref } from 'vue';
import api from '../services/api';

function formatMoney(cents) {
  const n = Number(cents || 0);
  return `$${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}`;
}

function formatWhen(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Shared Phase 5 data loader for life_coach / consultant coach dashboards.
 */
export function usePractitionerDashboardData({ resolveAgencyId, resolveProviderId }) {
  const loading = ref(false);
  const error = ref('');
  const overview = ref({
    statusCounts: {},
    sessionsThisWeek: 0,
    sessionsToday: 0,
    upcomingSessions: [],
    recentCompletedSessions: [],
    revenueMtdCents: 0,
    recentPayments: []
  });
  const tasks = ref([]);
  const unreadMessages = ref(0);

  const kpis = computed(() => {
    const sc = overview.value.statusCounts || {};
    const active = Number(sc.current || 0);
    const prospective = Number(sc.prospective || 0);
    const screener = Number(sc.screener || 0);
    const packet = Number(sc.packet || 0);
    return [
      {
        label: 'Active clients',
        value: String(active),
        trend: `${prospective} prospective`,
        tone: 'up'
      },
      {
        label: 'Sessions this week',
        value: String(overview.value.sessionsThisWeek || 0),
        trend: `${overview.value.sessionsToday || 0} today`,
        tone: 'up'
      },
      {
        label: 'In pipeline',
        value: String(screener + packet),
        trend: `${screener} screener · ${packet} packet`,
        tone: 'up'
      },
      {
        label: 'Revenue this month',
        value: formatMoney(overview.value.revenueMtdCents),
        trend: `${(overview.value.recentPayments || []).length} recent payments`,
        tone: 'up'
      },
      {
        label: 'Prospectives',
        value: String(prospective),
        trend: 'From public inquiries',
        tone: 'up'
      }
    ];
  });

  const snapshot = computed(() => {
    const sc = overview.value.statusCounts || {};
    const parts = [
      { label: 'Current', key: 'current', color: '#2d6a4f' },
      { label: 'Packet', key: 'packet', color: '#c4a574' },
      { label: 'Screener', key: 'screener', color: '#64748b' },
      { label: 'Prospective', key: 'prospective', color: '#94a3b8' }
    ];
    const total = parts.reduce((s, p) => s + Number(sc[p.key] || 0), 0) || 1;
    return parts.map((p) => {
      const count = Number(sc[p.key] || 0);
      return {
        label: p.label,
        count,
        pct: Math.round((count / total) * 100),
        color: p.color
      };
    });
  });

  const upcoming = computed(() =>
    (overview.value.upcomingSessions || []).slice(0, 8).map((s) => ({
      id: s.id,
      time: formatWhen(s.startAt),
      title: s.sessionOfLabel || s.title || s.kind,
      meta: [s.clientName, s.packageName].filter(Boolean).join(' · ') || s.kind,
      badge: s.kind === 'DISCOVERY' ? 'Discovery' : 'Coaching',
      badgeTone: s.kind === 'DISCOVERY' ? 'warn' : 'ok',
      clientId: s.clientId
    }))
  );

  const activity = computed(() => {
    const items = [];
    for (const p of overview.value.recentPayments || []) {
      items.push({
        id: `pay-${p.id}`,
        title: `Payment ${formatMoney(p.amountCents)}`,
        meta: [p.clientName, p.packageName, p.paymentMode].filter(Boolean).join(' · '),
        when: p.paidAt,
        tone: 'ok',
        badge: 'Paid'
      });
    }
    for (const s of overview.value.recentCompletedSessions || []) {
      items.push({
        id: `sess-${s.id}`,
        title: s.sessionOfLabel || s.title || 'Session completed',
        meta: [s.clientName, s.packageName].filter(Boolean).join(' · '),
        when: s.startAt,
        tone: 'neutral',
        badge: 'Session'
      });
    }
    return items
      .sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0))
      .slice(0, 8);
  });

  const openTasks = computed(() =>
    (tasks.value || []).slice(0, 6).map((t) => ({
      id: t.id,
      label: t.title || t.name || t.description || `Task #${t.id}`,
      done: ['completed', 'overridden', 'COMPLETE', 'COMPLETED'].includes(
        String(t.status || '').toLowerCase()
      )
    }))
  );

  async function loadOverview() {
    const agencyId = resolveAgencyId?.();
    const providerId = resolveProviderId?.();
    if (!agencyId) return;
    const res = await api.get('/practitioner-packages/dashboard-overview', {
      params: { agencyId, providerId }
    });
    overview.value = {
      statusCounts: res.data?.statusCounts || {},
      sessionsThisWeek: Number(res.data?.sessionsThisWeek || 0),
      sessionsToday: Number(res.data?.sessionsToday || 0),
      upcomingSessions: res.data?.upcomingSessions || [],
      recentCompletedSessions: res.data?.recentCompletedSessions || [],
      revenueMtdCents: Number(res.data?.revenueMtdCents || 0),
      recentPayments: res.data?.recentPayments || []
    };
  }

  async function loadTasks() {
    try {
      const res = await api.get('/tasks');
      const rows = Array.isArray(res.data) ? res.data : (res.data?.tasks || []);
      const open = (rows || []).filter((t) => {
        const st = String(t.status || '').toLowerCase();
        if (['completed', 'overridden', 'complete', 'cancelled'].includes(st)) return false;
        const type = String(t.task_type || t.type || '').toLowerCase();
        // Prefer actionable coaching work; still allow untitled customs
        if (!type || type === 'custom' || type === 'client_assignment') return true;
        return !!t.metadata?.clientId || !!t.client_id;
      });
      tasks.value = open;
    } catch {
      tasks.value = [];
    }
  }

  async function loadUnread() {
    try {
      const agencyId = resolveAgencyId?.();
      const res = await api.get('/chat/threads', {
        params: agencyId ? { agencyId } : undefined
      });
      const threads = Array.isArray(res.data) ? res.data : (res.data?.threads || []);
      unreadMessages.value = (threads || []).reduce(
        (sum, t) => sum + Number(t.unread_count || t.unreadCount || 0),
        0
      );
    } catch {
      unreadMessages.value = 0;
    }
  }

  async function refresh() {
    loading.value = true;
    error.value = '';
    try {
      await Promise.all([loadOverview(), loadTasks(), loadUnread()]);
    } catch (e) {
      error.value = e?.response?.data?.error?.message || e.message || 'Could not load dashboard';
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    overview,
    kpis,
    upcoming,
    openTasks,
    snapshot,
    activity,
    unreadMessages,
    refresh,
    formatMoney,
    formatWhen
  };
}
