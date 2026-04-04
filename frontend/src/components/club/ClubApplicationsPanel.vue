<template>
  <div class="cap-panel" :class="{ 'cap-panel--compact': props.compact }">
    <!-- ── Header ─────────────────────────────────────────── -->
    <div class="cap-header">
      <div class="cap-header-left">
        <h2 class="cap-title">Member Applications</h2>
        <span v-if="pendingCount > 0" class="cap-badge">{{ pendingCount }} pending</span>
      </div>
      <div class="cap-header-actions">
        <select v-model="statusFilter" class="cap-select cap-select--sm" @change="loadApplications">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="all">All</option>
        </select>
        <button class="btn btn-secondary btn-sm" @click="showInvitePanel = !showInvitePanel">
          {{ showInvitePanel ? 'Hide Invites' : '+ Create Invite Link' }}
        </button>
      </div>
    </div>

    <!-- ── Invite Panel ──────────────────────────────────── -->
    <div v-if="showInvitePanel" class="cap-invite-panel">
      <h3 class="cap-invite-title">Invite Links</h3>
      <div class="cap-invite-form">
        <div class="cap-field">
          <label>Label <span class="cap-opt">(internal, e.g. "Spring 2026")</span></label>
          <input v-model="newInvite.label" type="text" class="cap-input" placeholder="Optional" />
        </div>
        <div class="cap-field">
          <label>Pre-fill email <span class="cap-opt">(optional)</span></label>
          <input v-model="newInvite.email" type="email" class="cap-input" placeholder="recruit@email.com" />
        </div>
        <div class="cap-field">
          <label>Expires</label>
          <input v-model="newInvite.expiresAt" type="datetime-local" class="cap-input" />
        </div>
        <div class="cap-field">
          <label class="cap-toggle-label">
            <input v-model="newInvite.autoApprove" type="checkbox" class="cap-check" />
            Auto-approve (skip manager review)
          </label>
        </div>
        <button class="btn btn-primary btn-sm" :disabled="creatingInvite" @click="createInvite">
          {{ creatingInvite ? 'Creating…' : 'Generate Link' }}
        </button>
        <div v-if="inviteError" class="cap-error">{{ inviteError }}</div>
      </div>

      <!-- Active invites list -->
      <div v-if="invitesLoading" class="cap-hint">Loading invites…</div>
      <div v-else-if="invites.length" class="cap-invite-list">
        <div v-for="inv in invites" :key="inv.id" class="cap-invite-row">
          <div class="cap-invite-meta">
            <span class="cap-invite-label">{{ inv.label || 'Invite link' }}</span>
            <span v-if="inv.email" class="cap-invite-email">→ {{ inv.email }}</span>
            <span v-if="inv.auto_approve" class="cap-tag cap-tag--auto">auto-approve</span>
            <span v-if="inv.used_at" class="cap-tag cap-tag--used">used</span>
          </div>
          <div class="cap-invite-actions">
            <button class="btn btn-ghost btn-xs" @click="copyLink(inv.joinUrl)">
              {{ copied === inv.id ? '✓ Copied' : 'Copy Link' }}
            </button>
            <button class="btn btn-danger btn-xs" @click="revokeInvite(inv.id)">Revoke</button>
          </div>
        </div>
      </div>
      <div v-else class="cap-hint">No active invite links.</div>
    </div>

    <!-- ── Applications List ─────────────────────────────── -->
    <div v-if="appsLoading" class="cap-hint">Loading applications…</div>
    <div v-else-if="appsError" class="cap-error">{{ appsError }}</div>
    <div v-else-if="!applications.length" class="cap-empty">
      No {{ statusFilter === 'all' ? '' : statusFilter }} applications.
    </div>
    <div v-else class="cap-apps-list">
      <div
        v-for="app in applications"
        :key="app.id"
        class="cap-app-row"
        :class="`cap-app-row--${app.status}`"
      >
        <div class="cap-app-main">
          <div class="cap-app-name">{{ app.first_name }} {{ app.last_name }}</div>
          <div class="cap-app-meta">
            <span>{{ app.email }}</span>
            <span v-if="app.phone"> · {{ app.phone }}</span>
            <span v-if="app.gender"> · {{ app.gender }}</span>
            <span v-if="app.date_of_birth"> · DOB {{ formatDob(app.date_of_birth) }}</span>
            <span v-if="app.weight_lbs"> · {{ app.weight_lbs }} lbs</span>
            <span v-if="app.height_inches"> · {{ formatHeight(app.height_inches) }}</span>
          </div>
          <div class="cap-app-source">
            <span v-if="app.invite_label" class="cap-tag">Invite: {{ app.invite_label }}</span>
            <span v-else-if="app.referrer_name" class="cap-tag cap-tag--ref">Referred by {{ app.referrer_name }}</span>
            <span v-else class="cap-tag cap-tag--direct">Direct</span>
            <span class="cap-app-date">Applied {{ formatDate(app.applied_at) }}</span>
          </div>
          <p v-if="app.heard_about_club" class="cap-app-answer"><strong>How they heard:</strong> {{ app.heard_about_club }}</p>
          <p v-if="app.running_fitness_background" class="cap-app-answer"><strong>Background:</strong> {{ app.running_fitness_background }}</p>
          <p v-if="trainingLoadLine(app)" class="cap-app-answer"><strong>Current load:</strong> {{ trainingLoadLine(app) }}</p>
          <p v-if="app.current_fitness_activities" class="cap-app-answer"><strong>Current activities:</strong> {{ app.current_fitness_activities }}</p>
          <p v-if="waiverLine(app)" class="cap-app-answer"><strong>Waiver:</strong> {{ waiverLine(app) }}</p>
        </div>

        <!-- Status badge -->
        <div class="cap-app-right">
          <span v-if="app.status !== 'pending'" class="cap-status" :class="`cap-status--${app.status}`">
            {{ app.status }}
          </span>
          <template v-else>
            <div v-if="reviewingId === app.id" class="cap-review-form">
              <textarea
                v-model="reviewNotes[app.id]"
                class="cap-textarea"
                placeholder="Optional notes…"
                rows="2"
              ></textarea>
              <div class="cap-review-btns">
                <button class="btn btn-primary btn-sm" :disabled="actionLoading" @click="review(app.id, 'approve')">
                  ✓ Approve
                </button>
                <button class="btn btn-danger btn-sm" :disabled="actionLoading" @click="review(app.id, 'deny')">
                  ✗ Deny
                </button>
                <button class="btn btn-ghost btn-sm" @click="reviewingId = null">Cancel</button>
              </div>
              <div v-if="actionError" class="cap-error">{{ actionError }}</div>
            </div>
            <button v-else class="btn btn-secondary btn-sm" @click="reviewingId = app.id">
              Review
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clubId:  { type: [Number, String], required: true },
  orgSlug: { type: String, default: 'ssc' },
  compact: { type: Boolean, default: false }
});
const emit = defineEmits(['approved']);

