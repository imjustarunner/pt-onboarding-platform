<template>
  <div class="momentum-list-tab">
    <!-- Digest Section -->
    <section class="momentum-digest" aria-label="Focus digest">
      <div class="digest-header">
        <h2 class="digest-title">{{ digestLabel }}</h2>
        <span class="digest-time-hint">{{ digestTimeHint }}</span>
      </div>
      <div v-if="digestLoading" class="digest-loading">Loading focus...</div>
      <div v-else class="digest-content">
        <div v-if="topFocusItems.length > 0" class="digest-top-focus">
          <h3>Top 3 Focus</h3>
          <ol class="focus-list">
            <li
              v-for="(item, i) in topFocusItems"
              :key="`focus-${i}`"
              class="focus-item"
              data-add-to-sticky
            >
              {{ item.label }}
            </li>
          </ol>
        </div>
        <div v-if="alsoOnRadar.length > 0" class="digest-radar">
          <h3>Also on your radar</h3>
          <ul class="radar-list">
            <li
              v-for="(item, i) in alsoOnRadar"
              :key="`radar-${i}`"
              class="radar-item"
              data-add-to-sticky
            >
              {{ item.label }}
            </li>
          </ul>
        </div>
        <div class="digest-counts">
          <span v-if="payrollNotesCount > 0">Clinical notes: {{ payrollNotesCount }} unpaid</span>
          <span v-if="notesToSignCount > 0">Notes to sign: {{ notesToSignCount }}</span>
          <span v-if="taskCount > 0">Open tasks: {{ taskCount }}</span>
          <span v-if="notificationCount > 0">Action required: {{ notificationCount }}</span>
          <span v-if="ticketCount > 0">Open tickets: {{ ticketCount }}</span>
          <span v-if="checklistIncompleteCount > 0">Checklist items: {{ checklistIncompleteCount }}</span>
          <span v-if="undoneStickyEntries.length > 0">Undone notes: {{ undoneStickyEntries.length }}</span>
          <span v-if="payrollNotesCount === 0 && notesToSignCount === 0 && taskCount === 0 && notificationCount === 0 && ticketCount === 0 && checklistIncompleteCount === 0 && undoneStickyEntries.length === 0" class="digest-all-clear">
            All clear for now.
          </span>
        </div>
      </div>
    </section>

    <!-- Shared lists -->
    <section v-if="agencyId" class="momentum-shared-lists-section" aria-label="Shared lists">
      <div class="shared-lists-head" @click="sharedListsExpanded = !sharedListsExpanded">
        <h2 class="section-title">Shared lists</h2>
        <span class="shared-lists-toggle">{{ sharedListsExpanded ? '▼' : '▶' }}</span>
      </div>
      <SharedListsView
        v-show="sharedListsExpanded"
        :agency-id="agencyId"
        @task-changed="fetchDigest"
      />
    </section>

    <!-- Focus Assistant (Gemini chat) -->
    <section class="momentum-chat-section" aria-label="Focus Assistant">
      <MomentumChatPanel
        :program-id="programId"
        :agency-id="agencyId"
        @task-changed="fetchDigest"
      />
    </section>

    <!-- Notes to sign (supervisors only) -->
    <NotesToSignSection :count="notesToSignCount" @signed="refreshNotesToSignCount" />

    <!-- Checklist Section (embedded) -->
    <section class="momentum-checklist-section" aria-label="Checklist">
      <h2 class="section-title">Checklist</h2>
      <UnifiedChecklistTab
        :program-id="programId"
        :agency-id="agencyId"
        @update-count="onChecklistCountUpdate"
      />
    </section>

    <!-- Assigned Tickets / Notifications / Tasks / Payroll (quick links) -->
    <section v-if="showQuickLinks" class="momentum-quick-links">
      <h2 class="section-title">Quick links</h2>
      <div class="quick-links-grid">
        <router-link
          v-if="taskCount > 0"
          to="/tasks"
          class="quick-link-card"
          data-add-to-sticky="My Tasks"
        >
          <span class="quick-link-icon">📋</span>
          <span class="quick-link-label">My Tasks</span>
          <span class="quick-link-badge">{{ taskCount }}</span>
        </router-link>
        <router-link
          v-if="notificationCount > 0"
          :to="notificationsRoute"
          class="quick-link-card"
          data-add-to-sticky="Notifications"
        >
          <span class="quick-link-icon">🔔</span>
          <span class="quick-link-label">Notifications</span>
          <span class="quick-link-badge">{{ notificationCount }}</span>
        </router-link>
        <router-link
          v-if="ticketCount > 0"
          :to="supportTicketsRoute"
          class="quick-link-card"
          data-add-to-sticky="My Tickets"
        >
          <span class="quick-link-icon">🎫</span>
          <span class="quick-link-label">My Tickets</span>
          <span class="quick-link-badge">{{ ticketCount }}</span>
        </router-link>
        <router-link
          v-if="payrollNotesCount > 0"
          :to="payrollRoute"
          class="quick-link-card quick-link-card-warn"
          data-add-to-sticky="Complete notes"
        >
          <span class="quick-link-icon">📝</span>
          <span class="quick-link-label">Complete clinical notes</span>
          <span class="quick-link-badge">{{ payrollNotesCount }}</span>
        </router-link>
        <router-link
          v-if="notesToSignCount > 0"
          :to="notesToSignRoute"
          class="quick-link-card quick-link-card-sign"
          data-add-to-sticky="Notes to sign"
        >
          <span class="quick-link-icon">✍️</span>
          <span class="quick-link-label">Notes to sign</span>
          <span class="quick-link-badge">{{ notesToSignCount }}</span>
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useNotificationStore } from '../../store/notifications';
import UnifiedChecklistTab from './UnifiedChecklistTab.vue';
import MomentumChatPanel from '../momentum/MomentumChatPanel.vue';
import NotesToSignSection from './NotesToSignSection.vue';
import SharedListsView from './SharedListsView.vue';

