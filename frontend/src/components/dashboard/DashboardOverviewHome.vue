<template>
  <div class="ov-home" data-tour="dash-overview">
    <header class="ov-header">
      <div class="ov-greeting">
        <h2 class="ov-hello">{{ greeting }}</h2>
        <p class="ov-sub">Here's what's happening today.</p>
      </div>
      <div class="ov-header-actions">
        <button
          v-if="showClaims || showLogTime"
          type="button"
          class="ov-log-time-btn"
          data-tour="dash-overview-submit"
          @click="navigate('submit')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 16V4m-4 4 4-4 4 4M4 14v6h16v-6"/>
          </svg>
          Submit
        </button>
        <button
          type="button"
          class="ov-icon-btn"
          data-tour="dash-overview-notifications"
          :aria-label="`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`"
          @click="navigate('notifications')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span v-if="unreadCount > 0" class="ov-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
        </button>
        <button
          type="button"
          class="ov-icon-btn"
          aria-label="Open schedule" data-tour="dash-overview-schedule"
          @click="navigate('my_schedule')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </button>
        <DashboardCardEditor :layout="cardLayout" :card-keys="availableCardKeys" :labels="cardLabels" :hidden="hiddenCards" @toggle="toggleCard" @reset="resetCards" />
      </div>
    </header>

    <slot name="search" />

    <OverviewEmailDrafts v-if="showChats" :agency-id="agencyId" :enabled="enabled" />

    <div class="ov-metric-row" :class="{ 'ov-metric-row--focus-open': !focusCollapsed }">
      <OverviewTodaysFocus
        class="ov-focus-slot"
        :agency-id="agencyId"
        @update:collapsed="focusCollapsed = $event"
        @view-momentum="navigate('checklist')"
        @add-sticky="navigate('checklist')"
        @open-item="onOpenFocusItem"
      />

      <OverviewMetricCards
        flatten-grid
        :show-schedule="false"
        :show-payroll="false"
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
        :note-aid-queue-count="noteAidQueueCount"
        :note-aid-in-progress-count="noteAidInProgressCount"
        :supervision-hours="supervisionHours"
        :notes-to-sign-count="notesToSignCount"
        :task-count="taskCount"
        @navigate="navigate"
        @open-note-aid="openNoteAid"
      />
      <button v-for="key in collapsedCardKeys" :key="key" type="button" class="ov-collapsed-card"
        :aria-label="`Expand ${cardLabels[key]}`" @click="setCollapsed(key, false)">
        <span>{{ cardLabels[key] }}</span><strong>{{ cardSummary(key) }}</strong><small>Expand ↗</small>
      </button>
    </div>

    <div v-if="error" class="ov-error">{{ error }}</div>

    <div class="ov-mid">
      <DashboardOverviewSection v-if="availableCardKeys.includes('work') && !hiddenCards.includes('work')" v-show="!collapsedCards.includes('work')"
        :style="cardLayout.orderStyle('work')" :label="cardLabels.work" :section-id="'work'" @collapse="setCollapsed('work', true)">
      <OverviewWorkCard :style="cardLayout.orderStyle('work')" />
      </DashboardOverviewSection>
      <DashboardOverviewSection v-if="availableCardKeys.includes('schedule') && !hiddenCards.includes('schedule')" v-show="!collapsedCards.includes('schedule')"
        :style="cardLayout.orderStyle('schedule')" :label="cardLabels.schedule" :section-id="'schedule'" @collapse="setCollapsed('schedule', true)">
      <OverviewTodaySchedule

        :style="cardLayout.orderStyle('schedule')"
        class="ov-mid-schedule"
        :items="todayScheduleItems"
        :loading="loading"
        :show-virtual-book="showVirtualBook"
        @navigate="navigate"
        @book="onBookSchedule"
        @book-virtual="onBookVirtual"
        @join="onJoinEvent"
        @open-focus="openFocusFromSchedule"
      />
      </DashboardOverviewSection>
      <DashboardOverviewSection v-if="availableCardKeys.includes('pay') && !hiddenCards.includes('pay')" v-show="!collapsedCards.includes('pay')"
        :style="cardLayout.orderStyle('pay')" :label="cardLabels.pay" :section-id="'pay'" @collapse="setCollapsed('pay', true)">
      <OverviewPayPeriodCard

        :style="cardLayout.orderStyle('pay')"
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
      </DashboardOverviewSection>
      <DashboardOverviewSection v-if="availableCardKeys.includes('events') && !hiddenCards.includes('events')" v-show="!collapsedCards.includes('events')"
        :style="cardLayout.orderStyle('events')" :label="cardLabels.events" :section-id="'events'" @collapse="setCollapsed('events', true)">
      <OverviewEventsCard

        :style="cardLayout.orderStyle('events')"
        :agency-id="agencyId"
        class="ov-mid-events"
        :featured="featuredEvent"
        :events="upcomingEvents"
        :is-supervisor="isSupervisor"
        @navigate="navigate"
        @view-all="$emit('open-company-events')"
        @join="onJoinEvent"
        @request-changed="onEventsRequestChanged"
      />
      </DashboardOverviewSection>

      <DashboardOverviewSection v-if="availableCardKeys.includes('notes') && !hiddenCards.includes('notes')" v-show="!collapsedCards.includes('notes')"
        :style="cardLayout.orderStyle('notes')" :label="cardLabels.notes" :section-id="'notes'" @collapse="setCollapsed('notes', true)">
      <OverviewNotesSnapshot

        class="ov-bottom-notes"
        :direct-indirect="directIndirect"
        :notes-incomplete="notesStats.incomplete"
        @navigate="navigate"
      />
      </DashboardOverviewSection>
      <DashboardOverviewSection v-if="availableCardKeys.includes('activity') && !hiddenCards.includes('activity')" v-show="!collapsedCards.includes('activity')"
        :style="cardLayout.orderStyle('activity')" :label="cardLabels.activity" :section-id="'activity'" @collapse="setCollapsed('activity', true)">
      <OverviewRecentActivity
        class="ov-bottom-activity"
        :items="recentActivityItems"
        @navigate="navigate"
      />
      </DashboardOverviewSection>
      <DashboardOverviewSection v-if="availableCardKeys.includes('actions') && !hiddenCards.includes('actions')" v-show="!collapsedCards.includes('actions')"
        :style="cardLayout.orderStyle('actions')" :label="cardLabels.actions" :section-id="'actions'" @collapse="setCollapsed('actions', true)">
      <OverviewQuickActions
        class="ov-bottom-actions"
        :actions="quickActions"
        @action="onQuickAction"
      />
      </DashboardOverviewSection>
    </div>

    <div v-if="showTip" class="ov-tip" role="status">
      <span class="ov-tip-icon" aria-hidden="true">💡</span>
      <span class="ov-tip-text">Pro Tip: Keep your notes up to date to ensure accurate tracking and reporting.</span>
      <button type="button" class="ov-tip-dismiss" aria-label="Dismiss tip" @click="showTip = false">×</button>
    </div>

    <FocusSessionModal
      v-if="focusBlock"
      :block="focusBlock"
      :day-blocks="focusDayBlocks"
      :agency-id="Number(agencyId) || null"
      @close="focusBlock = null"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, toRef, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useDashboardOverview } from '../../composables/useDashboardOverview';
