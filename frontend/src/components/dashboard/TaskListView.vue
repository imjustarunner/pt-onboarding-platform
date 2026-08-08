<template>
  <div class="task-list-view-overlay" @click.self="$emit('close')">
    <div class="task-list-view-modal" ref="printAreaRef">

      <!-- Header -->
      <div class="tlv-header">
        <div class="tlv-header__left">
          <h3 class="tlv-title">{{ list?.name }}</h3>
          <div class="tlv-meta">
            <span class="tlv-member-count">{{ members.length }} member{{ members.length !== 1 ? 's' : '' }}</span>
            <span class="tlv-sep">·</span>
            <span class="tlv-task-count">{{ tasks.length }} task{{ tasks.length !== 1 ? 's' : '' }}</span>
          </div>
        </div>
        <div class="tlv-header__right">
          <button
            type="button"
            class="btn-icon-pill"
            :class="{ active: showMembers }"
            title="Manage members"
            @click="showMembers = !showMembers"
          >
            👥 Members
          </button>
          <div class="more-menu-wrap" ref="listMenuRef">
            <button type="button" class="btn-icon" aria-label="List options" @click="listMenuOpen = !listMenuOpen">⋮</button>
            <div v-if="listMenuOpen" class="more-menu" @click.stop>
              <button type="button" class="more-menu-item" @click="printList(); listMenuOpen = false">🖨 Print</button>
              <button type="button" class="more-menu-item" @click="convertListToSticky(); listMenuOpen = false">📌 Convert to sticky</button>
            </div>
          </div>
          <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')">×</button>
        </div>
      </div>

      <!-- Members Panel -->
      <div v-if="showMembers" class="members-panel">
        <div class="members-panel__head">
          <span class="members-panel__title">Team members</span>
        </div>
        <div class="members-chips">
          <div v-for="m in members" :key="m.user_id" class="member-chip">
            <span class="member-chip__avatar" :style="{ background: memberColor(m.user_id) }">
              {{ memberInitials(m) }}
            </span>
            <span class="member-chip__name">{{ memberLabel(m) }}</span>
            <span class="member-chip__role">{{ m.role }}</span>
            <button
              v-if="canRemoveMember(m)"
              type="button"
              class="member-chip__remove"
              :disabled="removingMemberId === m.user_id"
              title="Remove member"
              @click="removeMember(m)"
            >×</button>
          </div>
          <p v-if="!members.length" class="members-empty">No members yet.</p>
        </div>
        <div v-if="canEdit && availableUsers.length > 0" class="add-member-row">
          <select v-model="addMemberUserId" class="form-control form-control-sm">
            <option :value="null">Add member…</option>
            <option v-for="u in availableUsers" :key="u.id" :value="u.id">{{ getUserLabel(u) }}</option>
          </select>
          <select v-model="addMemberRole" class="form-control form-control-sm" style="max-width:100px">
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!addMemberUserId || addingMember"
            @click="addMember"
          >{{ addingMember ? '…' : 'Add' }}</button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="task-list-tabs">
        <button type="button" class="tab-btn" :class="{ active: taskTab === 'active' }" @click="taskTab = 'active'">Active</button>
        <button type="button" class="tab-btn" :class="{ active: taskTab === 'done' }" @click="taskTab = 'done'">Done</button>
      </div>

      <!-- Add Task Form -->
      <div v-if="canEdit && taskTab === 'active'" class="add-task-form">
        <div class="add-task-input-row">
          <input
            v-model="newTaskTitle"
            type="text"
            class="form-control"
            placeholder="Add a task…"
            @keydown.enter="addTask"
          />
          <button
            v-if="speechSupported"
            type="button"
            class="btn-mic"
            :class="{ 'btn-mic-active': speechListening }"
            :title="speechListening ? 'Stop recording' : 'Record voice'"
            @click="toggleSpeech"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
        </div>
        <div class="add-task-fields">
          <select v-model="newTaskAssignee" class="form-control form-control-sm">
            <option :value="currentUserId">Me</option>
            <option :value="null">No one</option>
            <option v-for="m in members" :key="m.user_id" :value="m.user_id">
              {{ memberLabel(m) }}
            </option>
          </select>
          <select v-model="newTaskUrgency" class="form-control form-control-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input v-model="newTaskDueDate" type="date" class="form-control form-control-sm" />
          <div class="target-count-field" title="Target count (optional)">
            <label class="target-count-label">#</label>
            <input
              v-model.number="newTaskTargetCount"
              type="number"
              class="form-control form-control-sm target-count-input"
              min="0"
              placeholder="—"
            />
          </div>
        </div>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!newTaskTitle.trim() || adding"
          @click="addTask"
        >{{ adding ? '…' : 'Add task' }}</button>
        <p v-if="addTaskError" class="add-task-error">{{ addTaskError }}</p>
      </div>

      <!-- Task List -->
      <div v-if="loading" class="task-list-loading">Loading tasks…</div>
      <ul v-else class="task-list-items">
        <li
          v-for="task in tasks"
          :key="task.id"
          class="task-item"
          :class="{
            'task-done': taskTab === 'done',
            'task-just-done': justDoneId === task.id,
            'task-reminder': isReminder(task),
            'task-waiting': task.status === 'waiting',
          }"
          :style="{ borderLeftColor: urgencyColor(task.urgency) }"
        >
          <div class="task-item-body">
            <div class="task-item-main">
              <span class="task-title" :class="{ 'task-title--waiting': task.status === 'waiting' }">
                {{ task.title }}
                <span v-if="task.status === 'waiting'" class="waiting-badge">Waiting</span>
              </span>
              <div class="task-item-badges">
                <span v-if="task.target_count != null && taskTab === 'active'" class="task-target-count-wrap">
                  <button type="button" class="target-count-btn" :disabled="!canEdit || updatingTargetCountId === task.id" aria-label="Decrease" @click="adjustTargetCount(task, -1)">▼</button>
                  <span class="task-target-count">{{ task.target_count }}</span>
                  <button type="button" class="target-count-btn" :disabled="!canEdit || updatingTargetCountId === task.id" aria-label="Increase" @click="adjustTargetCount(task, 1)">▲</button>
                </span>
                <span v-if="task.urgency" class="urgency-dot" :style="{ background: urgencyColor(task.urgency) }" :title="task.urgency"></span>
                <span v-if="task.due_date" class="task-due" :class="{ 'task-due--overdue': isOverdue(task.due_date) }">{{ formatDue(task.due_date) }}</span>
                <span v-if="task.is_recurring" class="task-recurring" title="Recurring">↻</span>
              </div>
            </div>

            <!-- Assignee Row -->
            <div class="task-assignee-row">
              <template v-if="reassigningTaskId === task.id">
                <select
                  class="form-control form-control-sm reassign-select"
                  :value="task.assigned_to_user_id"
                  @change="reassignTask(task, $event.target.value)"
                >
                  <option :value="null">Unassigned</option>
                  <option v-for="m in members" :key="m.user_id" :value="m.user_id">{{ memberLabel(m) }}</option>
                </select>
                <button type="button" class="btn-icon btn-sm" @click="reassigningTaskId = null" title="Cancel">✕</button>
              </template>
              <template v-else>
                <span
                  v-if="task.assigned_to_user_id"
                  class="assignee-chip"
                  :style="{ background: memberColor(task.assigned_to_user_id) + '22', color: memberColor(task.assigned_to_user_id) }"
                >
                  <span class="assignee-chip__avatar" :style="{ background: memberColor(task.assigned_to_user_id) }">
                    {{ memberInitialsById(task.assigned_to_user_id) }}
                  </span>
                  {{ taskAssignee(task) }}
                </span>
                <span v-else-if="taskTab === 'active'" class="task-unassigned">Unassigned</span>
                <span v-if="task.completed_at && taskTab === 'done'" class="task-completed-at">{{ formatCompleted(task.completed_at) }}</span>
              </template>
            </div>
          </div>

          <!-- Actions -->
          <div class="task-item-actions">
            <template v-if="taskTab === 'active'">
              <button
                v-if="!task.assigned_to_user_id"
                type="button"
                class="btn btn-claim btn-sm"
                :disabled="claimingId === task.id"
                @click="claimTask(task)"
              >{{ claimingId === task.id ? '…' : 'Claim' }}</button>
              <button
                v-if="canEdit"
                type="button"
                class="btn btn-done btn-sm"
                :disabled="completingId === task.id"
                @click="completeTask(task)"
              >{{ completingId === task.id ? '…' : 'Done' }}</button>
              <div class="task-more-wrap" ref="el => setTaskMenuRef(task.id, el)">
                <button type="button" class="btn-icon btn-sm" aria-label="More" @click="openTaskMenu(task)">⋮</button>
                <div v-if="taskMenuTaskId === task.id" class="more-menu task-menu" @click.stop>
                  <button type="button" class="more-menu-item" @click="startReassign(task); taskMenuTaskId = null">👤 Reassign</button>
                  <button type="button" class="more-menu-item" @click="openDependencies(task); taskMenuTaskId = null">🔗 Dependencies</button>
                  <button type="button" class="more-menu-item" @click="openComments(task); taskMenuTaskId = null">💬 Comments</button>
                  <button type="button" class="more-menu-item" @click="openAddToMeetingPicker(task); taskMenuTaskId = null">📅 Add to meeting</button>
                  <button type="button" class="more-menu-item" @click="openAttachments(task); taskMenuTaskId = null">📎 Attachments</button>
                  <button v-if="canEdit" type="button" class="more-menu-item" @click="convertToReminder(task); taskMenuTaskId = null">🔔 Convert to reminder</button>
                </div>
              </div>
            </template>
            <template v-else>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="incompletingId === task.id"
                @click="incompleteTask(task)"
              >{{ incompletingId === task.id ? '…' : 'Undone' }}</button>
            </template>
          </div>
        </li>
      </ul>

      <div v-if="!loading && tasks.length === 0" class="task-list-empty">
        {{ taskTab === 'done' ? 'No completed tasks yet.' : 'No tasks yet.' }}
      </div>
    </div>

    <!-- Attachments overlay -->
    <div v-if="attachmentsTask" class="sub-overlay" @click.self="attachmentsTask = null">
      <div class="sub-panel">
        <h4>Attachments: {{ attachmentsTask?.title }}</h4>
        <input ref="attachmentFileRef" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt" class="sr-only" @change="onAttachmentFileChange" />
        <button type="button" class="btn btn-secondary btn-sm" :disabled="uploadingAttachment" @click="attachmentFileRef?.click()">
          {{ uploadingAttachment ? 'Uploading…' : '+ Add file' }}
        </button>
        <ul v-if="taskAttachments.length > 0" class="attachments-list">
          <li v-for="a in taskAttachments" :key="a.id" class="attachment-item">
            <a v-if="isImageAttachment(a)" :href="attachmentUrl(a)" target="_blank" rel="noopener" class="attachment-thumb"><img :src="attachmentUrl(a)" :alt="a.filename" /></a>
            <a v-else :href="attachmentUrl(a)" target="_blank" rel="noopener" class="attachment-link">📄 {{ a.filename }}</a>
            <button type="button" class="attachment-delete" :disabled="deletingAttachmentId === a.id" aria-label="Remove" @click="deleteAttachment(a)">×</button>
          </li>
        </ul>
        <p v-else class="attachments-empty">No attachments yet.</p>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:10px" @click="attachmentsTask = null">Close</button>
      </div>
    </div>

    <!-- Comments overlay -->
    <div v-if="commentsTask" class="sub-overlay" @click.self="commentsTask = null">
      <div class="sub-panel">
        <h4>Comments: {{ commentsTask?.title }}</h4>
        <ul v-if="taskComments.length > 0" class="comments-list">
          <li v-for="c in taskComments" :key="c.id" class="comment-item">
            <span class="comment-author">{{ c.author_name }}</span>
            <span class="comment-time">{{ formatCommentTime(c.created_at) }}</span>
            <p class="comment-body" v-html="formatCommentBody(c.body)"></p>
          </li>
        </ul>
        <p v-else-if="!commentsLoading" class="comments-empty">No comments yet.</p>
        <div v-if="commentsLoading" class="comments-loading">Loading…</div>
        <div class="comment-input-wrap">
          <textarea ref="commentInputRef" v-model="newCommentBody" class="comment-input" placeholder="Add a comment… Type @ to mention someone" rows="2" @input="(e) => onCommentInput(e)" @keydown="onCommentKeydown" />
          <div v-if="mentionOpen" class="mention-dropdown">
            <button v-for="m in mentionFilteredMembers" :key="m.user_id" type="button" class="mention-option" @click="insertMention(m)">{{ memberLabel(m) }}</button>
            <p v-if="mentionFilteredMembers.length === 0" class="mention-empty">No matching members</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" :disabled="!newCommentBody.trim() || postingComment" @click="postComment">{{ postingComment ? '…' : 'Post' }}</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="commentsTask = null">Close</button>
      </div>
    </div>

    <!-- Dependencies overlay -->
    <div v-if="depTask" class="sub-overlay" @click.self="depTask = null">
      <div class="sub-panel">
        <h4>🔗 Dependencies: {{ depTask?.title }}</h4>

        <div class="dep-section">
          <p class="dep-label">Blocked by (must complete first):</p>
          <ul class="dep-list">
            <li v-for="b in depBlockers" :key="b.id" class="dep-item">
              <span class="dep-status-dot" :style="{ background: b.status === 'completed' ? '#10b981' : '#f59e0b' }"></span>
              <span class="dep-title">{{ b.title }}</span>
              <span class="dep-status">{{ b.status }}</span>
              <button type="button" class="dep-remove" :disabled="removingDepId === b.id" @click="removeBlocker(b)">
                {{ removingDepId === b.id ? '…' : '×' }}
              </button>
            </li>
            <li v-if="!depBlockers.length" class="dep-empty">No blockers.</li>
          </ul>
        </div>

        <div class="dep-section">
          <p class="dep-label">Enables (unlocked when this is done):</p>
          <ul class="dep-list">
            <li v-for="d in depDependents" :key="d.task_id" class="dep-item dep-item--dependent">
              <span class="dep-status-dot" :style="{ background: d.status === 'completed' ? '#10b981' : '#94a3b8' }"></span>
              <span class="dep-title">{{ d.title }}</span>
              <span class="dep-status">{{ d.status }}</span>
            </li>
            <li v-if="!depDependents.length" class="dep-empty">Nothing depends on this task yet.</li>
          </ul>
        </div>

        <div v-if="canEdit" class="dep-add-row">
          <p class="dep-label">Add blocker (this task must wait for…):</p>
          <select v-model="addDepTaskId" class="form-control form-control-sm">
            <option :value="null">Pick a task in this list…</option>
            <option v-for="t in otherActiveTasks" :key="t.id" :value="t.id">{{ t.title }}</option>
          </select>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            style="margin-top:8px"
            :disabled="!addDepTaskId || addingDep"
            @click="addBlocker"
          >{{ addingDep ? '…' : 'Add blocker' }}</button>
        </div>

        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:12px" @click="depTask = null">Close</button>
      </div>
    </div>

    <!-- Add to meeting overlay -->
    <div v-if="showAddToMeetingPicker && addToMeetingTask" class="sub-overlay" @click.self="closeAddToMeetingPicker">
      <div class="sub-panel">
        <h4>Add "{{ addToMeetingTask?.title }}" to meeting</h4>
        <div v-if="meetingsLoading" class="muted">Loading meetings…</div>
        <ul v-else-if="upcomingMeetings.length === 0" class="meeting-list"><li class="muted">No upcoming meetings.</li></ul>
        <ul v-else class="meeting-list">
          <li v-for="m in upcomingMeetings" :key="`${m.meeting_type}-${m.meeting_id}`" class="meeting-item" @click="addTaskToMeeting(m)">
            <span class="meeting-title">{{ m.title }}</span>
            <span class="meeting-date">{{ formatMeetingDate(m.start_at) }}</span>
          </li>
        </ul>
        <button type="button" class="btn btn-secondary btn-sm" @click="closeAddToMeetingPicker">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted, nextTick } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useSpeechToText } from '../../composables/useSpeechToText';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  list: { type: Object, required: true }
});

