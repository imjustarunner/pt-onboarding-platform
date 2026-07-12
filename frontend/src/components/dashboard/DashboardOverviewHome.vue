<template>
  <div class="ov-home" data-tour="dash-overview">
    <header class="ov-header">
      <div class="ov-greeting">
        <h2 class="ov-hello">{{ greeting }}</h2>
        <p class="ov-sub">Here's what's happening today.</p>
      </div>
      <div class="ov-header-actions">
        <button
          type="button"
          class="ov-icon-btn"
          :aria-label="`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`"
          @click="navigate('notifications')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span v-if="unreadCount > 0" class="ov-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
        </button>
        <button
          type="button"
          class="ov-icon-btn"
          aria-label="Open schedule"
          @click="navigate('my_schedule')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </button>
      </div>
    </header>

    <div v-if="error" class="ov-error">{{ error }}</div>

    <OverviewMetricCards
      :show-schedule="showSchedule"
      :show-payroll="showPayroll"
      :show-notes="showNotes"
      :show-supervision="showSupervisionMetric"
      :show-claims="showClaims"
      :is-supervisor="isSupervisor"
      :schedule-count="todayScheduleItems.length"
      :next-schedule-item="nextScheduleItem"
      :period-start="payPeriod.periodStart || ''"
      :period-end="payPeriod.periodEnd || ''"
      :tier-label="payPeriod.tierLabel || ''"
      :paycheck-compare="paycheckCompare"
      :notes-incomplete="notesStats.incomplete"
      :notes-completed-pct="notesStats.completedPct"
      :notes-period-label="notesStats.periodLabel"
      :supervision-hours="supervisionHours"
      :notes-to-sign-count="notesToSignCount"
      @navigate="navigate"
    />

    <div class="ov-mid">
      <OverviewTodaySchedule
        v-if="showSchedule"
        class="ov-mid-schedule"
        :items="todayScheduleItems"
        :loading="loading"
        @navigate="navigate"
      />
      <OverviewPayPeriodCard
        v-if="showPayroll"
        class="ov-mid-pay"
        :loading="loading"
        :period-start="payPeriod.periodStart || ''"
        :period-end="payPeriod.periodEnd || ''"
        :total-pay="payPeriod.totalPay"
        :paycheck-compare="paycheckCompare"
        :notes-incomplete="notesStats.incomplete"
        :notes-no-note="notesStats.noNote || 0"
        :notes-draft="notesStats.draft || 0"
        :direct-indirect="directIndirect"
        :summary="summary"
        :tier-label="payPeriod.tierLabel || ''"
        :tier-status="payPeriod.tierStatus || ''"
        :payroll-period-id="payPeriod.lastPaycheck?.payrollPeriodId"
        @navigate="navigate"
        @open-paycheck="openPaycheck"
      />
      <OverviewEventsCard
        class="ov-mid-events"
        :featured="featuredEvent"
        :events="upcomingEvents"
        :is-supervisor="isSupervisor"
        @navigate="navigate"
        @view-all="$emit('open-company-events')"
        @join="onJoinEvent"
      />
    </div>

    <div class="ov-bottom">
      <OverviewNotesSnapshot
        v-if="showNotes"
        class="ov-bottom-notes"
        :direct-indirect="directIndirect"
        :notes-incomplete="notesStats.incomplete"
        @navigate="navigate"
      />
      <OverviewRecentActivity
        class="ov-bottom-activity"
        :items="recentActivityItems"
        @navigate="navigate"
      />
      <OverviewQuickActions
        class="ov-bottom-actions"
        :actions="quickActions"
        @action="onQuickAction"
      />
    </div>

    <div v-if="showTip" class="ov-tip" role="status">
      <span class="ov-tip-icon" aria-hidden="true">💡</span>
      <span class="ov-tip-text">Pro Tip: Keep your notes up to date to ensure accurate tracking and reporting.</span>
      <button type="button" class="ov-tip-dismiss" aria-label="Dismiss tip" @click="showTip = false">×</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, toRef } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useDashboardOverview } from '../../composables/useDashboardOverview';
import OverviewMetricCards from './OverviewMetricCards.vue';
import OverviewTodaySchedule from './OverviewTodaySchedule.vue';
import OverviewPayPeriodCard from './OverviewPayPeriodCard.vue';
import OverviewEventsCard from './OverviewEventsCard.vue';
import OverviewNotesSnapshot from './OverviewNotesSnapshot.vue';
import OverviewRecentActivity from './OverviewRecentActivity.vue';
import OverviewQuickActions from './OverviewQuickActions.vue';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  companyEvents: { type: Array, default: () => [] },
  supervisionPrompts: { type: Array, default: () => [] },
  showSchedule: { type: Boolean, default: true },
  showPayroll: { type: Boolean, default: false },
  showNotes: { type: Boolean, default: false },
  showClaims: { type: Boolean, default: false },
  showSupervision: { type: Boolean, default: false },
  showMySupervision: { type: Boolean, default: false },
  showChats: { type: Boolean, default: false },
  isSupervisor: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true }
});

const emit = defineEmits([
  'navigate',
  'open-last-paycheck',
  'open-company-events',
  'open-submit-action',
  'join-event'
]);

const authStore = useAuthStore();
const showTip = ref(true);

const userId = computed(() => authStore.user?.id || null);
const agencyIdRef = toRef(props, 'agencyId');
const enabledRef = toRef(props, 'enabled');
const companyEventsRef = toRef(props, 'companyEvents');
const supervisionPromptsRef = toRef(props, 'supervisionPrompts');