const props = defineProps({
  programId: { type: Number, default: null },
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['update-count']);

const route = useRoute();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const userId = computed(() => authStore.user?.id);

const sharedListsExpanded = ref(false);
const digestLoading = ref(true);
const checklistCount = ref(0);
const checklistIncompleteCount = ref(0);
const taskCount = ref(0);
const notesToSignCount = ref(0);
const ticketCount = ref(0);
const notificationCount = ref(0);
const checklistIncompleteItems = ref([]);
const undoneStickyEntries = ref([]);
const tasks = ref([]);
const tickets = ref([]);
const payrollNotesSummary = ref(null);
const geminiDigest = ref(null);

const digestLabel = computed(() => {
  const hour = new Date().getHours();
  return hour >= 18 ? 'Tomorrow Focus' : 'Today Focus';
});

const digestTimeHint = computed(() => {
  const hour = new Date().getHours();
  return hour >= 18 ? 'You’re checking in late — here’s what to focus on tomorrow.' : 'Here’s what to focus on today.';
});

const payrollNotesItems = computed(() => {
  const s = payrollNotesSummary.value;
  if (!s) return [];
  const items = [];
  const unpaid = s.unpaidLast || {};
  const twoOld = s.twoPeriodsOld || {};
  const total = (Number(unpaid.totalNotes) || 0) + (Number(twoOld.totalNotes) || 0);
  if (total > 0) {
    if (Number(twoOld.totalNotes) > 0) {
      items.push({ label: `Complete notes from 2 pay periods ago (${twoOld.totalNotes} unpaid)`, source: 'payroll', priority: 1 });
    }
    if (Number(unpaid.totalNotes) > 0) {
      items.push({ label: `Complete clinical notes for current pay period (${unpaid.totalNotes} unpaid)`, source: 'payroll', priority: 2 });
    }
  }
  return items;
});

const payrollNotesCount = computed(() => {
  const s = payrollNotesSummary.value;
  if (!s) return 0;
  const unpaid = s.unpaidLast || {};
  const twoOld = s.twoPeriodsOld || {};
  return (Number(unpaid.totalNotes) || 0) + (Number(twoOld.totalNotes) || 0);
});

const delinquencyScore = computed(() => Number(payrollNotesSummary.value?.delinquencyScore ?? 0) || 0);

const topFocusItems = computed(() => {
  if (geminiDigest.value?.topFocus?.length) {
    return geminiDigest.value.topFocus;
  }
  const items = [];
  const payroll = payrollNotesItems.value || [];
  const escalateNotes = delinquencyScore.value >= 2 && payrollNotesCount.value > 0;
  if (escalateNotes) {
    items.push({
      label: `Complete clinical notes (${payrollNotesCount.value} unpaid) - Did you do your notes today?`,
      source: 'payroll'
    });
  }
  if (notesToSignCount.value > 0) {
    items.push({ label: `Sign supervisee notes (${notesToSignCount.value} pending)`, source: 'notes-to-sign' });
  }
  if (payroll.length > 0 && !escalateNotes) {
    for (let i = 0; items.length < 3 && i < payroll.length; i++) {
      items.push({ label: payroll[i].label, source: 'payroll' });
    }
  }
  const checklist = checklistIncompleteItems.value || [];
  const undone = undoneStickyEntries.value || [];
  const t = tasks.value || [];
  const tk = tickets.value || [];

  for (let i = 0; items.length < 3 && i < checklist.length; i++) {
    items.push({ label: checklist[i].title || checklist[i].label, source: 'checklist' });
  }
  for (let i = 0; items.length < 3 && i < undone.length; i++) {
    items.push({ label: undone[i].label, source: 'sticky' });
  }
  for (let i = 0; items.length < 3 && i < t.length; i++) {
    if (t[i].status !== 'completed') {
      items.push({ label: t[i].title || t[i].task, source: 'task' });
    }
  }
  for (let i = 0; items.length < 3 && i < tk.length; i++) {
    if (String(tk[i].status || '').toLowerCase() === 'open') {
      items.push({ label: tk[i].subject || tk[i].question?.slice(0, 50) || 'Support ticket', source: 'ticket' });
    }
  }
  return items.slice(0, 3);
});

const alsoOnRadar = computed(() => {
  if (geminiDigest.value?.alsoOnRadar?.length) {
    return geminiDigest.value.alsoOnRadar;
  }
  const items = [];
  const payroll = payrollNotesItems.value || [];
  const checklist = checklistIncompleteItems.value || [];
  const undone = undoneStickyEntries.value || [];
  const t = tasks.value || [];
  const tk = tickets.value || [];

  const topLabels = new Set(topFocusItems.value.map((f) => f.label));
  if (notesToSignCount.value > 0 && !topLabels.has(`Sign supervisee notes (${notesToSignCount.value} pending)`)) {
    items.push({ label: `Sign supervisee notes (${notesToSignCount.value} pending)`, source: 'notes-to-sign' });
  }
  for (let i = 0; items.length < 5 && i < payroll.length; i++) {
    if (!topLabels.has(payroll[i].label)) items.push({ label: payroll[i].label, source: 'payroll' });
  }
  let used = 0;
  for (let i = 0; items.length < 5 && used < checklist.length; i++) {
    const lbl = checklist[used]?.title || checklist[used]?.label;
    if (!topLabels.has(lbl)) items.push({ label: lbl, source: 'checklist' });
    used++;
  }
  for (let i = 0; items.length < 5 && i < undone.length; i++) {
    if (!topLabels.has(undone[i].label)) items.push({ label: undone[i].label, source: 'sticky' });
  }
  for (let i = 0; items.length < 5 && i < t.length; i++) {
    if (t[i].status !== 'completed') {
      const lbl = t[i].title || t[i].task;
      if (!topLabels.has(lbl)) items.push({ label: lbl, source: 'task' });
    }
  }
  for (let i = 0; items.length < 5 && i < tk.length; i++) {
    if (String(tk[i].status || '').toLowerCase() === 'open') {
      const lbl = tk[i].subject || tk[i].question?.slice(0, 50) || 'Support ticket';
      if (!topLabels.has(lbl)) items.push({ label: lbl, source: 'ticket' });
    }
  }
  return items.slice(0, 5);
});

const showQuickLinks = computed(
  () =>
    taskCount.value > 0 ||
    notificationCount.value > 0 ||
    ticketCount.value > 0 ||
    payrollNotesCount.value > 0 ||
    notesToSignCount.value > 0
);

const payrollRoute = computed(() => {
  const slug = route.params?.organizationSlug;
  const base = slug ? `/${slug}/dashboard` : '/dashboard';
  return `${base}?tab=my&my=payroll`;
});

const notesToSignRoute = computed(() => {
  const slug = route.params?.organizationSlug;
  const base = slug ? `/${slug}/dashboard` : '/dashboard';
  return `${base}?tab=momentum&section=notes-to-sign`;
});

const notificationsRoute = computed(() => {
  const slug = route.params?.organizationSlug;
  return slug ? `/${slug}/notifications` : '/notifications';
});

const supportTicketsRoute = computed(() => {
  const slug = route.params?.organizationSlug;
  return slug ? `/${slug}/admin/support-tickets` : '/admin/support-tickets';
});

const flattenChecklistIncomplete = (data) => {
  const out = [];
  for (const item of data.trainingItems || []) {
    out.push({ title: item.title, label: item.title });
  }
  for (const item of data.documentItems || []) {
    out.push({ title: item.title, label: item.title });
  }
  for (const item of data.customItems || []) {
    if (!item.is_completed) out.push({ title: item.title, label: item.title });
  }
  for (const focus of data.trainingFocusesWithItems || []) {
    for (const mod of focus.modules || []) {
      for (const item of mod.checklistItems || []) {
        if (!item.is_completed) out.push({ title: item.title, label: item.title });
      }
    }
  }
  return out;
};

const flattenUndoneStickyEntries = (stickies) => {
  const out = [];
  for (const sticky of stickies || []) {
    for (const entry of sticky.entries || []) {
      if (!entry.is_checked) {
        const text = String(entry.text || '').trim();
        if (text) out.push({ label: text.length > 60 ? `${text.slice(0, 57)}...` : text, source: 'sticky' });
      }
    }
  }
  return out;
};

const fetchDigest = async () => {
  if (!userId.value) return;
  digestLoading.value = true;
  try {
    const fetches = [
      api.get(`/users/${userId.value}/unified-checklist`, {
        params: { programId: props.programId || undefined, agencyId: props.agencyId || undefined }
      }).catch(() => ({ data: {} })),
      api.get('/tasks').catch(() => ({ data: [] })),
      api.get('/support-tickets/mine').catch(() => ({ data: [] })),
      api.get(`/users/${userId.value}/momentum-stickies`).catch(() => ({ data: [] })),
      api.get('/me/notes-to-sign/count').catch(() => ({ data: { count: 0 } }))
    ];
    if (props.agencyId) {
      fetches.push(
        api.get('/payroll/me/dashboard-summary', { params: { agencyId: props.agencyId } }).catch(() => ({ data: null }))
      );
    }

    const results = await Promise.all(fetches);
    const checklistRes = results[0];
    const tasksRes = results[1];
    const ticketsRes = results[2];
    const stickiesRes = results[3];
    const notesToSignRes = results[4];
    const payrollRes = props.agencyId ? results[5] : null;

    const checklist = checklistRes.data || {};
    checklistIncompleteItems.value = flattenChecklistIncomplete(checklist);
    checklistIncompleteCount.value = checklist.counts?.total ?? checklistIncompleteItems.value.length;

    const stickies = Array.isArray(stickiesRes.data) ? stickiesRes.data : [];
    undoneStickyEntries.value = flattenUndoneStickyEntries(stickies);

    tasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    taskCount.value = tasks.value.filter((t) => t.status !== 'completed' && t.status !== 'overridden').length;

    tickets.value = Array.isArray(ticketsRes.data) ? ticketsRes.data : [];
    ticketCount.value = tickets.value.filter((t) => String(t.status || '').toLowerCase() === 'open').length;

    notesToSignCount.value = Number(notesToSignRes?.data?.count ?? 0);

    if (payrollRes?.data) {
      const p = payrollRes.data;
      const unpaid = p.unpaidNotes || {};
      payrollNotesSummary.value = {
        unpaidLast: unpaid.lastPayPeriod || {},
        twoPeriodsOld: unpaid.twoPeriodsOld || null,
        delinquencyScore: Number(p.delinquencyScore ?? 0) || 0
      };
    } else {
      payrollNotesSummary.value = null;
    }

    await notificationStore.fetchCounts?.();

    geminiDigest.value = null;
    const delinquencyScore = Number(payrollNotesSummary.value?.delinquencyScore ?? 0) || 0;
    try {
      const digestRes = await api.get(`/users/${userId.value}/momentum-digest`, {
        params: {
          agencyId: props.agencyId || undefined,
          programId: props.programId || undefined,
          payrollNotesCount: payrollNotesCount.value,
          notesToSignCount: notesToSignCount.value,
          delinquencyScore
        }
      });
      if (digestRes?.data?.topFocus?.length || digestRes?.data?.alsoOnRadar?.length) {
        geminiDigest.value = digestRes.data;
      }
    } catch {
      // Fallback to rule-based digest
    }
    notificationCount.value = Number(notificationStore.unreadCount || 0);
  } catch (err) {
    console.error('Failed to fetch Momentum List digest:', err);
  } finally {
    digestLoading.value = false;
  }
};

const onChecklistCountUpdate = (count) => {
  checklistCount.value = count;
  emit('update-count', count);
};

const refreshNotesToSignCount = async () => {
  try {
    const res = await api.get('/me/notes-to-sign/count');
    notesToSignCount.value = Number(res?.data?.count ?? 0);
  } catch {
    notesToSignCount.value = 0;
  }
};

onMounted(() => {
  fetchDigest();
});

watch([() => props.programId, () => props.agencyId], () => {
  fetchDigest();
});
</script>

<style scoped>
.momentum-list-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.momentum-digest {
  background: linear-gradient(135deg, #fef9c3 0%, #fef08a 30%, #fde047 100%);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  padding: 16px 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.digest-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}

.digest-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1a;
}

.digest-time-hint {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.5);
}

.digest-loading {
  color: rgba(0, 0, 0, 0.6);
  font-size: 14px;
}

.digest-top-focus h3,
.digest-radar h3 {
  margin: 0 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: rgba(0, 0, 0, 0.7);
}

.focus-list,
.radar-list {
  margin: 0;
  padding-left: 20px;
}

.focus-item,
.radar-item {
  margin-bottom: 4px;
  font-size: 14px;
  color: #1a1a1a;
}

.digest-radar {
  margin-top: 12px;
}

.digest-counts {
  margin-top: 12px;
  margin-bottom: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
}

.digest-all-clear {
  font-style: italic;
}

.momentum-shared-lists-section {
  background: white;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 12px 16px;
}

.shared-lists-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.shared-lists-head .section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.shared-lists-toggle {
  font-size: 12px;
  color: #6b7280;
}

.momentum-checklist-section .section-title {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
}

.momentum-quick-links .section-title {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
}

.quick-links-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.quick-link-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: white;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  font-size: 14px;
  transition: box-shadow 0.2s;
}

.quick-link-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.quick-link-icon {
  font-size: 18px;
}

.quick-link-badge {
  margin-left: auto;
  padding: 2px 8px;
  background: var(--primary, #3b82f6);
  color: white;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.quick-link-card-warn .quick-link-badge {
  background: #b45309;
}

.quick-link-card-sign .quick-link-badge {
  background: #059669;
}
</style>