const emit = defineEmits(['close', 'updated']);

const authStore = useAuthStore();
const currentUserId = computed(() => authStore.user?.id);

// ─── Core state ─────────────────────────────────────────────────────────────
const loading = ref(true);
const adding = ref(false);
const addTaskError = ref('');
const completingId = ref(null);
const incompletingId = ref(null);
const claimingId = ref(null);
const justDoneId = ref(null);
const updatingTargetCountId = ref(null);
const listMenuOpen = ref(false);
const taskMenuTaskId = ref(null);
const printAreaRef = ref(null);
const listMenuRef = ref(null);
const taskMenuRefs = {};
const attachmentsTask = ref(null);
const taskAttachments = ref([]);
const uploadingAttachment = ref(false);
const deletingAttachmentId = ref(null);
const attachmentFileRef = ref(null);
const addToMeetingTask = ref(null);
const showAddToMeetingPicker = ref(false);
const upcomingMeetings = ref([]);
const meetingsLoading = ref(false);
const commentsTask = ref(null);
const taskComments = ref([]);
const commentsLoading = ref(false);
const postingComment = ref(false);
const newCommentBody = ref('');
const mentionOpen = ref(false);
const mentionQuery = ref('');
const commentInputRef = ref(null);
const lastCursorPos = ref(0);
const tasks = ref([]);
const members = ref([]);
const taskTab = ref('active');
const newTaskTitle = ref('');
const newTaskUrgency = ref('medium');
const newTaskAssignee = ref(null);
const hasSetAssigneeDefault = ref(false);
const newTaskDueDate = ref('');
const newTaskTargetCount = ref(null);