import DashboardOverviewSection from './DashboardOverviewSection.vue';
import DashboardCardEditor from './DashboardCardEditor.vue';
import { useDashboardCardState } from '../../composables/useDashboardCardState.js';
import OverviewWorkCard from './OverviewWorkCard.vue';
import { useDashboardLayout } from '../../composables/useDashboardLayout.js';
import OverviewMetricCards from './OverviewMetricCards.vue';
import OverviewTodaySchedule from './OverviewTodaySchedule.vue';
import OverviewPayPeriodCard from './OverviewPayPeriodCard.vue';
import OverviewEventsCard from './OverviewEventsCard.vue';
import OverviewNotesSnapshot from './OverviewNotesSnapshot.vue';
import OverviewRecentActivity from './OverviewRecentActivity.vue';
import OverviewQuickActions from './OverviewQuickActions.vue';
import OverviewEmailDrafts from './OverviewEmailDrafts.vue';
import OverviewTodaysFocus from './OverviewTodaysFocus.vue';
import FocusSessionModal from '../tasks/FocusSessionModal.vue';
import api from '../../services/api';
import { navigateToNoteAid } from '../../utils/noteAidLaunch.js';
import { fetchWorkQueueFromApi } from '../../utils/noteAidWorkQueue.js';
import {
  DOC_STATUS,
  deriveWorkQueueDocStatus,
  normalizeDocStatus,
  deriveDraftDocStatus
} from '../../utils/noteAidDocumentationStatus.js';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  companyEvents: { type: Array, default: () => [] },
  supervisionPrompts: { type: Array, default: () => [] },
  showSchedule: { type: Boolean, default: true },
  showPayroll: { type: Boolean, default: false },
  showNotes: { type: Boolean, default: false },
  showClaims: { type: Boolean, default: false },
  showLogTime: { type: Boolean, default: false },
  showSupervision: { type: Boolean, default: false },
  showMySupervision: { type: Boolean, default: false },
  showChats: { type: Boolean, default: false },
  showAdminMeetings: { type: Boolean, default: false },
  isSupervisor: { type: Boolean, default: false },
  /** Show Book virtual → My Schedule calendar booking (Virtual modality) when org context exists. */
  showVirtualBook: { type: Boolean, default: false },
  kudosEnabled: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true }
});

