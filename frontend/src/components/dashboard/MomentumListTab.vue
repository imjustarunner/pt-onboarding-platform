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
          <h3>Top focus</h3>
          <ol class="focus-list">
            <li
              v-for="(item, i) in topFocusItems"
              :key="`focus-${i}`"
              class="focus-item"
              data-add-to-sticky
            >
              <span class="focus-item-label">{{ item.label }}</span>
              <div class="focus-item-actions">
                <router-link
                  v-if="item.source === 'payroll' || item.source === 'notes-to-sign'"
                  :to="item.source === 'payroll' ? fullListRoute : notesToSignRoute"
                  class="btn btn-secondary btn-xs"
                >
                  Complete →
                </router-link>
                <button
                  v-else-if="canActOnDigestItem(item)"
                  type="button"
                  class="btn btn-secondary btn-xs"
                  :disabled="digestActingIndex === i"
                  @click="actOnDigestItem(item, 'top', i)"
                >
                  {{ digestActingIndex === i ? '…' : 'Done' }}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  title="Snooze for this session"
                  @click="snoozeDigestItem(item.label)"
                >
                  Snooze
                </button>
              </div>
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
              <span class="radar-item-label">{{ item.label }}</span>
              <div class="radar-item-actions">
                <router-link
                  v-if="item.source === 'payroll' || item.source === 'notes-to-sign'"
                  :to="item.source === 'payroll' ? fullListRoute : notesToSignRoute"
                  class="btn btn-secondary btn-xs"
                >
                  Complete →
                </router-link>
                <button
                  v-else-if="canActOnDigestItem(item)"
                  type="button"
                  class="btn btn-secondary btn-xs"
                  :disabled="digestActingRadarIndex === i"
                  @click="actOnDigestItem(item, 'radar', i)"
                >
                  {{ digestActingRadarIndex === i ? '…' : 'Done' }}
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  title="Snooze for this session"
                  @click="snoozeDigestItem(item.label)"
                >
                  Snooze
                </button>
              </div>
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
        <span v-if="!sharedListsExpanded && sharedListsSummary" class="shared-lists-summary">
          {{ sharedListsSummary.listCount }} list{{ sharedListsSummary.listCount !== 1 ? 's' : '' }},
          {{ sharedListsSummary.totalTasks }} task{{ sharedListsSummary.totalTasks !== 1 ? 's' : '' }}
          <span v-if="sharedListsSummary.hasRecentActivity" class="shared-lists-activity" title="Activity in last 24h">●</span>
        </span>
        <span class="shared-lists-toggle">{{ sharedListsExpanded ? '▼' : '▶' }}</span>
      </div>
      <SharedListsView
        v-show="sharedListsExpanded"
        :agency-id="agencyId"
        @task-changed="fetchDigest"
        @summary="sharedListsSummary = $event"
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
        <input
          v-model="fullListSearchQuery"
          type="search"
          class="full-list-search"
          placeholder="Search…"
          aria-label="Search list"
        />
        <div v-if="selectedFullListCount > 0" class="full-list-actions">
          <button
            v-if="selectedRemovableCount > 0"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="removeSelectedItems"
          >
            Remove {{ selectedRemovableCount }}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm add-selected-btn"
            @click="openAddSelectedToSticky"
          >
            Add {{ selectedFullListCount }} to sticky
          </button>
        </div>
      </div>
      <div class="full-list-table-wrap">
        <table class="full-list-table" aria-label="Full running list">
          <thead>
            <tr>
              <th class="col-check"><span class="sr-only">Select</span></th>
              <th class="col-item sortable" :class="{ sorted: fullListSortBy === 'label' }" @click="setFullListSort('label')">
                Item <span v-if="fullListSortBy === 'label'" class="sort-icon">{{ fullListSortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th class="col-urgency sortable" :class="{ sorted: fullListSortBy === 'urgency' }" @click="setFullListSort('urgency')">
                Urgency <span v-if="fullListSortBy === 'urgency'" class="sort-icon">{{ fullListSortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th class="col-category sortable" :class="{ sorted: fullListSortBy === 'category' }" @click="setFullListSort('category')">
                Category <span v-if="fullListSortBy === 'category'" class="sort-icon">{{ fullListSortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th class="col-project sortable" :class="{ sorted: fullListSortBy === 'project' }" @click="setFullListSort('project')">
                Project <span v-if="fullListSortBy === 'project'" class="sort-icon">{{ fullListSortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th class="col-due sortable" :class="{ sorted: fullListSortBy === 'due' }" @click="setFullListSort('due')">
                Due <span v-if="fullListSortBy === 'due'" class="sort-icon">{{ fullListSortDir === 'asc' ? '▲' : '▼' }}</span>
              </th>
              <th class="col-actions"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="fullListDisplayItems.length === 0" class="full-list-empty-row">
              <td colspan="7" class="muted">No items match your search.</td>
            </tr>
            <tr
              v-for="(row, di) in fullListDisplayItems"
              :key="`full-${row.originalIndex}`"
              class="full-list-row"
              :data-add-to-sticky="(typeof row.item === 'object' ? row.item.label : row.item) || ''"
            >
              <td class="col-check">
                <label class="full-list-item-row">
                  <input
                    type="checkbox"
                    class="full-list-checkbox"
                    :checked="selectedFullListIndices.has(row.originalIndex)"
                    @change="toggleFullListSelection(row.originalIndex)"
                  />
                </label>
              </td>
              <td class="col-item">
                <span
                  v-if="editingFullListIndex !== row.originalIndex"
                  class="full-list-item-text"
                  :class="{ 'editable': canEditFullListItem(row.item) }"
                  @dblclick="canEditFullListItem(row.item) && startEditFullListItem(row.originalIndex)"
                >
                  {{ typeof row.item === 'object' ? row.item.label : row.item }}
                </span>
                <input
                  v-else
                  ref="fullListEditInputRef"
                  type="text"
                  class="full-list-edit-input"
                  :value="getFullListEditValue(row.item)"
                  @blur="finishEditFullListItem"
                  @keydown.enter="finishEditFullListItem"
                  @keydown.escape="cancelEditFullListItem"
                />
              </td>
              <td class="col-urgency">
                <span v-if="row.item.urgency" class="urgency-badge" :class="`urgency-${row.item.urgency}`">{{ row.item.urgency }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="col-category">{{ formatFullListCategory(row.item) }}</td>
              <td class="col-project">{{ row.item.task_list_name || '—' }}</td>
              <td class="col-due">{{ formatFullListDue(row.item) }}</td>
              <td class="col-actions">
                <button
                  v-if="canEditFullListItem(row.item)"
                  type="button"
                  class="btn-icon btn-edit"
                  aria-label="Edit"
                  @click="startEditFullListItem(row.originalIndex)"
                >
                  ✎
                </button>
              </td>
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
import { ref, computed, onMounted, watch, nextTick } from 'vue';
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
const sharedListsSummary = ref(null);
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
const DIGEST_SNOOZED_KEY = 'momentum_digest_snoozed';
const digestSnoozedLabels = ref(new Set(JSON.parse(sessionStorage.getItem(DIGEST_SNOOZED_KEY) || '[]')));
const digestActingIndex = ref(null);
const digestActingRadarIndex = ref(null);

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

const topFocusItemsRaw = computed(() => {
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
    for (let i = 0; items.length < 5 && i < payroll.length; i++) {
      items.push({ label: payroll[i].label, source: 'payroll' });
    }
  }
  const checklist = checklistIncompleteItems.value || [];
  const undone = undoneStickyEntries.value || [];
  const t = tasks.value || [];
  const tk = tickets.value || [];

  for (let i = 0; items.length < 5 && i < checklist.length; i++) {
    const c = checklist[i];
    items.push({ ...c, label: c.title || c.label, source: 'checklist' });
  }
  for (let i = 0; items.length < 5 && i < undone.length; i++) {
    items.push(undone[i]);
  }
  for (let i = 0; items.length < 5 && i < t.length; i++) {
    if (t[i].status !== 'completed') {
      const baseLabel = t[i].title || t[i].task;
      const label = t[i].target_count != null ? `${baseLabel} (${t[i].target_count})` : baseLabel;
      items.push({ label, source: 'task', task_id: t[i].id, task_type: t[i].task_type });
    }
  }
  for (let i = 0; items.length < 5 && i < tk.length; i++) {
    if (String(tk[i].status || '').toLowerCase() === 'open') {
      items.push({ label: tk[i].subject || tk[i].question?.slice(0, 50) || 'Support ticket', source: 'ticket' });
    }
  }
  return items.slice(0, 5);
});

const alsoOnRadarRaw = computed(() => {
  const items = [];
  const payroll = payrollNotesItems.value || [];
  const checklist = checklistIncompleteItems.value || [];
  const undone = undoneStickyEntries.value || [];
  const t = tasks.value || [];
  const tk = tickets.value || [];

  const topLabels = new Set(topFocusItemsRaw.value.map((f) => f.label));
  if (notesToSignCount.value > 0 && !topLabels.has(`Sign supervisee notes (${notesToSignCount.value} pending)`)) {
    items.push({ label: `Sign supervisee notes (${notesToSignCount.value} pending)`, source: 'notes-to-sign' });
  }
  for (let i = 0; items.length < 8 && i < payroll.length; i++) {
    if (!topLabels.has(payroll[i].label)) items.push({ label: payroll[i].label, source: 'payroll' });
  }
  let used = 0;
  for (let i = 0; items.length < 8 && used < checklist.length; i++) {
    const c = checklist[used];
    const lbl = c?.title || c?.label;
    if (!topLabels.has(lbl)) items.push({ ...c, label: lbl, source: 'checklist' });
    used++;
  }
  for (let i = 0; items.length < 8 && i < undone.length; i++) {
    if (!topLabels.has(undone[i].label)) items.push(undone[i]);
  }
  for (let i = 0; items.length < 8 && i < t.length; i++) {
    if (t[i].status !== 'completed') {
      const lbl = (t[i].target_count != null ? `${t[i].title || t[i].task} (${t[i].target_count})` : t[i].title || t[i].task);
      if (!topLabels.has(lbl)) items.push({ label: lbl, source: 'task', task_id: t[i].id, task_type: t[i].task_type });
    }
  }
  for (let i = 0; items.length < 8 && i < tk.length; i++) {
    if (String(tk[i].status || '').toLowerCase() === 'open') {
      const lbl = tk[i].subject || tk[i].question?.slice(0, 50) || 'Support ticket';
      if (!topLabels.has(lbl)) items.push({ label: lbl, source: 'ticket' });
    }
  }
  return items.slice(0, 8);
});

const topFocusItems = computed(() => {
  const snoozed = digestSnoozedLabels.value;
  return topFocusItemsRaw.value.filter((item) => !snoozed.has(item.label));
});

const alsoOnRadar = computed(() => {
  const snoozed = digestSnoozedLabels.value;
  return alsoOnRadarRaw.value.filter((item) => !snoozed.has(item.label));
});

const canActOnDigestItem = (item) => {
  if (!item) return false;
  if (item.source === 'task' && item.task_id && item.task_type === 'custom') return true;
  if (item.source === 'checklist' && item.checklist_item_id && item.type === 'custom') return true;
  if (item.source === 'sticky' && item.entry_id && item.sticky_id) return true;
  return false;
};

const actOnDigestItem = async (item, type, index) => {
  if (!canActOnDigestItem(item)) return;
  if (type === 'top') digestActingIndex.value = index;
  else digestActingRadarIndex.value = index;
  try {
    if (item.source === 'task') {
      await api.delete(`/me/tasks/${item.task_id}`, { skipGlobalLoading: true });
    } else if (item.source === 'checklist') {
      await api.post(`/users/${userId.value}/custom-checklist/${item.checklist_item_id}/complete`, {}, { skipGlobalLoading: true });
    } else if (item.source === 'sticky') {
      await api.patch(
        `/users/${userId.value}/momentum-stickies/${item.sticky_id}/entries/${item.entry_id}`,
        { is_checked: true },
        { skipGlobalLoading: true }
      );
    }
    await fetchDigest();
  } catch (err) {
    console.error('Failed to complete digest item:', err);
  } finally {
    digestActingIndex.value = null;
    digestActingRadarIndex.value = null;
  }
};

const snoozeDigestItem = (label) => {
  const next = new Set(digestSnoozedLabels.value);
  next.add(label);
  digestSnoozedLabels.value = next;
  sessionStorage.setItem(DIGEST_SNOOZED_KEY, JSON.stringify([...next]));
};

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
  for (const i of checklistIncompleteItems.value || []) add({ ...i, label: i.title || i.label, source: 'checklist' });
  for (const i of undoneStickyEntries.value || []) add(i);
  for (const t of tasks.value || []) {
    if (t.status !== 'completed') {
      const baseLabel = t.title || t.task;
      const label =
        t.target_count != null ? `${baseLabel} (${t.target_count})` : baseLabel;
      add({
        label,
        source: 'task',
        task_id: t.id,
        urgency: t.urgency,
        due_date: t.due_date,
        task_list_name: t.task_list_name,
        task_type: t.task_type,
        target_count: t.target_count
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
const fullListSearchQuery = ref('');
const fullListSortBy = ref('label');
const fullListSortDir = ref('asc');
const editingFullListIndex = ref(null);
const fullListEditInputRef = ref(null);
const showNotesCompleteCelebration = ref(false);
const momentumStore = useMomentumStickiesStore();
const selectedFullListIndices = ref(new Set());
const showStickyPicker = ref(false);
const stickyPickerMode = ref('single');
const stickyPickerPendingItems = ref([]);

const fullListDisplayItems = computed(() => {
  const items = fullListItems.value;
  const q = String(fullListSearchQuery.value || '').toLowerCase().trim();
  let filtered = items.map((item, i) => ({ item, originalIndex: i }));
  if (q) {
    filtered = filtered.filter(({ item }) => {
      const label = typeof item === 'object' ? (item.label || item.title || '') : String(item);
      return label.toLowerCase().includes(q);
    });
  }
  const by = fullListSortBy.value;
  const dir = fullListSortDir.value === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    const itemA = a.item;
    const itemB = b.item;
    let cmp = 0;
    if (by === 'label') {
      const la = typeof itemA === 'object' ? (itemA.label || itemA.title || '') : String(itemA);
      const lb = typeof itemB === 'object' ? (itemB.label || itemB.title || '') : String(itemB);
      cmp = la.localeCompare(lb);
    } else if (by === 'urgency') {
      const ua = (itemA.urgency || '').toLowerCase();
      const ub = (itemB.urgency || '').toLowerCase();
      const order = { high: 3, medium: 2, low: 1 };
      cmp = (order[ua] || 0) - (order[ub] || 0);
    } else if (by === 'category') {
      const ca = formatFullListCategory(itemA);
      const cb = formatFullListCategory(itemB);
      cmp = ca.localeCompare(cb);
    } else if (by === 'project') {
      const pa = itemA.task_list_name || '—';
      const pb = itemB.task_list_name || '—';
      cmp = pa.localeCompare(pb);
    } else if (by === 'due') {
      const da = itemA.due_date ? new Date(itemA.due_date).getTime() : 0;
      const db = itemB.due_date ? new Date(itemB.due_date).getTime() : 0;
      cmp = da - db;
    }
    return cmp * dir;
  });
  return filtered;
});

const setFullListSort = (by) => {
  if (fullListSortBy.value === by) {
    fullListSortDir.value = fullListSortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    fullListSortBy.value = by;
    fullListSortDir.value = 'asc';
  }
};

const canEditFullListItem = (item) => {
  if (!item) return false;
  if (item.source === 'task' && item.task_id && item.task_type === 'custom') return true;
  if (item.source === 'sticky' && item.entry_id && item.sticky_id) return true;
  return false;
};

const getFullListEditValue = (item) => {
  if (!item) return '';
  return typeof item === 'object' ? (item.label || item.title || '') : String(item);
};

const startEditFullListItem = (originalIndex) => {
  editingFullListIndex.value = originalIndex;
  nextTick(() => {
    const el = Array.isArray(fullListEditInputRef.value) ? fullListEditInputRef.value.find(Boolean) : fullListEditInputRef.value;
    el?.focus();
  });
};

const cancelEditFullListItem = () => {
  editingFullListIndex.value = null;
};

const finishEditFullListItem = async () => {
  const idx = editingFullListIndex.value;
  if (idx == null) return;
  const item = fullListItems.value[idx];
  const inputEl = Array.isArray(fullListEditInputRef.value) ? fullListEditInputRef.value.find(Boolean) : fullListEditInputRef.value;
  const newVal = inputEl?.value?.trim();
  editingFullListIndex.value = null;
  if (!newVal || newVal === getFullListEditValue(item)) return;
  try {
    if (item.source === 'task') {
      await api.put(`/me/tasks/${item.task_id}`, { title: newVal }, { skipGlobalLoading: true });
    } else if (item.source === 'sticky') {
      await api.patch(
        `/users/${userId.value}/momentum-stickies/${item.sticky_id}/entries/${item.entry_id}`,
        { text: newVal },
        { skipGlobalLoading: true }
      );
    }
    await fetchDigest();
  } catch (err) {
    console.error('Failed to update item:', err);
  }
};

const selectedFullListCount = computed(() => selectedFullListIndices.value.size);

const selectedRemovableCount = computed(() => {
  let n = 0;
  for (const i of selectedFullListIndices.value) {
    const item = fullListItems.value[i];
    if (!item) continue;
    if (item.source === 'task' && item.task_id && item.task_type === 'custom') n++;
    else if (item.source === 'checklist' && item.checklist_item_id && item.type === 'custom') n++;
    else if (item.source === 'sticky' && item.entry_id && item.sticky_id) n++;
  }
  return n;
});

const removeSelectedItems = async () => {
  const items = fullListItems.value
    .map((item, i) => ({ item, i }))
    .filter(({ i }) => selectedFullListIndices.value.has(i));
  const toRemove = items.filter(({ item }) => {
    if (item.source === 'task' && item.task_id && item.task_type === 'custom') return true;
    if (item.source === 'checklist' && item.checklist_item_id && item.type === 'custom') return true;
    if (item.source === 'sticky' && item.entry_id && item.sticky_id) return true;
    return false;
  });
  if (toRemove.length === 0) return;
  for (const { item } of toRemove) {
    try {
      if (item.source === 'task') {
        await api.delete(`/me/tasks/${item.task_id}`, { skipGlobalLoading: true });
      } else if (item.source === 'checklist') {
        await api.post(`/users/${userId.value}/custom-checklist/${item.checklist_item_id}/complete`, {}, { skipGlobalLoading: true });
      } else if (item.source === 'sticky') {
        await api.patch(
          `/users/${userId.value}/momentum-stickies/${item.sticky_id}/entries/${item.entry_id}`,
          { is_checked: true },
          { skipGlobalLoading: true }
        );
      }
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  }
  selectedFullListIndices.value = new Set();
  await fetchDigest();
  emit('update-count', checklistIncompleteCount.value);
};

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
    const { data } = await api.get(`/users/${userId.value}/momentum-stickies`, { skipGlobalLoading: true });
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
  return slug ? `/${slug}/tickets` : '/tickets';
});

const flattenChecklistIncomplete = (data) => {
  const out = [];
  for (const item of data.trainingItems || []) {
    out.push({ title: item.title, label: item.title, checklist_item_id: item.id, type: item.type });
  }
  for (const item of data.documentItems || []) {
    out.push({ title: item.title, label: item.title, checklist_item_id: item.id, type: item.type });
  }
  for (const item of data.customItems || []) {
    if (!item.is_completed) out.push({ title: item.title, label: item.title, checklist_item_id: item.checklist_item_id, type: 'custom' });
  }
  for (const focus of data.trainingFocusesWithItems || []) {
    for (const mod of focus.modules || []) {
      for (const item of mod.checklistItems || []) {
        if (!item.is_completed) out.push({ title: item.title, label: item.title, checklist_item_id: item.checklist_item_id, type: item.type });
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
        if (text) out.push({ label: text.length > 60 ? `${text.slice(0, 57)}...` : text, source: 'sticky', entry_id: entry.id, sticky_id: sticky.id });
      }
    }
  }
  return out;
};

/** Consolidated undone sticky items for display - avoid listing every note as a separate line */
const consolidatedUndoneStickyItems = computed(() => {
  const undone = undoneStickyEntries.value || [];
  if (undone.length === 0) return [];
  if (undone.length === 1) return undone;
  const hasClinicalNoteContext = undone.some(
    (e) => /clinical|note|sign|document/i.test(String(e?.label || ''))
  );
  const label = hasClinicalNoteContext
    ? `Catch up on clinical notes (${undone.length})`
    : `Undone notes (${undone.length})`;
  return [{ label, source: 'sticky', count: undone.length }];
});

const fetchDigest = async () => {
  if (!userId.value) return;
  digestLoading.value = true;
  try {
    const fetches = [
      api.get(`/users/${userId.value}/unified-checklist`, {
        params: { programId: props.programId || undefined, agencyId: props.agencyId || undefined },
        skipGlobalLoading: true
      }).catch(() => ({ data: {} })),
      api.get('/tasks', { skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get('/support-tickets/mine', { skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get(`/users/${userId.value}/momentum-stickies`, { skipGlobalLoading: true }).catch(() => ({ data: [] })),
      api.get('/me/notes-to-sign/count', { skipGlobalLoading: true }).catch(() => ({ data: { count: 0 } }))
    ];
    if (props.agencyId) {
      fetches.push(
        api.get('/payroll/me/dashboard-summary', { params: { agencyId: props.agencyId }, skipGlobalLoading: true }).catch(() => ({ data: null }))
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
        const eligRes = await api.get('/me/clinical-notes-eligible', { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
        clinicalNotesEligible.value = !!eligRes?.data?.eligible;
      } catch {
        clinicalNotesEligible.value = false;
      }
    } else {
      clinicalNotesEligible.value = false;
    }

    await notificationStore.fetchCounts?.();

    geminiDigest.value = null;
    notificationCount.value = Number(notificationStore.unreadCount || 0);

    if (props.agencyId && props.kudosEnabled && payrollNotesCount.value === 0) {
      try {
        const notesCompleteRes = await api.post('/kudos/notes-complete', { agencyId: props.agencyId }, { skipGlobalLoading: true });
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
    const res = await api.get('/me/notes-to-sign/count', { skipGlobalLoading: true });
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
  margin-bottom: 8px;
  font-size: 14px;
  color: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.focus-item-label,
.radar-item-label {
  flex: 1;
  min-width: 0;
}

.focus-item-actions,
.radar-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.focus-item-actions .btn-ghost,
.radar-item-actions .btn-ghost {
  background: none;
  border: none;
  color: rgba(0, 0, 0, 0.5);
  font-size: 12px;
}

.focus-item-actions .btn-ghost:hover,
.radar-item-actions .btn-ghost:hover {
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

.shared-lists-summary {
  flex: 1;
  margin: 0 8px;
  font-size: 13px;
  color: #6b7280;
  font-weight: 400;
}

.shared-lists-activity {
  color: var(--success, #22c55e);
  margin-left: 4px;
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
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.full-list-search {
  flex: 1;
  min-width: 140px;
  max-width: 220px;
  padding: 6px 10px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  font-size: 14px;
}

.full-list-search:focus {
  outline: none;
  border-color: var(--primary, #3b82f6);
}

.full-list-header .section-title {
  margin: 0;
}

.full-list-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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

.full-list-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.full-list-table th.sortable:hover {
  background: #f3f4f6;
}

.full-list-table th.sorted {
  font-weight: 700;
}

.sort-icon {
  font-size: 10px;
  margin-left: 2px;
  opacity: 0.8;
}

.full-list-item-text.editable {
  cursor: text;
}

.full-list-item-text.editable:hover {
  text-decoration: underline;
}

.full-list-edit-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid var(--primary, #3b82f6);
  border-radius: 4px;
  font-size: 14px;
}

.full-list-edit-input:focus {
  outline: none;
}

.col-actions {
  width: 44px;
}

.btn-edit {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  color: #6b7280;
  padding: 2px 6px;
}

.btn-edit:hover {
  color: var(--primary, #3b82f6);
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

.full-list-empty-row td {
  padding: 24px;
  text-align: center;
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