// ─── Members panel state ─────────────────────────────────────────────────────
const showMembers = ref(false);
const availableUsers = ref([]);
const addMemberUserId = ref(null);
const addMemberRole = ref('viewer');
const addingMember = ref(false);
const removingMemberId = ref(null);

// ─── Reassign state ──────────────────────────────────────────────────────────
const reassigningTaskId = ref(null);

// ─── Dependency state ─────────────────────────────────────────────────────────
const depTask = ref(null);
const depBlockers = ref([]);
const depDependents = ref([]);
const addDepTaskId = ref(null);
const addingDep = ref(false);
const removingDepId = ref(null);

// ─── Speech ─────────────────────────────────────────────────────────────────
const {
  isListening: speechListening,
  isSupported: speechSupported,
  startListening: speechStart,
  stopListening: speechStop
} = useSpeechToText({
  onFinal: (text) => {
    const cur = String(newTaskTitle.value || '').trim();
    newTaskTitle.value = cur ? `${cur} ${text}` : text;
  }
});
const toggleSpeech = () => {
  if (speechListening.value) speechStop();
  else speechStart();
};

// ─── Computed ────────────────────────────────────────────────────────────────
const canEdit = computed(() => {
  const r = props.list?.my_role;
  return r === 'editor' || r === 'admin';
});