// ── Applications state ────────────────────────────────────────────
const applications  = ref([]);
const appsLoading   = ref(false);
const appsError     = ref('');
const statusFilter  = ref('pending');
const pendingCount  = ref(0);
const reviewingId   = ref(null);
const reviewNotes   = ref({});
const actionLoading = ref(false);
const actionError   = ref('');

// ── Invites state ─────────────────────────────────────────────────
const showInvitePanel = ref(false);
const invites         = ref([]);
const invitesLoading  = ref(false);
const inviteError     = ref('');
const creatingInvite  = ref(false);
const copied          = ref(null);
const newInvite = ref({ label: '', email: '', expiresAt: '', autoApprove: false });

const loadApplications = async () => {
  appsLoading.value = true;
  appsError.value = '';
  try {
    const { data } = await api.get(
      `/summit-stats/clubs/${props.clubId}/applications`,
      { params: { status: statusFilter.value }, skipGlobalLoading: true }
    );
    applications.value = data?.applications || [];
  } catch (e) {
    appsError.value = e?.response?.data?.error?.message || 'Failed to load applications';
  } finally {
    appsLoading.value = false;
  }
};

const loadPendingCount = async () => {
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/applications/count`, { skipGlobalLoading: true });
    pendingCount.value = data?.count || 0;
  } catch { /* non-fatal */ }
};

const loadInvites = async () => {
  invitesLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/invites`, { skipGlobalLoading: true });
    invites.value = data?.invites || [];
  } catch { /* non-fatal */ } finally {
    invitesLoading.value = false;
  }
};

