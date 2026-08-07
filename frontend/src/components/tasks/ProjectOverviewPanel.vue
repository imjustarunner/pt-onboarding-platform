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
        <button type="button" class="po-btn po-btn--primary" @click="$emit('open-project', project.id)">Open Project</button>
        <button type="button" class="po-btn po-btn--outline" @click="$emit('close')">Back</button>
      </div>
    </header>

    <div v-if="loading" class="po-loading">
      <div class="po-loading-spinner" />
      Loading project overview…
    </div>

    <template v-else-if="overview">
      <!-- ── Members row ── -->
      <div class="po-members">
        <div class="po-members__head">
          <span class="po-section-label">Team Members</span>
          <span class="po-members__count">{{ (overview.members || []).length }} active</span>
        </div>
        <div class="po-members__avatars">
          <div
            v-for="m in (overview.members || [])"
            :key="m.user_id || m.id"
            class="po-member"
            :title="`${m.first_name} ${m.last_name}${m.title ? ' · ' + m.title : ''} (${m.role})`"
          >
            <div class="po-member__av" :style="{ background: memberColor(m) }">
              <img
                v-if="memberPhotoUrl(m)"
                :src="memberPhotoUrl(m)"
                :alt="`${m.first_name} ${m.last_name}`"
                class="po-member__img"
              />
              <span v-else class="po-member__initials">{{ memberInitials(m) }}</span>
            </div>
            <span class="po-member__name">{{ m.first_name }}<br>{{ m.last_name }}</span>
            <span class="po-member__role" :class="`role--${m.role}`">{{ m.role }}</span>
          </div>
          <div v-if="!(overview.members || []).length" class="po-member po-member--empty">
            <div class="po-member__av" style="background:#f1f5f9;border:2px dashed #cbd5e1">
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#94a3b8" stroke-width="2" fill="none"/><circle cx="12" cy="7" r="4" stroke="#94a3b8" stroke-width="2" fill="none"/></svg>
            </div>
            <span class="po-member__name" style="color:#94a3b8">No members yet</span>
          </div>
        </div>
      </div>

      <!-- ── KPI row ── -->
      <div class="po-kpis">
        <div class="po-kpi po-kpi--progress">
          <svg class="po-kpi__ring" viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="25" fill="none" stroke="#f1f5f9" stroke-width="6"/>
            <circle
              cx="30" cy="30" r="25"
              fill="none" stroke="#22c55e" stroke-width="6"
              :stroke-dasharray="`${progressArc} ${157}`"
              stroke-dashoffset="39.25"
              stroke-linecap="round"
            />
            <text x="30" y="34" text-anchor="middle" class="po-ring-val">{{ overview.progress_pct || 0 }}%</text>
          </svg>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Progress</span>
            <span class="po-kpi__sub">{{ overview.completed_task_count || 0 }} of {{ overview.total_task_count || 0 }} tasks done</span>
          </div>
        </div>

        <div class="po-kpi">
          <span class="po-kpi__icon" style="background:#eff6ff;color:#3b82f6">
            <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Tasks</span>
            <strong class="po-kpi__val">{{ overview.total_task_count || 0 }}</strong>
            <span class="po-kpi__sub">{{ overview.open_task_count || 0 }} open</span>
          </div>
        </div>

        <div class="po-kpi">
          <span class="po-kpi__icon" :style="{ background: (overview.open_action_item_count||0)>5?'#fff7ed':'#f5f3ff', color: (overview.open_action_item_count||0)>5?'#f97316':'#8b5cf6' }">
            <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Action Items</span>
            <strong class="po-kpi__val">{{ overview.open_action_item_count || 0 }}</strong>
            <span class="po-kpi__sub" :class="(overview.open_action_item_count||0)>5?'warn':''">{{ (overview.open_action_item_count||0)>5?'Needs attention':'On track' }}</span>
          </div>
        </div>

        <div class="po-kpi">
          <span class="po-kpi__icon" style="background:#f0fdf4;color:#22c55e">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Shared Lists</span>
            <strong class="po-kpi__val">{{ overview.list_count || 0 }}</strong>
            <span class="po-kpi__sub">Attached</span>
          </div>
        </div>

        <div class="po-kpi">
          <span class="po-kpi__icon" style="background:#fdf2f8;color:#ec4899">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" fill="none"/><polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" fill="none"/></svg>
          </span>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Documents</span>
            <strong class="po-kpi__val">{{ overview.document_count || 0 }}</strong>
            <span class="po-kpi__sub">Linked</span>
          </div>
        </div>

        <!-- Health badge -->
        <div class="po-kpi po-kpi--health">
          <div class="po-health-badge" :class="healthStatus.cls">
            <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" fill="none"/></svg>
            {{ healthStatus.label }}
          </div>
          <div class="po-kpi__body">
            <span class="po-kpi__label">Project Health</span>
            <span class="po-kpi__sub">{{ healthStatus.tagline }}</span>
          </div>
        </div>
      </div>

      <!-- ── Two column body ── -->
      <div class="po-body">
        <!-- Shared lists + activity -->
        <div class="po-col">
          <div class="po-card">
            <div class="po-card__head">
              <span class="po-section-label">Shared Lists</span>
              <button type="button" class="po-textbtn" @click="$emit('open-project', project.id)">View all →</button>
            </div>
            <ul class="po-list">
              <li v-for="l in overview.lists || []" :key="l.id" class="po-list__row" @click="$emit('open-project', project.id)">
                <span class="po-list__dot" />
                <span class="po-list__name">{{ l.name }}</span>
                <span class="po-list__badge">{{ l.open_task_count || 0 }} open</span>
              </li>
              <li v-if="!(overview.lists || []).length" class="po-empty">No lists linked yet</li>
            </ul>
          </div>

          <div class="po-card po-card--activity">
            <div class="po-card__head">
              <span class="po-section-label">
                <svg viewBox="0 0 24 24" class="po-section-icon"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Recent Activity
              </span>
            </div>
            <div v-if="activityLoading" class="po-empty">Loading…</div>
            <ul v-else-if="activity.length" class="po-activity">
              <li v-for="a in activity" :key="a.id" class="po-activity__row">
                <span class="po-activity__av" :style="{ background: actorColor(a.actor_first_name) }">
                  {{ actorInitials(a) }}
                </span>
                <div class="po-activity__body">
                  <span><strong>{{ actorName(a) }}</strong> {{ activityVerb(a.action_type) }} <em>"{{ a.task_title }}"</em></span>
                  <span class="po-time">{{ timeAgo(a.created_at) }}</span>
                </div>
              </li>
            </ul>
            <div v-else class="po-empty">No activity recorded yet — task changes will appear here.</div>
          </div>
        </div>

        <!-- Quick actions + open CTA -->
        <div class="po-col po-col--right">
          <div class="po-card">
            <div class="po-card__head">
              <span class="po-section-label">
                <svg viewBox="0 0 24 24" class="po-section-icon"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>
                Quick Actions
              </span>
            </div>
            <div class="po-qa">
              <button type="button" class="po-qa__btn" @click="$emit('open-project', project.id)">
                <span class="po-qa__icon" style="background:#eff6ff;color:#3b82f6">
                  <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </span>
                <div>
                  <strong>Create New Task</strong>
                  <span>Add to this project</span>
                </div>
              </button>
              <button type="button" class="po-qa__btn" @click="$emit('open-project', project.id)">
                <span class="po-qa__icon" style="background:#f0fdf4;color:#22c55e">
                  <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
                </span>
                <div>
                  <strong>Manage Lists</strong>
                  <span>Attach shared lists</span>
                </div>
              </button>
              <button type="button" class="po-qa__btn" @click="$emit('edit')">
                <span class="po-qa__icon" style="background:#fff7ed;color:#f97316">
                  <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
                </span>
                <div>
                  <strong>Edit Project</strong>
                  <span>Name, dates, members</span>
                </div>
              </button>
              <button type="button" class="po-qa__btn" @click="$emit('open-project', project.id)">
                <span class="po-qa__icon" style="background:#fdf2f8;color:#ec4899">
                  <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </span>
                <div>
                  <strong>Open Whiteboard</strong>
                  <span>Brainstorm visually</span>
                </div>
              </button>
            </div>
          </div>

          <!-- Open project CTA -->
          <button type="button" class="po-open-cta" @click="$emit('open-project', project.id)">
            <div class="po-open-cta__text">
              <strong>Open full workspace</strong>
              <span>Tasks, whiteboard, activity & more</span>
            </div>
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
  project: { type: Object, required: true },
  agencyId: { type: Number, default: null }
});