const mentionFilteredMembers = computed(() => {
  const q = String(mentionQuery.value || '').toLowerCase().trim();
  const list = members.value || [];
  if (!q) return list;
  return list.filter((m) => memberLabel(m).toLowerCase().includes(q));
});

// ─── Color helpers ────────────────────────────────────────────────────────────
const MEMBER_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f97316', '#6366f1',
];

const memberColorMap = computed(() => {
  const map = {};
  (members.value || []).forEach((m, i) => {
    map[m.user_id] = MEMBER_COLORS[i % MEMBER_COLORS.length];
  });
  return map;
});

const memberColor = (userId) => memberColorMap.value[userId] || '#94a3b8';

const urgencyColor = (urgency) => {
  if (urgency === 'high') return '#ef4444';
  if (urgency === 'low') return '#10b981';
  return '#f59e0b';
};

// ─── Member helpers ───────────────────────────────────────────────────────────
const memberLabel = (m) => {
  const fn = m.first_name || m.user_first_name || '';
  const ln = m.last_name || m.user_last_name || '';
  return [fn, ln].filter(Boolean).join(' ') || `User ${m.user_id}`;
};

const memberInitials = (m) => {
  const fn = m.first_name || m.user_first_name || '';
  const ln = m.last_name || m.user_last_name || '';
  return ((fn[0] || '') + (ln[0] || '')).toUpperCase() || '?';
};

const memberInitialsById = (userId) => {
  const m = (members.value || []).find((x) => Number(x.user_id) === Number(userId));
  return m ? memberInitials(m) : '?';
};

const getUserLabel = (u) => {
  const first = u?.first_name ?? u?.firstName ?? '';
  const last = u?.last_name ?? u?.lastName ?? '';
  const email = u?.email ?? '';
  const name = `${first} ${last}`.trim();
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return `User #${u?.id ?? ''}`.trim();
};

const canRemoveMember = (m) => Number(m.user_id) !== Number(currentUserId.value);

const taskAssignee = (task) => {
  if (!task.assigned_to_user_id) return null;
  const m = (members.value || []).find((x) => Number(x.user_id) === Number(task.assigned_to_user_id));
  return m ? memberLabel(m) : null;
};

const isOverdue = (d) => {
  if (!d) return false;
  return new Date(d) < new Date();
};

const otherActiveTasks = computed(() => {
  if (!depTask.value) return [];
  return (tasks.value || []).filter(
    (t) => t.id !== depTask.value.id && t.status !== 'completed' && t.status !== 'overridden'
  );
});

// ─── Data fetching ────────────────────────────────────────────────────────────
const fetchTasks = async () => {
  if (!props.list?.id) return;
  loading.value = true;
  try {
    const statusParam = taskTab.value === 'done' ? 'completed' : 'open';
    const [tasksRes, listRes] = await Promise.all([
      api.get(`/task-lists/${props.list.id}/tasks`, { params: { status: statusParam }, skipGlobalLoading: true }),
      api.get(`/task-lists/${props.list.id}`, { skipGlobalLoading: true })
    ]);
    tasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    members.value = listRes.data?.members || [];
    if (!hasSetAssigneeDefault.value && canEdit.value) {
      newTaskAssignee.value = currentUserId.value;
      hasSetAssigneeDefault.value = true;
    }
  } catch (err) {
    console.error('Failed to fetch tasks:', err);
    tasks.value = [];
    members.value = [];
  } finally {
    loading.value = false;
  }
};

const fetchAvailableUsers = async () => {
  if (!props.list?.id) return;
  try {
    const res = await api.get(`/task-lists/${props.list.id}/agency-users`, { skipGlobalLoading: true });
    const all = Array.isArray(res.data) ? res.data : [];
    const memberIds = new Set((members.value || []).map((m) => Number(m.user_id)));
    availableUsers.value = all.filter((u) => !memberIds.has(Number(u.id)));
  } catch {
    availableUsers.value = [];
  }
};

// ─── Task actions ─────────────────────────────────────────────────────────────
const addTask = async () => {
  const title = String(newTaskTitle.value || '').trim();
  if (!title || !props.list?.id) return;
  adding.value = true;
  addTaskError.value = '';
  try {
    const payload = {
      title,
      urgency: newTaskUrgency.value || 'medium',
      assigned_to_user_id: newTaskAssignee.value,
      due_date: newTaskDueDate.value || null
    };
    const tc = newTaskTargetCount.value;
    if (tc != null && tc !== '' && !isNaN(Number(tc)) && Number(tc) >= 0) {
      payload.target_count = Number(tc);
    }
    await api.post(`/task-lists/${props.list.id}/tasks`, payload);
    newTaskTitle.value = '';
    newTaskDueDate.value = '';
    newTaskTargetCount.value = null;
    newTaskUrgency.value = 'medium';
    await fetchTasks();
    emit('updated');
  } catch (err) {
    console.error('Failed to add task:', err);
    addTaskError.value = err?.response?.data?.error?.message || 'Could not add task. Please try again.';
  } finally {
    adding.value = false;
  }
};

