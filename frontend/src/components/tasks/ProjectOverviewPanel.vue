<template>
  <section class="po">
    <!-- ── Hero ── -->
    <header class="po-hero">
      <div class="po-hero__left">
        <p class="po-eyebrow">Project Overview</p>
        <h2 class="po-title">{{ project?.name || 'Project' }}</h2>
        <p v-if="project?.description" class="po-desc">{{ project.description }}</p>
        <p v-if="overview?.due_date" class="po-due">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/></svg>
          Due {{ formatDate(overview.due_date) }}
        </p>
      </div>
      <div class="po-hero__actions">
        <button type="button" class="po-btn po-btn--ghost" @click="$emit('edit')">Edit</button>
        <button type="button" class="po-btn po-btn--primary" @click="openTab('overview')">Open Project</button>
        <button type="button" class="po-btn po-btn--outline" @click="$emit('close')">Back</button>
      </div>
    </header>

    <div v-if="loading" class="po-loading">
      <div class="po-loading-spinner" />Loading…
    </div>

    <template v-else-if="overview">
      <!-- ── Members row ── -->
      <div class="po-members">
        <div class="po-members__head">
          <span class="po-section-label">Team Members</span>
          <span class="po-members__count">{{ (overview.members || []).length }} active</span>
          <button type="button" class="po-textbtn" @click="showTeamEdit = !showTeamEdit">
            {{ showTeamEdit ? 'Done' : 'Manage team' }}
          </button>
        </div>

        <!-- Team edit panel -->
        <div v-if="showTeamEdit" class="po-team-edit">
          <div v-for="m in overview.members || []" :key="m.user_id || m.id" class="po-team-row">
            <div class="po-member__av po-member__av--sm" :style="{ background: memberColor(m) }">
              <img v-if="memberPhotoUrl(m)" :src="memberPhotoUrl(m)" :alt="m.first_name" class="po-member__img" />
              <span v-else>{{ memberInitials(m) }}</span>
            </div>
            <span class="po-team-name">{{ m.first_name }} {{ m.last_name }}</span>
            <select
              :value="m.role"
              class="po-role-sel"
              @change="changeRole(m, $event.target.value)"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="button" class="po-remove-btn" @click="removeMember(m)" title="Remove">✕</button>
          </div>
          <!-- Add member -->
          <div class="po-add-member">
            <select v-model="addMemberUserId" class="po-role-sel" style="flex:1">
              <option value="">Add person…</option>
              <option v-for="u in addableUsers" :key="u.id" :value="u.id">{{ u.first_name }} {{ u.last_name }}</option>
            </select>
            <select v-model="addMemberRole" class="po-role-sel">
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button type="button" class="po-btn po-btn--sm" :disabled="!addMemberUserId" @click="addMember">Add</button>
          </div>
        </div>

        <!-- Avatar row (normal view) -->
        <div v-else class="po-members__avatars">
          <div
            v-for="m in (overview.members || [])"
            :key="m.user_id || m.id"
            class="po-member"
            :title="`${m.first_name} ${m.last_name}${m.title ? ' · '+m.title : ''} (${m.role})`"
            @click="showTeamEdit = true"
          >
            <div class="po-member__av" :style="{ background: memberColor(m) }">
              <img v-if="memberPhotoUrl(m)" :src="memberPhotoUrl(m)" :alt="m.first_name" class="po-member__img" />
              <span v-else class="po-member__initials">{{ memberInitials(m) }}</span>
            </div>
            <span class="po-member__name">{{ m.first_name }}<br>{{ m.last_name }}</span>
            <span class="po-member__role" :class="`role--${m.role}`">{{ m.role }}</span>
          </div>
          <div v-if="!(overview.members || []).length" class="po-member po-member--empty" @click="showTeamEdit = true">
            <div class="po-member__av" style="background:#f1f5f9;border:2px dashed #cbd5e1">
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#94a3b8" stroke-width="2" fill="none"/><circle cx="12" cy="7" r="4" stroke="#94a3b8" stroke-width="2" fill="none"/></svg>
            </div>
            <span class="po-member__name" style="color:#94a3b8">Add members</span>
          </div>
        </div>
      </div>

      <!-- ── KPI strip (all clickable) ── -->
      <div class="po-kpis">
        <!-- Progress -->
        <button type="button" class="po-kpi po-kpi--progress" @click="openTab('tasks')">
          <svg class="po-kpi__ring" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="25" fill="none" stroke="#f1f5f9" stroke-width="6"/>
            <circle cx="30" cy="30" r="25" fill="none" stroke="#22c55e" stroke-width="6"
              :stroke-dasharray="`${progressArc} 157`" stroke-dashoffset="39.25" stroke-linecap="round"/>
            <text x="30" y="34" text-anchor="middle" class="po-ring-val">{{ overview.progress_pct || 0 }}%</text>
          </svg>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Progress</span>
            <span class="po-kpi__sub">{{ overview.completed_task_count || 0 }} / {{ overview.total_task_count || 0 }} done</span>
          </div>
        </button>

        <button type="button" class="po-kpi" @click="openTab('tasks')">
          <span class="po-kpi__icon" style="background:#eff6ff;color:#3b82f6">
            <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Tasks</span>
            <strong class="po-kpi__val">{{ overview.total_task_count || 0 }}</strong>
            <span class="po-kpi__sub">{{ overview.open_task_count || 0 }} open</span>
          </div>
        </button>

        <button type="button" class="po-kpi" @click="innerTab = 'action-items'">
          <span class="po-kpi__icon" :style="{ background:(overview.open_action_item_count||0)>5?'#fff7ed':'#f5f3ff', color:(overview.open_action_item_count||0)>5?'#f97316':'#8b5cf6' }">
            <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Action Items</span>
            <strong class="po-kpi__val">{{ extras.actionItems?.length || overview.open_action_item_count || 0 }}</strong>
            <span class="po-kpi__sub" :class="(overview.open_action_item_count||0)>5?'warn':''">
              {{ (overview.open_action_item_count||0)>5?'Needs attention':'On track' }}
            </span>
          </div>
        </button>

        <button type="button" class="po-kpi" @click="innerTab = 'lists'">
          <span class="po-kpi__icon" style="background:#f0fdf4;color:#22c55e">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Shared Lists</span>
            <strong class="po-kpi__val">{{ overview.list_count || 0 }}</strong>
            <span class="po-kpi__sub">Click to view</span>
          </div>
        </button>

        <button type="button" class="po-kpi" @click="innerTab = 'docs'">
          <span class="po-kpi__icon" style="background:#fdf2f8;color:#ec4899">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" fill="none"/><polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" fill="none"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Documents</span>
            <strong class="po-kpi__val">{{ extras.attachments?.length || overview.document_count || 0 }}</strong>
            <span class="po-kpi__sub">Attached</span>
          </div>
        </button>

        <button type="button" class="po-kpi" @click="innerTab = 'links'">
          <span class="po-kpi__icon" style="background:#eff6ff;color:#6366f1">
            <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Links</span>
            <strong class="po-kpi__val">{{ extras.links?.length || 0 }}</strong>
            <span class="po-kpi__sub">Task links</span>
          </div>
        </button>

        <button type="button" class="po-kpi" @click="innerTab = 'whiteboards'">
          <span class="po-kpi__icon" style="background:#fef2f2;color:#ef4444">
            <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Whiteboards</span>
            <strong class="po-kpi__val">{{ whiteboards.length }}</strong>
            <span class="po-kpi__sub">{{ whiteboards.length ? 'Click to view' : 'Create one' }}</span>
          </div>
        </button>

        <!-- Health -->
        <div class="po-kpi po-kpi--health">
          <div class="po-health-badge" :class="healthStatus.cls">
            <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            {{ healthStatus.label }}
          </div>
          <span class="po-kpi__sub" style="margin-top:4px">{{ healthStatus.tagline }}</span>
        </div>
      </div>

      <!-- ── Inner tab bar ── -->
      <div class="po-tabs">
        <button v-for="t in innerTabs" :key="t.id" type="button"
          :class="['po-tab', { 'po-tab--active': innerTab === t.id }]"
          @click="innerTab = t.id">
          {{ t.label }}
        </button>
      </div>

      <!-- ── Inner tab content ── -->
      <div class="po-body">
        <!-- Activity (default) -->
        <div v-if="innerTab === 'activity'" class="po-inner">
          <div v-if="activityLoading" class="po-empty">Loading…</div>
          <ul v-else-if="activity.length" class="po-activity">
            <li v-for="a in activity" :key="a.id" class="po-activity__row">
              <span class="po-activity__av" :style="{ background: actorColor(a.actor_first_name) }">{{ actorInitials(a) }}</span>
              <div class="po-activity__body">
                <span><strong>{{ actorName(a) }}</strong> {{ activityVerb(a.action_type) }} <em>"{{ a.task_title }}"</em></span>
                <span class="po-time">{{ timeAgo(a.created_at) }}</span>
              </div>
            </li>
          </ul>
          <div v-else class="po-empty">No activity yet — task changes will appear here.</div>
        </div>

        <!-- Shared lists -->
        <div v-else-if="innerTab === 'lists'" class="po-inner">
          <div class="po-inner-head">
            <span>{{ (overview.lists || []).length }} shared list{{ (overview.lists||[]).length !== 1 ? 's' : '' }} attached</span>
            <button type="button" class="po-textbtn" @click="openTab('lists')">Manage in workspace →</button>
          </div>
          <ul class="po-list">
            <li v-for="l in overview.lists || []" :key="l.id" class="po-list__row" @click="openTab('lists')">
              <span class="po-list__dot" />
              <div class="po-list__info">
                <strong>{{ l.name }}</strong>
                <span>{{ l.total_task_count || 0 }} tasks · {{ l.open_task_count || 0 }} open</span>
              </div>
              <span class="po-list__badge">{{ l.open_task_count || 0 }} open</span>
            </li>
            <li v-if="!(overview.lists||[]).length" class="po-empty">No lists attached yet.</li>
          </ul>
        </div>

        <!-- Action items -->
        <div v-else-if="innerTab === 'action-items'" class="po-inner">
          <div class="po-inner-head">
            <span>{{ extras.actionItems?.length || 0 }} action items</span>
            <button type="button" class="po-textbtn" @click="openTab('tasks')">View in workspace →</button>
          </div>
          <ul v-if="extras.actionItems?.length" class="po-list">
            <li v-for="ai in extras.actionItems" :key="ai.id" class="po-list__row">
              <span class="po-list__dot" :style="{ background: urgencyColor(ai.urgency) }" />
              <div class="po-list__info">
                <strong>{{ ai.title }}</strong>
                <span>{{ ai.status || 'pending' }}{{ ai.first_name ? ' · ' + ai.first_name + ' ' + ai.last_name : '' }}{{ ai.due_date ? ' · Due ' + formatDate(ai.due_date) : '' }}</span>
              </div>
              <span class="po-urg-chip" :class="`urg--${ai.urgency||'none'}`">{{ ai.urgency || '—' }}</span>
            </li>
          </ul>
          <div v-else class="po-empty">No action items for this project.</div>
        </div>

        <!-- Documents -->
        <div v-else-if="innerTab === 'docs'" class="po-inner">
          <div class="po-inner-head">
            <span>{{ extras.attachments?.length || 0 }} documents across all tasks</span>
          </div>
          <ul v-if="extras.attachments?.length" class="po-list">
            <li v-for="att in extras.attachments" :key="att.id" class="po-list__row">
              <span class="po-file-icon">{{ fileIcon(att.mime_type) }}</span>
              <div class="po-list__info">
                <strong>{{ att.file_name }}</strong>
                <span>{{ att.task_title }} · {{ formatFileSize(att.file_size) }}</span>
              </div>
              <span class="po-time">{{ timeAgo(att.created_at) }}</span>
            </li>
          </ul>
          <div v-else class="po-empty">No documents attached to any task in this project.</div>
        </div>

        <!-- Links -->
        <div v-else-if="innerTab === 'links'" class="po-inner">
          <div class="po-inner-head">
            <span>{{ extras.links?.length || 0 }} links across all tasks</span>
          </div>
          <ul v-if="extras.links?.length" class="po-list">
            <li v-for="lnk in extras.links" :key="lnk.id" class="po-list__row">
              <span class="po-list__dot" style="background:#6366f1" />
              <div class="po-list__info">
                <a :href="lnk.url" target="_blank" rel="noopener" class="po-link">{{ lnk.label || lnk.url }}</a>
                <span>{{ lnk.task_title }}</span>
              </div>
            </li>
          </ul>
          <div v-else class="po-empty">No links attached to tasks in this project.</div>
        </div>

        <!-- Whiteboards -->
        <div v-else-if="innerTab === 'whiteboards'" class="po-inner">
          <div class="po-inner-head">
            <span>{{ whiteboards.length }} whiteboard{{ whiteboards.length !== 1 ? 's' : '' }}</span>
            <button type="button" class="po-textbtn" @click="openTab('whiteboard')">Open full whiteboard →</button>
          </div>
          <div v-if="whiteboardsLoading" class="po-empty">Loading…</div>
          <ul v-else-if="whiteboards.length" class="po-list">
            <li v-for="wb in whiteboards" :key="wb.id" class="po-list__row" style="cursor:pointer" @click="openTab('whiteboard')">
              <span class="po-file-icon">🖊</span>
              <div class="po-list__info">
                <strong>{{ wb.name }}</strong>
                <span>Last edited {{ timeAgo(wb.updated_at) }}</span>
              </div>
            </li>
          </ul>
          <div v-else class="po-empty">
            No whiteboards yet.
            <button type="button" class="po-textbtn" style="display:block;margin-top:8px" @click="openTab('whiteboard')">Create one in the workspace →</button>
          </div>
        </div>

        <!-- Quick actions sidebar -->
        <div class="po-sidebar">
          <div class="po-qa">
            <button type="button" class="po-qa__btn" @click="openTab('tasks')">
              <span class="po-qa__icon" style="background:#eff6ff;color:#3b82f6"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
              <div><strong>Create Task</strong><span>Add to workspace</span></div>
            </button>
            <button type="button" class="po-qa__btn" @click="openTab('lists')">
              <span class="po-qa__icon" style="background:#f0fdf4;color:#22c55e"><svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" fill="none"/></svg></span>
              <div><strong>Manage Lists</strong><span>Attach shared lists</span></div>
            </button>
            <button type="button" class="po-qa__btn" @click="openTab('activity')">
              <span class="po-qa__icon" style="background:#fff7ed;color:#f97316"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span>
              <div><strong>View Activity</strong><span>Full history</span></div>
            </button>
            <button type="button" class="po-qa__btn" @click="openTab('whiteboard')">
              <span class="po-qa__icon" style="background:#fef2f2;color:#ef4444"><svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
              <div><strong>Whiteboard</strong><span>{{ whiteboards.length }} board{{ whiteboards.length !== 1 ? 's' : '' }}</span></div>
            </button>
          </div>

          <button type="button" class="po-open-cta" @click="openTab('overview')">
            <div class="po-open-cta__text"><strong>Open full workspace</strong><span>Tasks, whiteboard, activity & more</span></div>
            <span class="po-open-cta__arrow">→</span>
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  project:  { type: Object, required: true },
  agencyId: { type: Number, default: null }
});