const {
  loading,
  error,
  summary,
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
  notesToSignCount
} = useDashboardOverview({
  userId,
  agencyId: agencyIdRef,
  enabled: enabledRef,
  companyEvents: companyEventsRef,
  supervisionPrompts: supervisionPromptsRef
});

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
});

const showSupervisionMetric = computed(() => props.showSupervision || props.showMySupervision);

const quickActions = computed(() => {
  const list = [];
  if (props.showClaims) {
    list.push({
      id: 'submit_claim',
      title: 'Submit a claim',
      description: 'Mileage, reimbursement, PTO, or time.',
      icon: '＋',
      iconBg: '#dcfce7',
      iconColor: '#166534',
      type: 'submit',
      submitEvent: null,
      tab: 'submit'
    });
    list.push({
      id: 'add_availability',
      title: 'Add availability',
      description: 'Office or school availability requests.',
      icon: '📅',
      iconBg: '#f3e8ff',
      iconColor: '#7e22ce',
      type: 'submit',
      submitEvent: 'availability',
      tab: 'submit'
    });
  }
  if (props.showSchedule) {
    list.push({
      id: 'open_schedule',
      title: 'Open schedule',
      description: 'View your full week and bookings.',
      icon: '🗓',
      iconBg: '#dbeafe',
      iconColor: '#1d4ed8',
      type: 'tab',
      tab: 'my_schedule'
    });
  }
  if (props.showSupervision) {
    list.push({
      id: 'supervision',
      title: 'Open supervision',
      description: props.isSupervisor ? 'Support your supervisees.' : 'Your sessions and transcripts.',
      icon: '👥',
      iconBg: '#fce7f3',
      iconColor: '#be185d',
      type: 'tab',
      tab: 'supervision'
    });
  } else if (props.showMySupervision) {
    list.push({
      id: 'my_supervision',
      title: 'My supervision',
      description: 'Sessions, transcripts, and summaries.',
      icon: '👥',
      iconBg: '#fce7f3',
      iconColor: '#be185d',
      type: 'tab',
      tab: 'my_supervision'
    });
  }
  if (props.showChats) {
    list.push({
      id: 'chats',
      title: 'Message team',
      description: 'Open platform chats.',
      icon: '💬',
      iconBg: '#e0f2fe',
      iconColor: '#0369a1',
      type: 'tab',
      tab: 'chats'
    });
  }
  list.push({
    id: 'notifications',
    title: 'View notifications',
    description: 'Catch up on recent alerts.',
    icon: '🔔',
    iconBg: '#fef3c7',
    iconColor: '#b45309',
    type: 'tab',
    tab: 'notifications'
  });
  if (notesToSignCount.value > 0) {
    list.unshift({
      id: 'notes_to_sign',
      title: 'Notes to sign',
      description: `${notesToSignCount.value} awaiting your signature.`,
      icon: '✍',
      iconBg: '#ede9fe',
      iconColor: '#6b21a8',
      type: 'tab',
      tab: 'checklist'
    });
  }
  return list.slice(0, 6);
});

const navigate = (tab) => {
  emit('navigate', tab);
};

const openPaycheck = () => {
  const pid = payPeriod.value?.lastPaycheck?.payrollPeriodId;
  if (!pid) return;
  emit('open-last-paycheck', { payrollPeriodId: Number(pid) });
};

const onJoinEvent = (ev) => {
  if (ev?.joinUrl) {
    emit('join-event', ev);
    return;
  }
  emit('navigate', props.isSupervisor ? 'supervision' : 'my_supervision');
};

const onQuickAction = (action) => {
  if (action.type === 'submit') {
    emit('open-submit-action', { event: action.submitEvent, tab: 'submit' });
    return;
  }
  if (action.tab) emit('navigate', action.tab);
};
</script>

<style scoped>
.ov-hello {
  margin: 0;
  font-size: 18px;
  font-weight: 750;
  color: #111827;
  letter-spacing: -0.02em;
}
.ov-sub {
  margin: 2px 0 0;
  font-size: 13px;
  color: #6b7280;
}
.ov-home {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 2px 16px;
  min-height: 0;
}
.ov-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: -2px;
}
.ov-header-actions {
  display: flex;
  gap: 8px;
}
.ov-icon-btn {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #374151;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.ov-icon-btn:hover { background: #f9fafb; }
.ov-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: #7c3aed;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ov-error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
}
.ov-mid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}
.ov-bottom {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 12px;
}
.ov-tip {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  color: #4c1d95;
}
.ov-tip-text { flex: 1; }
.ov-tip-dismiss {
  background: none;
  border: none;
  font-size: 18px;
  color: #6b7280;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
}

[data-theme="dark"] .ov-hello { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-sub { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-icon-btn {
  background: #25282c;
  border-color: #475569;
  color: #cbd5e1;
}
[data-theme="dark"] .ov-icon-btn:hover { background: #2e3236; }
[data-theme="dark"] .ov-error {
  background: #3b1c1c;
  color: #fca5a5;
  border-color: #7f1d1d;
}
[data-theme="dark"] .ov-tip {
  background: #1e1a2e;
  border-color: #4c1d95;
  color: #c4b5fd;
}
[data-theme="dark"] .ov-tip-dismiss { color: #94a3b8; }
@media (max-width: 1100px) {
  .ov-mid,
  .ov-bottom {
    grid-template-columns: 1fr 1fr;
  }
  .ov-mid-schedule,
  .ov-bottom-activity {
    grid-column: 1 / -1;
  }
}
@media (max-width: 720px) {
  .ov-mid,
  .ov-bottom {
    grid-template-columns: 1fr;
  }
  .ov-mid-schedule,
  .ov-bottom-activity {
    grid-column: auto;
  }
}
</style>