const completeTask = async (task) => {
  completingId.value = task.id;
  try {
    await api.put(`/tasks/${task.id}/complete`);
    justDoneId.value = task.id;
    setTimeout(() => { justDoneId.value = null; }, 2200);
    await fetchTasks();
    emit('updated');
  } catch (err) {
    console.error('Failed to complete task:', err);
  } finally {
    completingId.value = null;
  }
};

const incompleteTask = async (task) => {
  incompletingId.value = task.id;
  try {
    await api.put(`/tasks/${task.id}/incomplete`);
    await fetchTasks();
    emit('updated');
  } catch (err) {
    console.error('Failed to mark undone:', err);
  } finally {
    incompletingId.value = null;
  }
};

const claimTask = async (task) => {
  claimingId.value = task.id;
  try {
    await api.post(`/me/tasks/${task.id}/claim`);
    const idx = tasks.value.findIndex((t) => t.id === task.id);
    if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], assigned_to_user_id: currentUserId.value };
    emit('updated');
  } catch (err) {
    console.error('Failed to claim task:', err);
  } finally {
    claimingId.value = null;
  }
};

const startReassign = (task) => {
  reassigningTaskId.value = task.id;
};

// ─── Dependency functions ─────────────────────────────────────────────────────
const openDependencies = async (task) => {
  depTask.value = task;
  depBlockers.value = [];
  depDependents.value = [];
  addDepTaskId.value = null;
  try {
    const res = await api.get(`/me/tasks/${task.id}/dependencies`, { skipGlobalLoading: true });
    depBlockers.value = res.data?.blockers || [];
    depDependents.value = res.data?.dependents || [];
  } catch (err) {
    console.error('Failed to load dependencies:', err);
  }
};

const addBlocker = async () => {
  if (!addDepTaskId.value || !depTask.value) return;
  addingDep.value = true;
  try {
    const res = await api.post(`/me/tasks/${depTask.value.id}/dependencies`, {
      dependsOnId: addDepTaskId.value
    }, { skipGlobalLoading: true });
    depBlockers.value = res.data?.blockers || [];
    addDepTaskId.value = null;
    await fetchTasks();
  } catch (err) {
    console.error('Failed to add blocker:', err);
  } finally {
    addingDep.value = false;
  }
};

const removeBlocker = async (blocker) => {
  if (!depTask.value) return;
  removingDepId.value = blocker.id;
  try {
    const res = await api.delete(`/me/tasks/${depTask.value.id}/dependencies/${blocker.id}`, { skipGlobalLoading: true });
    depBlockers.value = res.data?.blockers || [];
    await fetchTasks();
  } catch (err) {
    console.error('Failed to remove blocker:', err);
  } finally {
    removingDepId.value = null;
  }
};

const reassignTask = async (task, newUserId) => {
  const uid = newUserId ? Number(newUserId) : null;
  try {
    await api.put(`/me/tasks/${task.id}`, { assigned_to_user_id: uid });
    const idx = tasks.value.findIndex((t) => t.id === task.id);
    if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], assigned_to_user_id: uid };
    emit('updated');
  } catch (err) {
    console.error('Failed to reassign task:', err);
  } finally {
    reassigningTaskId.value = null;
  }
};

const adjustTargetCount = async (task, delta) => {
  if (!canEdit.value || task.id == null) return;
  const current = task.target_count ?? 0;
  const next = Math.max(0, current + delta);
  if (next === current) return;
  updatingTargetCountId.value = task.id;
  try {
    await api.put(`/me/tasks/${task.id}`, { target_count: next });
    const idx = tasks.value.findIndex((t) => t.id === task.id);
    if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], target_count: next };
    emit('updated');
  } catch (err) {
    console.error('Failed to update target count:', err);
  } finally {
    updatingTargetCountId.value = null;
  }
};

// ─── Member actions ───────────────────────────────────────────────────────────
const addMember = async () => {
  if (!addMemberUserId.value || !props.list?.id) return;
  addingMember.value = true;
  try {
    await api.post(`/task-lists/${props.list.id}/members`, {
      userId: addMemberUserId.value,
      role: addMemberRole.value || 'viewer'
    });
    addMemberUserId.value = null;
    addMemberRole.value = 'viewer';
    await fetchTasks();
    await fetchAvailableUsers();
    emit('updated');
  } catch (err) {
    console.error('Failed to add member:', err);
  } finally {
    addingMember.value = false;
  }
};

const removeMember = async (m) => {
  if (!props.list?.id) return;
  removingMemberId.value = m.user_id;
  try {
    await api.delete(`/task-lists/${props.list.id}/members/${m.user_id}`);
    await fetchTasks();
    await fetchAvailableUsers();
    emit('updated');
  } catch (err) {
    console.error('Failed to remove member:', err);
  } finally {
    removingMemberId.value = null;
  }
};

// ─── Comment actions ──────────────────────────────────────────────────────────
const openComments = async (task) => {
  commentsTask.value = task;
  taskComments.value = [];
  newCommentBody.value = '';
  mentionOpen.value = false;
  mentionQuery.value = '';
  commentsLoading.value = true;
  try {
    const res = await api.get(`/me/tasks/${task.id}/comments`);
    taskComments.value = res.data || [];
  } catch (err) {
    console.error('Failed to fetch comments:', err);
  } finally {
    commentsLoading.value = false;
  }
};

const postComment = async () => {
  const body = newCommentBody.value.trim();
  if (!body || !commentsTask.value) return;
  postingComment.value = true;
  try {
    const res = await api.post(`/me/tasks/${commentsTask.value.id}/comments`, { body });
    taskComments.value = [...taskComments.value, res.data];
    newCommentBody.value = '';
    mentionOpen.value = false;
    emit('updated');
  } catch (err) {
    console.error('Failed to post comment:', err);
  } finally {
    postingComment.value = false;
  }
};