const emit = defineEmits(['close', 'open-project', 'edit']);

function openTab(tab) {
  emit('open-project', props.project.id, tab);
}

// ── State ──────────────────────────────────────────────
const loading        = ref(false);
const overview       = ref(null);
const extras         = ref({ tasks: [], links: [], attachments: [], actionItems: [] });
const activity       = ref([]);
const activityLoading = ref(false);
const whiteboards    = ref([]);
const whiteboardsLoading = ref(false);

const innerTab = ref('activity');
const showTeamEdit = ref(false);

// Team edit
const addMemberUserId = ref('');
const addMemberRole   = ref('editor');
const allUsers        = ref([]);

const innerTabs = [
  { id: 'activity',     label: 'Activity' },
  { id: 'lists',        label: 'Shared Lists' },
  { id: 'action-items', label: 'Action Items' },
  { id: 'docs',         label: 'Documents' },
  { id: 'links',        label: 'Links' },
  { id: 'whiteboards',  label: 'Whiteboards' },
];

// ── Helpers ────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const MEMBER_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ec4899','#14b8a6','#f59e0b','#06b6d4'];
function memberColor(m) { return MEMBER_COLORS[(m.user_id || m.id || 0) % MEMBER_COLORS.length]; }
function memberInitials(m) { return [m.first_name?.[0], m.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'; }
function memberPhotoUrl(m) {
  if (!m.profile_photo_path) return null;
  try { return toUploadsUrl(m.profile_photo_path); } catch { return null; }
}

const addableUsers = computed(() => {
  const existing = new Set((overview.value?.members || []).map(m => m.user_id || m.id));
  return allUsers.value.filter(u => !existing.has(u.id));
});

function urgencyColor(u) {
  return { high: '#ef4444', medium: '#f97316', low: '#3b82f6' }[u] || '#94a3b8';
}

function fileIcon(mime) {
  if (!mime) return '📎';
  if (mime.includes('pdf'))   return '📄';
  if (mime.includes('image')) return '🖼';
  if (mime.includes('video')) return '🎬';
  if (mime.includes('audio')) return '🎵';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel'))   return '📊';
  return '📎';
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

const progressArc = computed(() => (overview.value?.progress_pct || 0) / 100 * 157);

const healthStatus = computed(() => {
  const pct     = overview.value?.progress_pct || 0;
  const members = (overview.value?.members || []).length;
  if (pct >= 40 && members > 0) return { label: 'Good',      cls: 'h--good', tagline: 'On track' };
  if (pct >= 10 || members > 0) return { label: 'Fair',      cls: 'h--fair', tagline: 'Some items need attention' };
  return                         { label: 'Getting started', cls: 'h--new',  tagline: 'Ready — add tasks & members' };
});

function actorInitials(a) { return [a.actor_first_name?.[0], a.actor_last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?'; }
function actorName(a) { return [a.actor_first_name, a.actor_last_name].filter(Boolean).join(' ') || 'Someone'; }
function actorColor(n) { const c = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ec4899','#14b8a6']; return c[(n||'').charCodeAt(0) % c.length] || c[0]; }
function activityVerb(t) { return {created:'created',completed:'completed',assigned:'was assigned to',updated:'updated',status_changed:'updated status of',commented:'commented on'}[t] || 'updated'; }
function timeAgo(d) {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// ── Team management ────────────────────────────────────
async function changeRole(member, newRole) {
  const uid = member.user_id || member.id;
  try {
    await api.put(`/task-projects/${props.project.id}/members/${uid}/role`, { role: newRole }, { skipGlobalLoading: true });
    const res = await api.get(`/task-projects/${props.project.id}`, { skipGlobalLoading: true });
    overview.value = { ...(res.data?.overview || {}), due_date: res.data?.due_date };
  } catch (e) { console.error(e); }
}

async function removeMember(member) {
  const uid = member.user_id || member.id;
  if (!confirm(`Remove ${member.first_name} ${member.last_name}?`)) return;
  try {
    await api.delete(`/task-projects/${props.project.id}/members/${uid}`, { skipGlobalLoading: true });
    const res = await api.get(`/task-projects/${props.project.id}`, { skipGlobalLoading: true });
    overview.value = { ...(res.data?.overview || {}), due_date: res.data?.due_date };
  } catch (e) { console.error(e); }
}

async function addMember() {
  if (!addMemberUserId.value) return;
  try {
    await api.post(`/task-projects/${props.project.id}/members`, { userId: Number(addMemberUserId.value), role: addMemberRole.value }, { skipGlobalLoading: true });
    addMemberUserId.value = '';
    const res = await api.get(`/task-projects/${props.project.id}`, { skipGlobalLoading: true });
    overview.value = { ...(res.data?.overview || {}), due_date: res.data?.due_date };
  } catch (e) { console.error(e); }
}

async function loadUsers() {
  try {
    const res = await api.get('/users/me/agencies', { skipGlobalLoading: true });
    const ids = (Array.isArray(res.data) ? res.data : []).map(a => a.id).filter(Boolean);
    const all = await Promise.all(ids.map(id =>
      api.get(`/agencies/${id}/users`, { skipGlobalLoading: true }).then(x => x.data).catch(() => [])
    ));
    const seen = new Set();
    allUsers.value = all.flat().filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; });
  } catch { allUsers.value = []; }
}

// ── Load ────────────────────────────────────────────────
async function load() {
  if (!props.project?.id) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/task-projects/${props.project.id}`, { params: { agencyId: props.agencyId || undefined }, skipGlobalLoading: true });
    overview.value = { ...(data?.overview || {}), due_date: data?.due_date };
  } catch { overview.value = null; }
  finally { loading.value = false; }

  // Parallel loads
  Promise.all([
    api.get(`/task-projects/${props.project.id}/activity`, { params: { limit: 10 }, skipGlobalLoading: true })
      .then(r => { activity.value = Array.isArray(r.data) ? r.data : []; activityLoading.value = false; })
      .catch(() => { activity.value = []; }),

    api.get(`/task-projects/${props.project.id}/extras`, { skipGlobalLoading: true })
      .then(r => { extras.value = r.data || { tasks: [], links: [], attachments: [], actionItems: [] }; })
      .catch(() => { extras.value = { tasks: [], links: [], attachments: [], actionItems: [] }; }),

    api.get(`/task-projects/${props.project.id}/whiteboards`, { skipGlobalLoading: true })
      .then(r => { whiteboards.value = Array.isArray(r.data) ? r.data : []; })
      .catch(() => { whiteboards.value = []; }),

    loadUsers(),
  ]);
}

watch(() => props.project?.id, load, { immediate: true });
</script>

<style scoped>
.po { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 4px 24px rgba(15,23,42,.06); overflow: hidden; }

/* Hero */
.po-hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 22px 16px; background: linear-gradient(135deg, #14532d 0%, #166534 60%, #15803d 100%); color: #fff; }
.po-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.55); margin: 0 0 3px; }
.po-title { margin: 0 0 3px; font-size: 1.4rem; font-weight: 700; color: #fff; }
.po-desc { margin: 0 0 5px; font-size: 12px; color: rgba(255,255,255,0.65); max-width: 500px; }
.po-due { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #86efac; margin: 0; }
.po-due svg { width: 12px; height: 12px; }
.po-hero__actions { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.po-btn { padding: 6px 12px; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; transition: opacity 0.15s, background 0.15s; white-space: nowrap; }
.po-btn--sm { padding: 4px 10px; font-size: 11px; background: #14532d; color: #fff; border-radius: 6px; }
.po-btn--sm:disabled { opacity: 0.4; }
.po-btn--primary { background: #fff; color: #14532d; }
.po-btn--primary:hover { background: #f0fdf4; }
.po-btn--ghost { background: rgba(255,255,255,0.15); color: #fff; }
.po-btn--ghost:hover { background: rgba(255,255,255,0.25); }
.po-btn--outline { background: transparent; border: 1px solid rgba(255,255,255,0.4); color: #fff; }
.po-btn--outline:hover { background: rgba(255,255,255,0.1); }

/* Loading */
.po-loading { display: flex; align-items: center; gap: 10px; padding: 32px 24px; color: #64748b; font-size: 14px; }
.po-loading-spinner { width: 18px; height: 18px; border: 2px solid #e2e8f0; border-top-color: #15803d; border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Members */
.po-members { padding: 14px 20px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.po-members__head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.po-members__count { font-size: 11px; color: #94a3b8; background: #e2e8f0; padding: 1px 8px; border-radius: 99px; }
.po-members__avatars { display: flex; flex-wrap: wrap; gap: 12px; }

.po-member { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; }
.po-member:hover .po-member__av { box-shadow: 0 0 0 3px #15803d; }

.po-member__av { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
.po-member__av--sm { width: 32px; height: 32px; border-radius: 8px; font-size: 12px; }
.po-member__img { width: 100%; height: 100%; object-fit: cover; }
.po-member__initials { font-size: 16px; font-weight: 700; color: #fff; }
.po-member__name { font-size: 10px; color: #475569; text-align: center; line-height: 1.3; font-weight: 500; }
.po-member__role { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 1px 5px; border-radius: 99px; }
.role--admin  { background: #dcfce7; color: #16a34a; }
.role--editor { background: #dbeafe; color: #1d4ed8; }
.role--viewer { background: #f1f5f9; color: #64748b; }
.po-member__av svg { width: 22px; height: 22px; }

/* Team edit */
.po-team-edit { display: flex; flex-direction: column; gap: 6px; }
.po-team-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.po-team-name { flex: 1; font-size: 13px; color: #1e293b; min-width: 0; }
.po-role-sel { border: 1px solid #e2e8f0; border-radius: 6px; padding: 3px 6px; font-size: 12px; color: #475569; background: #fff; }
.po-remove-btn { width: 22px; height: 22px; border: none; border-radius: 50%; background: #fee2e2; color: #dc2626; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.po-add-member { display: flex; gap: 6px; margin-top: 8px; border-top: 1px solid #f1f5f9; padding-top: 8px; }

/* KPIs */
.po-kpis { display: flex; align-items: stretch; overflow-x: auto; border-bottom: 1px solid #e2e8f0; }
.po-kpi { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-right: 1px solid #f1f5f9; flex: 1 1 0; min-width: 0; background: none; border-top: none; border-bottom: none; border-left: none; cursor: pointer; text-align: left; transition: background 0.12s; }
.po-kpi:hover { background: #f8fafc; }
.po-kpi:last-child { border-right: none; }
.po-kpi--progress { flex: 1.2 1 0; }
.po-kpi--health { flex: 1.3 1 0; flex-direction: column; align-items: flex-start; gap: 4px; cursor: default; }
.po-kpi--health:hover { background: transparent; }
.po-kpi__ring { width: 44px; height: 44px; flex-shrink: 0; }
.po-ring-val { font-size: 10px; font-weight: 700; fill: #14532d; }
.po-kpi__icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.po-kpi__icon svg { width: 15px; height: 15px; }
.po-kpi__body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.po-kpi__label { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
.po-kpi__val { font-size: 1.3rem; font-weight: 700; color: #0f172a; line-height: 1; display: block; }
.po-kpi__sub { font-size: 10px; color: #94a3b8; white-space: nowrap; }
.po-kpi__sub.warn { color: #d97706; }
.po-health-badge { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 99px; }
.po-health-badge svg { width: 12px; height: 12px; }
.h--good { background: #dcfce7; color: #16a34a; }
.h--fair { background: #fef3c7; color: #d97706; }
.h--new  { background: #eff6ff; color: #3b82f6; }

/* Tab bar */
.po-tabs { display: flex; border-bottom: 1px solid #e2e8f0; background: #fff; overflow-x: auto; }
.po-tab { padding: 8px 14px; font-size: 12px; font-weight: 600; color: #64748b; background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; transition: color 0.12s, border-color 0.12s; }
.po-tab:hover { color: #1e293b; }
.po-tab--active { color: #14532d; border-bottom-color: #14532d; }

/* Body */
.po-body { display: grid; grid-template-columns: 1fr 280px; min-height: 220px; }
.po-inner { padding: 14px 18px; overflow-y: auto; max-height: 340px; }
.po-inner-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 12px; color: #64748b; }

/* Lists */
.po-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
.po-list__row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 6px; font-size: 12px; color: #1e293b; cursor: pointer; transition: background 0.12s; }
.po-list__row:hover { background: #f8fafc; }
.po-list__dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
.po-list__info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.po-list__info strong { font-size: 13px; }
.po-list__info span   { font-size: 10px; color: #94a3b8; }
.po-list__badge { font-size: 10px; background: #f1f5f9; color: #64748b; padding: 1px 6px; border-radius: 99px; flex-shrink: 0; }

/* Activity */
.po-activity { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.po-activity__row { display: flex; align-items: flex-start; gap: 8px; }
.po-activity__av { width: 26px; height: 26px; border-radius: 50%; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.po-activity__body { display: flex; flex-direction: column; gap: 1px; font-size: 12px; color: #475569; }
.po-activity__body strong { color: #1e293b; }
.po-activity__body em { font-style: normal; font-weight: 500; color: #0f172a; }

/* Sidebar */
.po-sidebar { border-left: 1px solid #f1f5f9; padding: 14px 14px 0; display: flex; flex-direction: column; gap: 6px; }
.po-qa { display: flex; flex-direction: column; gap: 4px; }
.po-qa__btn { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid #e2e8f0; border-radius: 7px; background: #fff; cursor: pointer; text-align: left; transition: background 0.12s; width: 100%; }
.po-qa__btn:hover { background: #f8fafc; }
.po-qa__icon { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.po-qa__icon svg { width: 13px; height: 13px; }
.po-qa__btn > div { display: flex; flex-direction: column; gap: 0; }
.po-qa__btn > div strong { font-size: 11px; color: #1e293b; }
.po-qa__btn > div span  { font-size: 10px; color: #94a3b8; }

/* CTA */
.po-open-cta { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; background: linear-gradient(135deg,#14532d,#15803d); border: none; border-radius: 9px; cursor: pointer; width: 100%; margin-top: auto; margin-bottom: 14px; transition: opacity 0.15s; }
.po-open-cta:hover { opacity: 0.9; }
.po-open-cta__text { display: flex; flex-direction: column; gap: 1px; text-align: left; }
.po-open-cta__text strong { font-size: 12px; color: #fff; }
.po-open-cta__text span   { font-size: 10px; color: rgba(255,255,255,0.65); }
.po-open-cta__arrow { font-size: 18px; color: rgba(255,255,255,0.7); }

/* Shared */
.po-empty { font-size: 12px; color: #94a3b8; padding: 8px 0; }
.po-time  { font-size: 10px; color: #94a3b8; }
.po-textbtn { font-size: 11px; color: #0ea5e9; background: none; border: none; cursor: pointer; padding: 0; }
.po-textbtn:hover { text-decoration: underline; }
.po-link { color: #3b82f6; text-decoration: none; font-size: 13px; font-weight: 500; }
.po-link:hover { text-decoration: underline; }
.po-file-icon { font-size: 16px; flex-shrink: 0; }
.po-urg-chip { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px; flex-shrink: 0; }
.urg--high   { background: #fee2e2; color: #dc2626; }
.urg--medium { background: #ffedd5; color: #c2410c; }
.urg--low    { background: #dbeafe; color: #1d4ed8; }
.urg--none   { background: #f1f5f9; color: #64748b; }
.po-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #64748b; display: flex; align-items: center; gap: 5px; }

@media (max-width: 900px) {
  .po-body { grid-template-columns: 1fr; }
  .po-kpis { flex-wrap: wrap; }
  .po-kpi  { flex: 1 1 120px; min-width: 100px; }
  .po-sidebar { border-left: none; border-top: 1px solid #f1f5f9; }
}
</style>