const review = async (appId, action) => {
  actionLoading.value = true;
  actionError.value = '';
  try {
    await api.put(`/summit-stats/clubs/${props.clubId}/applications/${appId}`, {
      action,
      notes: reviewNotes.value[appId] || ''
    });
    reviewingId.value = null;
    await loadApplications();
    await loadPendingCount();
    if (action === 'approve') emit('approved');
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Action failed';
  } finally {
    actionLoading.value = false;
  }
};

const createInvite = async () => {
  creatingInvite.value = true;
  inviteError.value = '';
  try {
    await api.post(`/summit-stats/clubs/${props.clubId}/invites`, {
      label:       newInvite.value.label || null,
      email:       newInvite.value.email || null,
      autoApprove: newInvite.value.autoApprove,
      expiresAt:   newInvite.value.expiresAt || null
    });
    newInvite.value = { label: '', email: '', expiresAt: '', autoApprove: false };
    await loadInvites();
  } catch (e) {
    inviteError.value = e?.response?.data?.error?.message || 'Failed to create invite';
  } finally {
    creatingInvite.value = false;
  }
};

const revokeInvite = async (id) => {
  try {
    await api.delete(`/summit-stats/clubs/${props.clubId}/invites/${id}`);
    invites.value = invites.value.filter(i => i.id !== id);
  } catch { /* non-fatal */ }
};

const copyLink = async (url) => {
  try {
    await navigator.clipboard.writeText(url);
    copied.value = invites.value.find(i => i.joinUrl === url)?.id;
    setTimeout(() => { copied.value = null; }, 2500);
  } catch { /* fallback */ }
};