const onCommentInput = (e) => {
  const el = e?.target || commentInputRef.value;
  const text = newCommentBody.value;
  const cursorPos = el?.selectionStart ?? text.length;
  lastCursorPos.value = cursorPos;
  const beforeCursor = text.slice(0, cursorPos);
  const atMatch = beforeCursor.match(/@([^\s@[\]]*)$/);
  if (atMatch) {
    mentionOpen.value = true;
    mentionQuery.value = atMatch[1] || '';
  } else {
    mentionOpen.value = false;
  }
};

const onCommentKeydown = (e) => {
  if (mentionOpen.value && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
    e.preventDefault();
    if (e.key === 'Enter' && mentionFilteredMembers.value.length === 1) {
      insertMention(mentionFilteredMembers.value[0]);
    }
  }
};

const insertMention = (m) => {
  const text = newCommentBody.value;
  const cursorPos = lastCursorPos.value;
  const beforeCursor = text.slice(0, cursorPos);
  const atMatch = beforeCursor.match(/@([^\s@[\]]*)$/);
  const insertText = `@[${memberLabel(m)}](${m.user_id}) `;
  if (atMatch) {
    const start = cursorPos - atMatch[0].length;
    newCommentBody.value = text.slice(0, start) + insertText + text.slice(cursorPos);
    mentionOpen.value = false;
    mentionQuery.value = '';
    nextTick(() => {
      commentInputRef.value?.focus();
      const newPos = start + insertText.length;
      commentInputRef.value?.setSelectionRange(newPos, newPos);
      lastCursorPos.value = newPos;
    });
  }
};

const formatCommentTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
};

const formatCommentBody = (body) => {
  if (!body) return '';
  return String(body)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/@\[([^\]]*)\]\((\d+)\)/g, '<span class="comment-mention">@$1</span>');
};

// ─── Meeting actions ──────────────────────────────────────────────────────────
const openAddToMeetingPicker = async (task) => {
  addToMeetingTask.value = task;
  showAddToMeetingPicker.value = true;
  upcomingMeetings.value = [];
  meetingsLoading.value = true;
  try {
    const params = props.list?.agency_id ? { agencyId: props.list.agency_id } : {};
    const res = await api.get('/meeting-agendas/meetings', { params });
    upcomingMeetings.value = res.data?.meetings || [];
  } catch (err) {
    console.error('Failed to fetch meetings:', err);
    upcomingMeetings.value = [];
  } finally {
    meetingsLoading.value = false;
  }
};

const closeAddToMeetingPicker = () => {
  showAddToMeetingPicker.value = false;
  addToMeetingTask.value = null;
};

const addTaskToMeeting = async (meeting) => {
  const task = addToMeetingTask.value;
  if (!task || !meeting) return;
  try {
    const agendaRes = await api.get('/meeting-agendas', {
      params: { meetingType: meeting.meeting_type, meetingId: meeting.meeting_id }
    });
    const agendaId = agendaRes.data?.agenda?.id;
    if (!agendaId) throw new Error('Could not get agenda');
    await api.post(`/meeting-agendas/${agendaId}/items`, { task_id: task.id, title: task.title });
    closeAddToMeetingPicker();
    emit('updated');
  } catch (err) {
    console.error('Failed to add task to meeting:', err);
  }
};

// ─── Attachment actions ───────────────────────────────────────────────────────
const openAttachments = async (task) => {
  attachmentsTask.value = task;
  taskAttachments.value = [];
  try {
    const res = await api.get(`/me/tasks/${task.id}/attachments`);
    taskAttachments.value = res.data || [];
  } catch (err) {
    console.error('Failed to fetch attachments:', err);
  }
};

const attachmentUrl = (a) => toUploadsUrl(a.storage_path || a.url);
const isImageAttachment = (a) => String(a.content_type || '').toLowerCase().startsWith('image/');

const onAttachmentFileChange = async (e) => {
  const file = e.target?.files?.[0];
  if (!file || !attachmentsTask.value) return;
  uploadingAttachment.value = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post(`/me/tasks/${attachmentsTask.value.id}/attachments`, fd);
    taskAttachments.value = [...taskAttachments.value, res.data];
    emit('updated');
  } catch (err) {
    console.error('Failed to upload attachment:', err);
  } finally {
    uploadingAttachment.value = false;
    e.target.value = '';
  }
};

const deleteAttachment = async (a) => {
  if (!attachmentsTask.value) return;
  deletingAttachmentId.value = a.id;
  try {
    await api.delete(`/me/tasks/${attachmentsTask.value.id}/attachments/${a.id}`);
    taskAttachments.value = taskAttachments.value.filter((x) => x.id !== a.id);
    emit('updated');
  } catch (err) {
    console.error('Failed to delete attachment:', err);
  } finally {
    deletingAttachmentId.value = null;
  }
};

// ─── Misc ─────────────────────────────────────────────────────────────────────
const isReminder = (task) => {
  const m = task?.metadata;
  return m && typeof m === 'object' && m.is_reminder === true;
};

const setTaskMenuRef = (taskId, el) => {
  if (el) taskMenuRefs[taskId] = el;
};

const openTaskMenu = (task) => {
  taskMenuTaskId.value = taskMenuTaskId.value === task.id ? null : task.id;
};

const convertToReminder = async (task) => {
  try {
    const meta = typeof task.metadata === 'object' ? { ...task.metadata } : {};
    meta.is_reminder = true;
    await api.put(`/me/tasks/${task.id}`, { metadata: meta });
    await fetchTasks();
    emit('updated');
  } catch (err) {
    console.error('Failed to convert to reminder:', err);
  }
};

const formatDue = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString();
};

const formatCompleted = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { dateStyle: 'short' });
};

const formatMeetingDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
};