defineEmits(['close', 'open-project', 'edit']);

const loading = ref(false);
const overview = ref(null);
const activity = ref([]);
const activityLoading = ref(false);

// ── Helpers ──────────────────────────────
function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const MEMBER_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ec4899','#14b8a6','#f59e0b','#06b6d4'];

function memberColor(m) {
  return MEMBER_COLORS[(m.user_id || m.id || 0) % MEMBER_COLORS.length];
}

function memberInitials(m) {
  return [m.first_name?.[0], m.last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}

function memberPhotoUrl(m) {
  if (!m.profile_photo_path) return null;
  try { return toUploadsUrl(m.profile_photo_path); } catch { return null; }
}

// ── Progress ring ──
const progressArc = computed(() => {
  const pct = overview.value?.progress_pct || 0;
  return (pct / 100) * 157; // 2π×25
});

// ── Health ──
const healthStatus = computed(() => {
  const pct     = overview.value?.progress_pct || 0;
  const members = (overview.value?.members || []).length;
  if (pct >= 40 && members > 0) return { label: 'Good',      cls: 'h--good', tagline: 'On track' };
  if (pct >= 10 || members > 0) return { label: 'Fair',      cls: 'h--fair', tagline: 'Some items need attention' };
  return                         { label: 'Getting started', cls: 'h--new',  tagline: 'Ready to go — add tasks & members' };
});

// ── Activity helpers ──
function actorInitials(a) {
  return [a.actor_first_name?.[0], a.actor_last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}
function actorName(a) {
  return [a.actor_first_name, a.actor_last_name].filter(Boolean).join(' ') || 'Someone';
}
function actorColor(firstName) {
  const c = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ec4899','#14b8a6'];
  return c[(firstName || '').charCodeAt(0) % c.length] || c[0];
}
function activityVerb(t) {
  return { created:'created', completed:'completed', assigned:'was assigned to', updated:'updated', status_changed:'updated status of', commented:'commented on' }[t] || 'updated';
}
function timeAgo(d) {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

// ── Load ──────────────────────────────────
async function load() {
  if (!props.project?.id) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/task-projects/${props.project.id}`, {
      params: { agencyId: props.agencyId || undefined },
      skipGlobalLoading: true
    });
    overview.value = { ...(data?.overview || {}), due_date: data?.due_date };
  } catch {
    overview.value = null;
  } finally {
    loading.value = false;
  }
  // Load activity in parallel
  activityLoading.value = true;
  try {
    const res = await api.get(`/task-projects/${props.project.id}/activity`, { params: { limit: 6 }, skipGlobalLoading: true });
    activity.value = Array.isArray(res.data) ? res.data : [];
  } catch { activity.value = []; }
  finally { activityLoading.value = false; }
}

watch(() => props.project?.id, load, { immediate: true });
</script>

<style scoped>
.po {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 4px 24px rgba(15,23,42,.06);
  overflow: hidden;
}

/* ── Hero ─────────────────────────── */
.po-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px 18px;
  background: linear-gradient(135deg, #14532d 0%, #166534 60%, #15803d 100%);
  color: #fff;
}

.po-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.6);
  margin: 0 0 4px;
}

.po-title {
  margin: 0 0 4px;
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}

.po-desc {
  margin: 0 0 6px;
  font-size: 13px;
  color: rgba(255,255,255,0.7);
  max-width: 560px;
}

.po-due {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #86efac;
  margin: 0;
}
.po-due svg { width: 13px; height: 13px; }

.po-hero__actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.po-btn {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.15s, background 0.15s;
  white-space: nowrap;
}
.po-btn--primary { background: #fff; color: #14532d; }
.po-btn--primary:hover { background: #f0fdf4; }
.po-btn--ghost { background: rgba(255,255,255,0.15); color: #fff; }
.po-btn--ghost:hover { background: rgba(255,255,255,0.25); }
.po-btn--outline { background: transparent; border: 1px solid rgba(255,255,255,0.4); color: #fff; }
.po-btn--outline:hover { background: rgba(255,255,255,0.1); }

/* ── Loading ──────────────────────── */
.po-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 32px 24px;
  color: #64748b;
  font-size: 14px;
}
.po-loading-spinner {
  width: 20px; height: 20px;
  border: 2px solid #e2e8f0;
  border-top-color: #15803d;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Members row ──────────────────── */
.po-members {
  padding: 18px 24px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.po-members__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.po-members__count {
  font-size: 11px;
  color: #94a3b8;
  background: #e2e8f0;
  padding: 1px 8px;
  border-radius: 99px;
}

.po-members__avatars {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.po-member {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: default;
}

.po-member__av {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}

.po-member__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.po-member__initials {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.po-member__name {
  font-size: 11px;
  color: #475569;
  text-align: center;
  line-height: 1.3;
  font-weight: 500;
}

.po-member__role {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 6px;
  border-radius: 99px;
}
.role--admin   { background: #dcfce7; color: #16a34a; }
.role--editor  { background: #dbeafe; color: #1d4ed8; }
.role--viewer  { background: #f1f5f9; color: #64748b; }

.po-member__av svg { width: 24px; height: 24px; }

/* ── KPI row ──────────────────────── */
.po-kpis {
  display: flex;
  align-items: stretch;
  gap: 0;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
}

.po-kpi {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-right: 1px solid #f1f5f9;
}
.po-kpi:last-child { border-right: none; }

.po-kpi--progress {
  gap: 10px;
  flex: 1.2 1 0;
}

.po-kpi__ring {
  width: 52px;
  height: 52px;
  flex-shrink: 0;
}

.po-ring-val {
  font-size: 11px;
  font-weight: 700;
  fill: #14532d;
}

.po-kpi__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.po-kpi__icon svg { width: 17px; height: 17px; }

.po-kpi__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.po-kpi__label {
  font-size: 10px;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.po-kpi__val {
  font-size: 1.4rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1;
  display: block;
}

.po-kpi__sub {
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.po-kpi__sub.warn { color: #d97706; }

.po-kpi--health {
  flex: 1.3 1 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 12px 16px;
}

.po-health-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 99px;
}
.po-health-badge svg { width: 13px; height: 13px; }
.h--good { background: #dcfce7; color: #16a34a; }
.h--fair { background: #fef3c7; color: #d97706; }
.h--new  { background: #eff6ff; color: #3b82f6; }

/* ── Body ─────────────────────────── */
.po-body {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 0;
}

.po-col {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-right: 1px solid #f1f5f9;
}
.po-col:last-child { border-right: none; }

.po-card {
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
}
.po-card:last-child { border-bottom: none; }

.po-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.po-section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 5px;
}

.po-section-icon { width: 13px; height: 13px; }

.po-textbtn {
  font-size: 12px;
  color: #0ea5e9;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.po-textbtn:hover { text-decoration: underline; }

/* ── Lists ────────────────────────── */
.po-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.po-list__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #1e293b;
  transition: background 0.12s;
}
.po-list__row:hover { background: #f8fafc; }

.po-list__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}

.po-list__name { flex: 1; }

.po-list__badge {
  font-size: 11px;
  background: #f1f5f9;
  color: #64748b;
  padding: 1px 7px;
  border-radius: 99px;
}

/* ── Activity ─────────────────────── */
.po-activity {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.po-activity__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.po-activity__av {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.po-activity__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 12px;
  color: #475569;
  min-width: 0;
}
.po-activity__body strong { color: #1e293b; }
.po-activity__body em { font-style: normal; font-weight: 500; color: #0f172a; }

.po-time { font-size: 10px; color: #94a3b8; }

/* ── Quick actions ────────────────── */
.po-qa {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.po-qa__btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  width: 100%;
}
.po-qa__btn:hover { background: #f8fafc; }

.po-qa__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.po-qa__icon svg { width: 15px; height: 15px; }

.po-qa__btn > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.po-qa__btn > div strong { font-size: 12px; color: #1e293b; display: block; }
.po-qa__btn > div span  { font-size: 10px; color: #94a3b8; }

/* ── Open project CTA ─────────────── */
.po-open-cta {
  margin: 16px 20px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  background: linear-gradient(135deg, #14532d 0%, #15803d 100%);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.po-open-cta:hover { opacity: 0.92; }

.po-open-cta__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.po-open-cta__text strong { font-size: 13px; color: #fff; display: block; }
.po-open-cta__text span   { font-size: 11px; color: rgba(255,255,255,0.7); }

.po-open-cta__arrow {
  font-size: 20px;
  color: rgba(255,255,255,0.8);
}

/* ── Shared empties ───────────────── */
.po-empty {
  font-size: 12px;
  color: #94a3b8;
  padding: 6px 0;
}

.po-col--right { border-right: none; }

@media (max-width: 900px) {
  .po-body { grid-template-columns: 1fr; }
  .po-kpis { flex-wrap: wrap; }
  .po-kpi  { flex: 1 1 120px; }
}
</style>