const router = useRouter();
const route = useRoute();

const emit = defineEmits([
  'navigate',
  'open-last-paycheck',
  'open-company-events',
  'open-submit-action',
  'join-event',
  'book-schedule',
  'book-virtual'
]);

const authStore = useAuthStore();
const showTip = ref(true);
const focusCollapsed = ref(true);
const focusBlock = ref(null);
const focusDayBlocks = ref([]);
const noteAidQueueCount = ref(0);
const noteAidInProgressCount = ref(0);

const userId = computed(() => authStore.user?.id || null);
const agencyIdRef = toRef(props, 'agencyId');
const cardLabels = { work: 'My Work', schedule: 'My Schedule', pay: 'Last pay overview', events: 'Events for you', notes: 'Notes Snapshot', activity: 'Recent Activity', actions: 'Quick Actions' };
const cardLayout = useDashboardLayout({ kind: 'staff-overview', userId, agencyId: agencyIdRef, defaultOrder: Object.keys(cardLabels) });
const availableCardKeys = computed(() => cardLayout.order.value.filter(key =>
  !(['work', 'notes'].includes(key) && !props.showNotes) && !(key === 'schedule' && !props.showSchedule) && !(key === 'pay' && !props.showPayroll)));
const { collapsedCards, hiddenCards, setCollapsed, toggleCard, resetCards } = useDashboardCardState({ kind: 'staff-overview', userId, agencyId: agencyIdRef, cardIds: Object.keys(cardLabels) });
const collapsedCardKeys = computed(() => availableCardKeys.value.filter(key => collapsedCards.value.includes(key) && !hiddenCards.value.includes(key)));
function cardSummary(key) {
  return { work: `${noteAidQueueCount.value} not started · ${noteAidInProgressCount.value} in progress`, schedule: `${todayScheduleItems.value.length} today`,
    pay: payPeriod.value.tierLabel || 'Pay period', events: `${upcomingEvents.value.length} upcoming`, notes: `${notesStats.value.incomplete || 0} incomplete`,
    activity: `${recentActivityItems.value.length} updates`, actions: `${quickActions.value.length} shortcuts` }[key];
}
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
  notesToSignCount,
  refresh,
  taskCount
} = useDashboardOverview({
  userId,
  agencyId: agencyIdRef,
  enabled: enabledRef,
  companyEvents: companyEventsRef,
  supervisionPrompts: supervisionPromptsRef,
  includeSubmissionUpdates: computed(() => props.showPayroll || props.showClaims || props.showLogTime),
  organizationSlug: computed(() => route.params.organizationSlug || authStore.user?.organization?.slug || null),
  role: computed(() => authStore.user?.effectiveRole || authStore.user?.role || null)
});