const printList = () => {
  const listName = props.list?.name || 'Task List';
  const taskItems = tasks.value.map((t) => `<li>${t.completed_at ? '✓ ' : ''}${t.title}</li>`).join('');
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>${listName}</title><style>body{font-family:sans-serif;padding:20px;}h2{margin:0 0 16px;}ul{list-style:none;padding:0;}li{padding:8px 0;border-bottom:1px solid #eee;}</style></head><body><h2>${listName}</h2><p>Printed ${new Date().toLocaleString()}</p><ul>${taskItems}</ul></body></html>`);
  win.document.close();
  win.print();
  win.close();
};

const convertListToSticky = async () => {
  const [activeRes, doneRes] = await Promise.all([
    api.get(`/task-lists/${props.list?.id}/tasks`, { params: { status: 'open' }, skipGlobalLoading: true }),
    api.get(`/task-lists/${props.list?.id}/tasks`, { params: { status: 'completed' }, skipGlobalLoading: true })
  ]);
  const allTasks = [...(activeRes.data || []), ...(doneRes.data || [])];
  const items = allTasks.map((t) => ({ text: t.title, is_checked: t.status === 'completed' || t.status === 'overridden' }));
  const { useMomentumStickiesStore } = await import('../../store/momentumStickies');
  const momentumStore = useMomentumStickiesStore();
  momentumStore.convertListToSticky(items);
  emit('updated');
};

// ─── Click outside ────────────────────────────────────────────────────────────
const handleClickOutside = (e) => {
  if (listMenuOpen.value && listMenuRef.value && !listMenuRef.value.contains(e.target)) {
    listMenuOpen.value = false;
  }
  if (taskMenuTaskId.value && !e.target.closest('.task-more-wrap')) {
    taskMenuTaskId.value = null;
  }
};

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  fetchTasks();
  fetchAvailableUsers();
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => document.removeEventListener('click', handleClickOutside));

watch(() => props.list?.id, () => {
  hasSetAssigneeDefault.value = false;
  fetchTasks();
  fetchAvailableUsers();
});

watch(taskTab, () => fetchTasks());

watch(showMembers, (v) => {
  if (v) fetchAvailableUsers();
});
</script>

<style scoped>
/* ── Overlay + Modal ─────────────────────────────────────────────────────── */
.task-list-view-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.task-list-view-modal {
  background: white;
  border-radius: 16px;
  max-width: 680px;
  width: 95%;
  max-height: 85vh;
  overflow: auto;
  padding: 0;
  box-shadow: 0 8px 48px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.tlv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 14px;
  border-bottom: 1px solid #f1f5f9;
  flex-shrink: 0;
}

.tlv-header__left { min-width: 0; }
.tlv-title {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}
.tlv-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  color: #64748b;
}
.tlv-sep { opacity: 0.5; }
.tlv-header__right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.btn-icon-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 20px;
  background: white;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-icon-pill:hover,
