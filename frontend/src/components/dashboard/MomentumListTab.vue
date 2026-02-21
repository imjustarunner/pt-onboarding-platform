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
          <span v-if="payrollNotesCount > 0">Unpaid notes when payroll ran: {{ payrollNotesCount }} (you're behind)</span>
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

    <!-- Notes to sign (supervisors only, clinical users only) -->
    <NotesToSignSection v-if="clinicalNotesEligible" :count="notesToSignCount" @signed="refreshNotesToSignCount" />

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
          v-if="clinicalNotesEligible && payrollNotesCount > 0"
          :to="fullListRoute"
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
        <button
          v-if="fullListItems.length > 0"
          type="button"
          class="quick-link-card quick-link-card-full"
          @click="fullListExpanded = !fullListExpanded"
          :aria-expanded="fullListExpanded"
        >
          <span class="quick-link-icon">📋</span>
          <span class="quick-link-label">Full running list</span>
          <span class="quick-link-badge">{{ fullListItems.length }}</span>
        </button>
      </div>
    </section>

    <!-- Full running list (expandable) -->
    <section v-if="fullListItems.length > 0 && fullListExpanded" class="momentum-full-list-section" aria-label="Full running list">
      <div class="full-list-header">
        <h2 class="section-title">Full running list</h2>
        <button
          v-if="selectedFullListCount > 0"
          type="button"
          class="btn btn-primary btn-sm add-selected-btn"
          @click="openAddSelectedToSticky"
        >
          Add {{ selectedFullListCount }} to sticky
        </button>
      </div>
      <div class="full-list-table-wrap">
        <table class="full-list-table" aria-label="Full running list">
          <thead>
            <tr>
              <th class="col-check"><span class="sr-only">Select</span></th>
              <th class="col-item">Item</th>
              <th class="col-urgency">Urgency</th>
              <th class="col-category">Category</th>
              <th class="col-project">Project</th>
              <th class="col-due">Due</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, i) in fullListItems"
              :key="`full-${i}`"
              class="full-list-row"
              :data-add-to-sticky="(typeof item === 'object' ? item.label : item) || ''"
            >
              <td class="col-check">
                <label class="full-list-item-row">
                  <input
                    type="checkbox"
                    class="full-list-checkbox"
                    :checked="selectedFullListIndices.has(i)"
                    @change="toggleFullListSelection(i)"
                  />
                </label>
              </td>
              <td class="col-item">
                <span class="full-list-item-text">{{ typeof item === 'object' ? item.label : item }}</span>
              </td>
              <td class="col-urgency">
                <span v-if="item.urgency" class="urgency-badge" :class="`urgency-${item.urgency}`">{{ item.urgency }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-category">{{ formatFullListCategory(item) }}</td>
              <td class="col-project">{{ item.task_list_name || '—' }}</td>
              <td class="col-due">{{ formatFullListDue(item) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Sticky picker modal (for Add selected to sticky) -->
    <Teleport to="body">
      <div v-if="showStickyPicker" class="sticky-picker-backdrop" @click.self="showStickyPicker = false">
        <div class="sticky-picker-modal">
          <h3 class="sticky-picker-title">Add to Momentum Sticky</h3>
          <p v-if="stickyPickerPendingItems.length > 0" class="sticky-picker-hint">
            Adding {{ stickyPickerPendingItems.length }} item(s)
          </p>
          <div class="sticky-picker-list">
            <button
              v-for="s in momentumStore.stickies"
              :key="s.id"
              type="button"
              class="sticky-picker-item"
              @click="addSelectedToSticky(s.id)"
            >
              {{ s.title || 'Untitled' }}
            </button>
            <button
              type="button"
              class="sticky-picker-item sticky-picker-new"
              @click="addSelectedToSticky(null)"
            >
              + New sticky
            </button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="showStickyPicker = false">
            Cancel
          </button>
        </div>
      </div>
    </Teleport>
    <NotesCompleteCelebration
      :show="showNotesCompleteCelebration"
      @dismiss="showNotesCompleteCelebration = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useNotificationStore } from '../../store/notifications';
import { useMomentumStickiesStore } from '../../store/momentumStickies';
import UnifiedChecklistTab from './UnifiedChecklistTab.vue';
import MomentumChatPanel from '../momentum/MomentumChatPanel.vue';
import NotesToSignSection from './NotesToSignSection.vue';
import SharedListsView from './SharedListsView.vue';
import NotesCompleteCelebration from './NotesCompleteCelebration.vue';

const props = defineProps({
  programId: { type: Number, default: null },
  agencyId: { type: Number, default: null },
  kudosEnabled: { type: Boolean, default: false }
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
const clinicalNotesEligible = ref(false);

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
      items.push({ label: `You had ${twoOld.totalNotes} unpaid notes when payroll ran (2 periods ago) - you're behind`, source: 'payroll', priority: 1 });
    }
    if (Number(unpaid.totalNotes) > 0) {
      items.push({ label: `You had ${unpaid.totalNotes} unpaid notes when payroll ran - you're behind`, source: 'payroll', priority: 2 });
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
      label: `You had ${payrollNotesCount.value} unpaid notes when payroll ran - you're behind. Did you do your notes today?`,
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
    notesToSignCount.value > 0 ||
    checklistIncompleteCount.value > 0 ||
    undoneStickyEntries.value.length > 0
);

const fullListItems = computed(() => {
  const seen = new Set();
  const out = [];
  const add = (item) => {
    const label = typeof item === 'string' ? item : (item?.label || item?.title || '');
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(typeof item === 'object' ? item : { label, source: 'other' });
    }
  };
  for (const i of topFocusItems.value || []) add(i);
  for (const i of alsoOnRadar.value || []) add(i);
  const payroll = payrollNotesItems.value || [];
  for (const i of payroll) add(i);
  if (notesToSignCount.value > 0) add({ label: `Sign supervisee notes (${notesToSignCount.value} pending)`, source: 'notes-to-sign' });
  for (const i of checklistIncompleteItems.value || []) add({ label: i.title || i.label, source: 'checklist' });
  for (const i of undoneStickyEntries.value || []) add(i);
  for (const t of tasks.value || []) {
    if (t.status !== 'completed') {
      add({
        label: t.title || t.task,
        source: 'task',
        urgency: t.urgency,
        due_date: t.due_date,
        task_list_name: t.task_list_name,
        task_type: t.task_type
      });
    }
  }
  for (const tk of tickets.value || []) {
    if (String(tk.status || '').toLowerCase() === 'open') {
      add({
        label: tk.subject || tk.question?.slice(0, 80) || 'Support ticket',
        source: 'ticket'
      });
    }
  }
  if (notificationCount.value > 0) add({ label: `Action required: ${notificationCount.value} notification(s)`, source: 'notification' });
  return out;
});

const fullListExpanded = ref(false);
const showNotesCompleteCelebration = ref(false);
const momentumStore = useMomentumStickiesStore();
const selectedFullListIndices = ref(new Set());
const showStickyPicker = ref(false);
const stickyPickerMode = ref('single');
const stickyPickerPendingItems = ref([]);

const selectedFullListCount = computed(() => selectedFullListIndices.value.size);

const formatFullListCategory = (item) => {
  if (!item) return '—';
  if (item.task_type) {
    const t = String(item.task_type);
    if (t === 'training') return 'Training';
    if (t === 'document') return 'Document';
    if (t === 'custom') return 'Custom';
    return t;
  }
  const src = item.source || '';
  if (src === 'checklist') return 'Checklist';
  if (src === 'ticket') return 'Ticket';
  if (src === 'payroll') return 'Payroll';
  if (src === 'notes-to-sign') return 'Notes';
  if (src === 'sticky') return 'Sticky';
  if (src === 'notification') return 'Notification';
  if (src === 'gemini') return 'Focus';
  return src || '—';
};

const formatFullListDue = (item) => {
  if (!item?.due_date) return '—';
  try {
    const d = new Date(item.due_date);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return '—';
  }
};

const toggleFullListSelection = (index) => {
  const next = new Set(selectedFullListIndices.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  selectedFullListIndices.value = next;
};

const openAddSelectedToSticky = async () => {
  const items = fullListItems.value
    .filter((_, i) => selectedFullListIndices.value.has(i))
    .map((item) => (typeof item === 'object' ? item.label : item));
  if (items.length === 0) return;
  stickyPickerMode.value = 'multiple';
  stickyPickerPendingItems.value = items;
  showStickyPicker.value = true;
  try {
    const { data } = await api.get(`/users/${userId.value}/momentum-stickies`);
    momentumStore.setStickies(data || []);
  } catch {
    momentumStore.setStickies([]);
  }
};

const addSelectedToSticky = (stickyId) => {
  if (stickyPickerMode.value === 'multiple' && stickyPickerPendingItems.value.length > 0) {
    momentumStore.triggerAddMultipleToSticky(stickyPickerPendingItems.value, stickyId);
    selectedFullListIndices.value = new Set();
  }
  showStickyPicker.value = false;
  stickyPickerPendingItems.value = [];
  fetchDigest();
};

const fullListRoute = computed(() => {
  const slug = route.params?.organizationSlug;
  const base = slug ? `/${slug}/dashboard` : '/dashboard';
  return `${base}?tab=checklist&section=full-list`;
});

const notesToSignRoute = computed(() => {
  const slug = route.params?.organizationSlug;
  const base = slug ? `/${slug}/dashboard` : '/dashboard';
  return `${base}?tab=checklist&section=notes-to-sign`;
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

    if (props.agencyId) {
      try {
        const eligRes = await api.get('/me/clinical-notes-eligible', { params: { agencyId: props.agencyId } });
        clinicalNotesEligible.value = !!eligRes?.data?.eligible;
      } catch {
        clinicalNotesEligible.value = false;
      }
    } else {
      clinicalNotesEligible.value = false;
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

    if (props.agencyId && props.kudosEnabled && payrollNotesCount.value === 0) {
      try {
        const notesCompleteRes = await api.post('/kudos/notes-complete', { agencyId: props.agencyId });
        if (notesCompleteRes?.data?.awarded) {
          showNotesCompleteCelebration.value = true;
        }
      } catch {
        // Ignore; user may not qualify
      }
    }
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

watch(
  () => route.query?.section,
  (section) => {
    if (String(section || '').toLowerCase() === 'full-list') {
      fullListExpanded.value = true;
    }
  },
  { immediate: true }
);

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

.quick-link-card-full {
  cursor: pointer;
  border: 1px solid var(--border, #e5e7eb);
  font: inherit;
  text-align: left;
}

.full-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.full-list-header .section-title {
  margin: 0;
}

.add-selected-btn {
  flex-shrink: 0;
}

.full-list-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: default;
}

.full-list-checkbox {
  flex-shrink: 0;
  margin: 0;
}

.full-list-item-text {
  flex: 1;
}

.sticky-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sticky-picker-modal {
  background: white;
  border-radius: 12px;
  padding: 20px;
  min-width: 260px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.sticky-picker-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
}

.sticky-picker-hint {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #6b7280;
}

.sticky-picker-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
  max-height: 240px;
  overflow-y: auto;
}

.sticky-picker-item {
  padding: 10px 14px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: white;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.sticky-picker-item:hover {
  background: rgba(254, 249, 195, 0.5);
}

.sticky-picker-new {
  border-style: dashed;
  color: #6b7280;
}

.momentum-full-list-section {
  margin-top: 16px;
  padding: 16px;
  background: #f9fafb;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
}

.momentum-full-list-section .section-title {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.muted {
  color: #9ca3af;
}

.full-list-table-wrap {
  max-height: 400px;
  overflow: auto;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  background: white;
}

.full-list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.full-list-table th {
  text-align: left;
  padding: 10px 12px;
  font-weight: 600;
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: #f3f4f6;
  border-bottom: 1px solid var(--border, #e5e7eb);
}

.full-list-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  color: #1a1a1a;
  vertical-align: middle;
}

.full-list-table tbody tr:last-child td {
  border-bottom: none;
}

.full-list-table tbody tr:hover {
  background: rgba(254, 249, 195, 0.3);
}

.col-check {
  width: 40px;
}

.col-urgency {
  width: 90px;
}

.col-category {
  width: 100px;
}

.col-project {
  width: 120px;
}

.col-due {
  width: 90px;
}

.urgency-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
}

.urgency-high {
  background: #fef2f2;
  color: #b91c1c;
}

.urgency-medium {
  background: #fef9c3;
  color: #854d0e;
}

.urgency-low {
  background: #f0fdf4;
  color: #166534;
}
</style>