const onEventsRequestChanged = () => {
  void refresh();
};

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
});

const showSupervisionMetric = computed(() => props.showSupervision || props.showMySupervision);

const quickActions = computed(() => {
  const list = [];
  if (props.showLogTime) {
    list.unshift({
      id: 'log_time',
      title: 'Log Time',
      description: 'Clock in/out and submit indirect time for payroll.',
      icon: '⏱',
      iconBg: '#dcfce7',
      iconColor: '#166534',
      type: 'tab',
      tab: 'log_time'
    });
  }
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
      description: 'Additional school hours requests.',
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
    if (props.showAdminMeetings) {
      list.push({
        id: 'admin_meetings',
        title: 'Admin Meetings',
        description: 'Meeting log with attendance, transcript, and chat.',
        icon: '📋',
        iconBg: '#e0e7ff',
        iconColor: '#3730a3',
        type: 'route',
        routeName: 'OrganizationAdminMeetingsLog'
      });
    }
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

const onBookSchedule = () => {
  emit('book-schedule');
};

const onBookVirtual = () => {
  emit('book-virtual');
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

function toDayYmd(ms) {
  const d = ms != null ? new Date(ms) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function openFocusFromSchedule(item) {
  const eventId = Number(item?.eventId || 0);
  if (!eventId) return;
  const day = toDayYmd(item?.startMs);
  let blocks = [];
  try {
    const { data } = await api.get('/schedule-block-assignments/day', {
      params: { day },
      skipGlobalLoading: true
    });
    blocks = Array.isArray(data) ? data : [];
  } catch {
    blocks = [];
  }
  let block = blocks.find((b) => Number(b.id) === eventId) || null;
  if (!block) {
    try {
      const { data } = await api.get(`/schedule-block-assignments/${eventId}`, {
        skipGlobalLoading: true
      });
      if (data?.event) {
        block = {
          ...data.event,
          assignments: data.assignments || [],
          assignment_count: (data.assignments || []).length,
          focus_session_enabled: !!data.event.focus_session_enabled
        };
        if (!blocks.some((b) => Number(b.id) === eventId)) blocks = [...blocks, block];
      }
    } catch {
      block = null;
    }
  }
  if (!block) {
    block = {
      id: eventId,
      title: item.title || 'Focus Time',
      reason_code: item.reasonCode || 'FOCUS_TIME',
      start_at: item.startMs ? new Date(item.startMs).toISOString() : null,
      end_at: item.endMs ? new Date(item.endMs).toISOString() : null,
      focus_session_enabled: true,
      assignment_count: 0,
      assignments: []
    };
    blocks = [...blocks, block];
  }
  blocks.sort((a, b) => {
    const as = new Date(a.start_at || a.startAt || 0).getTime();
    const bs = new Date(b.start_at || b.startAt || 0).getTime();
    return as - bs;
  });
  focusDayBlocks.value = blocks;
  focusBlock.value = blocks.find((b) => Number(b.id) === eventId) || block;
}

function onOpenFocusItem(item) {
  if (item?.source === 'task' && item?.task_id) {
    emit('navigate', 'tasks_hub');
    return;
  }
  emit('navigate', 'checklist');
}

function openNoteAid() {
  const slug = route.params.organizationSlug || authStore.user?.organization?.slug || '';
  navigateToNoteAid(router, {}, { organizationSlug: slug });
}

async function loadNoteAidCounts() {
  if (!props.showNotes || !props.enabled) return;
  const uid = userId.value;
  const agencyId = Number(props.agencyId);
  if (!uid || !Number.isSafeInteger(agencyId) || agencyId < 1) return;
  try {
    const [queue, recentRes] = await Promise.all([
      fetchWorkQueueFromApi(uid).catch(() => []),
      api.get('/clinical-notes/recent', {
        params: { agencyId, allAccessible: 1, limit: 100, archiveStatus: 'active', days: 30 },
        skipGlobalLoading: true
      }).catch(() => ({ data: null }))
    ]);
    const queueItems = Array.isArray(queue) ? queue : [];
    noteAidQueueCount.value = queueItems.filter(
      (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.NOT_STARTED
    ).length;
    const startedQueue = queueItems.filter(
      (i) => deriveWorkQueueDocStatus(i) === DOC_STATUS.STARTED
    ).length;
    const drafts = Array.isArray(recentRes?.data)
      ? recentRes.data
      : (Array.isArray(recentRes?.data?.drafts) ? recentRes.data.drafts : []);
    const startedDrafts = drafts.filter((d) => {
      const s = normalizeDocStatus(deriveDraftDocStatus(d));
      return s === DOC_STATUS.STARTED;
    }).length;
    noteAidInProgressCount.value = startedQueue + startedDrafts;
  } catch {
    noteAidQueueCount.value = 0;
    noteAidInProgressCount.value = 0;
  }
}

onMounted(() => {
  void loadNoteAidCounts();
});
watch([() => props.enabled, () => props.showNotes, userId, () => props.agencyId], () => {
  void loadNoteAidCounts();
});

const onQuickAction = (action) => {
  if (action.type === 'submit') {
    emit('open-submit-action', { event: action.submitEvent, tab: 'submit' });
    return;
  }
  if (action.type === 'route' && action.routeName) {
    const slug = route.params.organizationSlug || authStore.user?.organization?.slug;
    if (slug) {
      router.push({ name: action.routeName, params: { organizationSlug: slug } });
    } else {
      router.push({ name: action.routeName });
    }
    return;
  }
  if (action.tab) emit('navigate', action.tab);
};
</script>

<style scoped>
.ov-card-settings { display: flex; flex-wrap: wrap; gap: 16px; padding: 12px; }
.ov-card-settings > div { display: flex; align-items: center; gap: 8px; }
.ov-customize { align-self: flex-end; padding: 8px 12px; cursor: pointer; }

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
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
  margin-left: auto;
  align-items: center;
  gap: 8px;
}
.ov-log-time-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  border-radius: 10px;
  background: #166534;
  color: #fff;
  font-weight: 700;
  font-size: 0.95rem;
  padding: 10px 14px;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(22, 101, 52, 0.25);
}
.ov-log-time-btn:hover { background: #14532d; }
.ov-log-time-btn:focus-visible {
  outline: 2px solid #86efac;
  outline-offset: 2px;
}
.ov-quick-nav {
  margin-top: 2px;
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
.ov-metric-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.ov-metric-row--focus-open .ov-focus-slot {
  grid-column: 1 / -1;
}
.ov-focus-slot {
  min-width: 0;
}
.ov-mid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 12px;
  align-items: stretch;
}
.ov-bottom {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
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

[data-theme="dark"] .ov-home { color: var(--text-primary, #cbd5e1); }
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
/* Use the content width, including when the navigation is expanded. */
.ov-mid { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
.ov-mid > * { min-width: 0; max-width: 100%; }
.ov-home { min-width: 0; max-width: 100%; container-type: inline-size; }
.ov-collapsed-card { display: flex; flex-direction: column; gap: 6px; text-align: left; padding: 16px; min-width: 0; border: 1px solid var(--border, #e2e8f0); border-radius: 12px; background: var(--bg-card, #fff); color: var(--text-primary); cursor: pointer; }
.ov-collapsed-card span { font-weight: 700; }
.ov-collapsed-card strong { font-size: 14px; overflow-wrap: anywhere; }
.ov-collapsed-card small { color: var(--text-secondary); }
@container (max-width: 540px) { .ov-mid { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
</style>