.btn-icon-pill.active {
  background: #f0fdf4;
  border-color: #16a34a;
  color: #15803d;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #6b7280;
  padding: 4px 8px;
  line-height: 1;
}
.btn-icon:hover { color: #374151; }

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  line-height: 1;
  padding: 0 4px;
}
.btn-close:hover { color: #1f2937; }

/* ── Members Panel ──────────────────────────────────────────────────────── */
.members-panel {
  padding: 14px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.members-panel__head { margin-bottom: 10px; }
.members-panel__title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.members-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.member-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: white;
  font-size: 13px;
}

.member-chip__avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.member-chip__name { font-weight: 500; color: #0f172a; }
.member-chip__role { font-size: 11px; color: #94a3b8; }

.member-chip__remove {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  margin-left: 2px;
}
.member-chip__remove:hover:not(:disabled) { color: #ef4444; }

.members-empty { font-size: 13px; color: #94a3b8; }

.add-member-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.add-member-row select:first-child { flex: 1; min-width: 160px; }

/* ── Tabs ────────────────────────────────────────────────────────────────── */
.task-list-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px 0;
  flex-shrink: 0;
}

.tab-btn {
  padding: 6px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  font-size: 14px;
  cursor: pointer;
  color: #6b7280;
}
.tab-btn:hover { background: #f9fafb; color: #374151; }
.tab-btn.active {
  background: #166534;
  border-color: #166534;
  color: white;
}

/* ── Add Task Form ───────────────────────────────────────────────────────── */
.add-task-form {
  margin: 12px 20px;
  padding: 12px 14px;
  background: #f9fafb;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  flex-shrink: 0;
}

.add-task-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: #dc2626;
}

.add-task-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.add-task-input-row input[type='text'] { flex: 1; min-width: 0; }

.btn-mic {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  color: #6b7280;
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
}
.btn-mic:hover { color: #374151; background: #f3f4f6; }
.btn-mic-active { color: #dc2626; background: #fef2f2; border-color: #fecaca; }

.add-task-fields {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.add-task-fields .form-control-sm { flex: 1; min-width: 100px; }

.target-count-field { display: flex; align-items: center; gap: 4px; }
.target-count-label { font-size: 12px; color: #6b7280; }
.target-count-input { width: 56px; }

/* ── Task List ───────────────────────────────────────────────────────────── */
.task-list-loading,
.task-list-empty {
  color: #6b7280;
  font-size: 14px;
  padding: 20px;
  text-align: center;
}

.task-list-items {
  list-style: none;
  margin: 8px 20px 20px;
  padding: 0;
  flex: 1;
  min-height: 0;
}

.task-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-left-width: 4px;
  border-left-color: #f59e0b;
  border-radius: 10px;
  margin-bottom: 8px;
  background: white;
  transition: box-shadow 0.15s;
}
.task-item:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }

.task-item-body { flex: 1; min-width: 0; }
.task-item-main { margin-bottom: 6px; }

.task-title {
  font-size: 14px;
  font-weight: 500;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.task-title--waiting { color: #94a3b8; font-style: italic; }

.waiting-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #fef9c3;
  color: #854d0e;
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 1px 6px;
}

.task-item-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.urgency-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.task-due {
  font-size: 12px;
  color: #6b7280;
}
.task-due--overdue { color: #ef4444; font-weight: 600; }
.task-recurring { font-size: 14px; color: #6b7280; }

.task-target-count-wrap { display: inline-flex; align-items: center; gap: 2px; }
.target-count-btn {
  padding: 2px 5px;
  font-size: 10px;
  line-height: 1;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: #f9fafb;
  cursor: pointer;
  color: #6b7280;
}
.target-count-btn:hover:not(:disabled) { background: #e5e7eb; }
.target-count-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.task-target-count { min-width: 20px; text-align: center; font-weight: 600; font-size: 13px; }

/* ── Assignee Row ────────────────────────────────────────────────────────── */
.task-assignee-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.assignee-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 3px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.assignee-chip__avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
}

.task-unassigned { font-size: 12px; color: #9ca3af; }
.task-completed-at { font-size: 12px; color: #6b7280; }

.reassign-select { max-width: 160px; }

/* ── Task Actions ────────────────────────────────────────────────────────── */
.task-item-actions {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.btn-claim {
  background: #dbeafe;
  color: #1d4ed8;
  border-color: #bfdbfe;
}
.btn-claim:hover:not(:disabled) { background: #bfdbfe; }

.btn-done {
  background: #dcfce7;
  color: #166534;
  border-color: #bbf7d0;
}
.btn-done:hover:not(:disabled) { background: #bbf7d0; }

.task-more-wrap { position: relative; }

/* ── Misc states ─────────────────────────────────────────────────────────── */
.task-done { opacity: 0.85; background: #fafafa; }
.task-waiting { opacity: 0.75; }

.task-just-done { animation: task-done-flash 2s ease-out; }
@keyframes task-done-flash {
  0% { background: #dcfce7; }
  100% { background: transparent; }
}

.task-reminder { opacity: 0.85; font-style: italic; }

/* ── More Menu ───────────────────────────────────────────────────────────── */
.more-menu-wrap { position: relative; }
.more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  min-width: 170px;
  z-index: 10;
}
.more-menu.task-menu { right: 0; }
.more-menu-item {
  display: block;
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  border: none;
  background: none;
  font-size: 14px;
  cursor: pointer;
  color: #374151;
}
.more-menu-item:hover { background: #f9fafb; }

/* ── Sub overlays ────────────────────────────────────────────────────────── */
.sub-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}
.sub-panel {
  background: white;
  border-radius: 14px;
  padding: 20px;
  max-width: 420px;
  width: 90%;
  max-height: 80vh;
  overflow: auto;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
}
.sub-panel h4 { margin: 0 0 16px; font-size: 16px; font-weight: 700; }

/* ── Comments ────────────────────────────────────────────────────────────── */
.comments-list { list-style: none; margin: 0 0 16px; padding: 0; }
.comment-item { padding: 12px 0; border-bottom: 1px solid #eee; }
.comment-item:last-child { border-bottom: none; }
.comment-author { font-weight: 600; font-size: 14px; color: #374151; }
.comment-time { font-size: 12px; color: #9ca3af; margin-left: 8px; }
.comment-body { margin: 6px 0 0; font-size: 14px; line-height: 1.5; color: #4b5563; white-space: pre-wrap; word-break: break-word; }
.comment-mention { background: #dbeafe; color: #1d4ed8; padding: 1px 4px; border-radius: 4px; font-weight: 500; }
.comments-empty, .comments-loading { color: #6b7280; font-size: 14px; margin: 12px 0; }
.comment-input-wrap { position: relative; margin: 16px 0; }
.comment-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 60px;
}
.comment-input:focus { outline: none; border-color: #16a34a; }
.mention-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 160px;
  overflow-y: auto;
  z-index: 10;
}
.mention-option { display: block; width: 100%; padding: 8px 12px; text-align: left; border: none; background: none; font-size: 14px; cursor: pointer; color: #374151; }
.mention-option:hover { background: #f3f4f6; }
.mention-empty { padding: 8px 12px; margin: 0; font-size: 13px; color: #9ca3af; }

/* ── Attachments ─────────────────────────────────────────────────────────── */
.attachments-list { list-style: none; margin: 12px 0; padding: 0; }
.attachment-item { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #eee; }
.attachment-thumb { display: block; width: 48px; height: 48px; object-fit: cover; border-radius: 4px; overflow: hidden; }
.attachment-thumb img { width: 100%; height: 100%; object-fit: cover; }
.attachment-link { flex: 1; font-size: 14px; color: #3b82f6; text-decoration: none; }
.attachment-link:hover { text-decoration: underline; }
.attachment-delete { background: none; border: none; font-size: 18px; cursor: pointer; color: #9ca3af; padding: 0 4px; line-height: 1; }
.attachment-delete:hover:not(:disabled) { color: #ef4444; }
.attachments-empty { margin: 12px 0; color: #9ca3af; font-size: 14px; }

/* ── Meetings ────────────────────────────────────────────────────────────── */
.meeting-list { list-style: none; margin: 0 0 16px; padding: 0; }
.meeting-item { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.meeting-item:hover { background: #f9fafb; }
.meeting-title { font-weight: 600; font-size: 14px; }
.meeting-date { font-size: 12px; color: #6b7280; }
.muted { color: #9ca3af; font-size: 14px; }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

/* ── Dependencies ────────────────────────────────────────────────────────── */
.dep-section { margin-bottom: 16px; }
.dep-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  margin: 0 0 8px;
}
.dep-list { list-style: none; padding: 0; margin: 0; }
.dep-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}
.dep-item:last-child { border-bottom: none; }
.dep-item--dependent { opacity: 0.75; }
.dep-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dep-title { flex: 1; min-width: 0; font-weight: 500; color: #0f172a; }
.dep-status { font-size: 11px; color: #94a3b8; text-transform: capitalize; flex-shrink: 0; }
.dep-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
}
.dep-remove:hover:not(:disabled) { color: #ef4444; }
.dep-empty { font-size: 13px; color: #94a3b8; padding: 8px 0; }
.dep-add-row { border-top: 1px solid #e2e8f0; padding-top: 14px; }
</style>