// ── Formatting helpers ────────────────────────────────────────────
const formatDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
/** Birth date from API may be ISO (1997-10-23T00:00:00.000Z) — show as local calendar date, not raw ISO. */
const formatDob = (raw) => {
  if (!raw) return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    if (y && mo >= 1 && mo <= 12 && day >= 1 && day <= 31) {
      return new Date(y, mo - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? s : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const formatHeight = (inches) => {
  if (!inches) return '';
  const ft = Math.floor(Number(inches) / 12);
  const ins = Math.round(Number(inches) % 12);
  return `${ft}'${ins}"`;
};
const formatDecimal = (value, digits = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
};
const trainingLoadLine = (app) => {
  const parts = [];
  if (app?.average_miles_per_week != null && app.average_miles_per_week !== '') {
    parts.push(`${formatDecimal(app.average_miles_per_week)} mi/week`);
  }
  if (app?.average_hours_per_week != null && app.average_hours_per_week !== '') {
    parts.push(`${formatDecimal(app.average_hours_per_week)} hr/week`);
  }
  return parts.join(' • ');
};
const waiverLine = (app) => {
  const signedName = String(app?.waiver_signature_name || '').trim();
  const signedAt = app?.waiver_agreed_at ? formatDate(app.waiver_agreed_at) : '';
  if (!signedName && !signedAt) return '';
  if (signedName && signedAt) return `Signed by ${signedName} on ${signedAt}`;
  if (signedName) return `Signed by ${signedName}`;
  return `Signed on ${signedAt}`;
};

onMounted(async () => {
  await Promise.all([loadApplications(), loadPendingCount(), loadInvites()]);
});
</script>

<style scoped>
.cap-panel {
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 20px 24px;
  margin-top: 24px;
}

.cap-panel--compact {
  border-radius: 10px;
  padding: 12px 14px;
  margin-top: 8px;
}

/* Header */
.cap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.cap-panel--compact .cap-header {
  margin-bottom: 10px;
}
.cap-header-left { display: flex; align-items: center; gap: 10px; }
.cap-title { margin: 0; font-size: 1rem; font-weight: 700; }
.cap-panel--compact .cap-title { font-size: 0.9rem; }
.cap-badge {
  display: inline-flex;
  align-items: center;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  padding: 2px 8px;
}
.cap-header-actions { display: flex; align-items: center; gap: 8px; }
.cap-select { border: 1px solid var(--border, #e2e8f0); border-radius: 6px; padding: 5px 8px; font-size: 13px; background: #fff; }
.cap-select--sm { font-size: 12px; }

/* Invite panel */
.cap-invite-panel {
  background: var(--surface-2, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.cap-panel--compact .cap-invite-panel {
  padding: 10px;
  margin-bottom: 10px;
}
.cap-invite-title { margin: 0 0 12px; font-size: 14px; font-weight: 700; }
.cap-invite-form { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.cap-field { display: flex; flex-direction: column; gap: 4px; }
.cap-field label { font-size: 12px; font-weight: 600; }
.cap-opt { font-weight: 400; color: var(--text-muted, #94a3b8); }
.cap-input { padding: 7px 10px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; font-size: 13px; }
.cap-toggle-label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.cap-check { width: 16px; height: 16px; }
.cap-invite-list { display: flex; flex-direction: column; gap: 8px; }
.cap-invite-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 8px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.cap-invite-row:last-child { border-bottom: none; }
.cap-invite-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; }
.cap-invite-label { font-weight: 600; }
.cap-invite-email { color: var(--text-secondary, #64748b); }
.cap-invite-actions { display: flex; gap: 6px; flex-shrink: 0; }

/* Applications list */
.cap-apps-list { display: flex; flex-direction: column; gap: 0; }
.cap-app-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-subtle, #f0f4f8);
}

.cap-panel--compact .cap-app-row {
  padding: 9px 0;
  gap: 10px;
}
.cap-app-row:last-child { border-bottom: none; }
.cap-app-row--approved { opacity: .7; }
.cap-app-row--denied  { opacity: .55; }
.cap-app-main { flex: 1; min-width: 0; }
.cap-app-name { font-weight: 700; font-size: 14px; }
.cap-panel--compact .cap-app-name { font-size: 13px; }
.cap-app-meta { font-size: 12px; color: var(--text-secondary, #64748b); margin-top: 3px; }
.cap-panel--compact .cap-app-meta { font-size: 11px; margin-top: 2px; }
.cap-app-source { display: flex; align-items: center; gap: 8px; margin-top: 5px; flex-wrap: wrap; }
.cap-panel--compact .cap-app-source { margin-top: 3px; gap: 6px; }
.cap-app-date { font-size: 11px; color: var(--text-muted, #94a3b8); }
.cap-app-answer {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text, #334155);
  white-space: pre-wrap;
}
.cap-app-right { flex-shrink: 0; }

/* Tags */
.cap-tag {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600;
  background: var(--surface-2, #f1f5f9);
  color: var(--text-secondary, #64748b);
}
.cap-tag--ref    { background: #eff6ff; color: #1d4ed8; }
.cap-tag--direct { background: #f0fdf4; color: #166534; }
.cap-tag--auto   { background: #fef3c7; color: #92400e; }
.cap-tag--used   { background: #f1f5f9; color: #94a3b8; }

/* Status */
.cap-status {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;
}
.cap-status--approved { background: #f0fdf4; color: #166534; }
.cap-status--denied   { background: #fef2f2; color: #991b1b; }

/* Review form */
.cap-review-form { display: flex; flex-direction: column; gap: 8px; min-width: 200px; }
.cap-textarea { padding: 7px 10px; border: 1px solid var(--border, #e2e8f0); border-radius: 6px; font-size: 13px; resize: vertical; }
.cap-review-btns { display: flex; gap: 6px; }

/* Misc */
.cap-hint  { font-size: 13px; color: var(--text-muted, #94a3b8); padding: 8px 0; }
.cap-empty { font-size: 13px; color: var(--text-muted, #94a3b8); padding: 16px 0; text-align: center; }
.cap-error { font-size: 13px; color: #ef4444; margin-top: 6px; }

/* Buttons */
.btn { display: inline-flex; align-items: center; gap: 4px; padding: 7px 14px; border-radius: 7px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: opacity .15s; }
.btn-primary  { background: var(--primary, #1d4ed8); color: #fff; }
.btn-primary:disabled { opacity: .6; cursor: not-allowed; }
.btn-secondary{ background: var(--surface-2, #f1f5f9); color: var(--text, #0f172a); border: 1px solid var(--border, #e2e8f0); }
.btn-danger   { background: #ef4444; color: #fff; }
.btn-ghost    { background: none; border: 1px solid var(--border, #e2e8f0); color: var(--text-secondary, #64748b); }
.btn-sm  { padding: 5px 12px; font-size: 12px; }
.btn-xs  { padding: 3px 9px; font-size: 11px; }
</style>
