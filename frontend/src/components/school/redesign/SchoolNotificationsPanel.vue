<template>
  <div class="panel">
    <div class="panel-header">
      <div>
        <h2 style="margin:0;">Notifications</h2>
        <div class="muted">Client activity + school-wide announcements (no PHI).</div>
      </div>
      <div style="display:flex; gap: 10px; align-items: center;">
        <button class="btn btn-secondary btn-sm" type="button" @click="openSettings" :disabled="prefsLoading || savingSettings">
          Settings
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">Close</button>
      </div>
    </div>

    <div v-if="createOpen" class="create-card">
      <div class="create-title">Create announcement (banner)</div>
      <div class="create-grid">
        <label class="field">
          <div class="k">Title (optional)</div>
          <input v-model="draftTitle" type="text" maxlength="255" placeholder="e.g., School closed Monday" />
        </label>
        <label class="field">
          <div class="k">Starts</div>
          <input v-model="draftStartsAt" type="datetime-local" />
        </label>
        <label class="field">
          <div class="k">Ends (max 2 weeks)</div>
          <input v-model="draftEndsAt" type="datetime-local" />
        </label>
        <label class="field field-wide">
          <div class="k">Message</div>
          <textarea v-model="draftMessage" rows="3" maxlength="1200" placeholder="Type announcement…" />
        </label>
      </div>
      <div class="create-actions">
        <button class="btn btn-primary" type="button" @click="create" :disabled="creating || !canSubmitCreate">
          {{ creating ? 'Posting…' : 'Post announcement' }}
        </button>
        <button class="btn btn-secondary" type="button" @click="createOpen = false" :disabled="creating">
          Cancel
        </button>
        <div v-if="createError" class="error">{{ createError }}</div>
      </div>
    </div>

    <div class="toolbar">
      <button
        v-if="canCreateAnnouncements"
        class="btn btn-secondary btn-sm"
        type="button"
        @click="toggleCreate"
      >
        {{ createOpen ? 'Hide create' : 'Create announcement' }}
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="refresh" :disabled="loading">
        {{ loading ? 'Refreshing…' : 'Refresh' }}
      </button>
      <div class="spacer" />
      <div class="muted-small" v-if="unreadCount > 0">
        {{ unreadCount }} unread
      </div>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="feed">
      <div v-if="items.length === 0" class="empty">No notifications yet.</div>
      <div v-for="it in items" :key="it.id" class="item" :class="{ unread: isUnread(it) }">
        <div class="item-top">
          <div class="item-title">{{ it.title || (it.kind === 'client_event' ? 'Client update' : 'Announcement') }}</div>
          <div class="item-meta">
            <span class="mono">{{ formatWhen(it.created_at) }}</span>
            <span v-if="it.actor_name">• {{ it.actor_name }}</span>
          </div>
        </div>
        <div class="item-msg">{{ formatMessage(it) }}</div>
      </div>
    </div>
  </div>

  <div v-if="showSettings" class="modal-overlay" @click.self="closeSettings">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h3 style="margin:0;">Notification settings</h3>
        <button class="btn-close" type="button" title="Close" @click="closeSettings">×</button>
      </div>
      <div class="modal-body">
        <div class="muted" style="margin-bottom: 12px;">
          These control which client notifications show in this School Portal notifications feed.
        </div>

        <label class="toggle">
          <input type="checkbox" v-model="settings.clientUpdates" :disabled="savingSettings" />
          <span class="toggle-label">Client updates</span>
        </label>

        <label class="toggle" style="padding-left: 18px;">
          <input type="checkbox" v-model="settings.orgSwaps" :disabled="savingSettings || !settings.clientUpdates" />
          <span class="toggle-label">Organization changes</span>
          <span class="muted-small" style="margin-left: 8px;">(organization_id swapped)</span>
        </label>

        <label class="toggle">
          <input type="checkbox" v-model="settings.clientComments" :disabled="savingSettings" />
          <span class="toggle-label">Client comments</span>
        </label>

        <label class="toggle">
          <input type="checkbox" v-model="settings.clientMessages" :disabled="savingSettings" />
          <span class="toggle-label">Client messages</span>
        </label>

        <div style="display:flex; gap: 10px; margin-top: 14px; align-items:center;">
          <button class="btn btn-primary" type="button" @click="saveSettings" :disabled="savingSettings">
            {{ savingSettings ? 'Saving…' : 'Save' }}
          </button>
          <div v-if="settingsSaved" class="muted-small">Saved</div>
          <div v-if="settingsError" class="error">{{ settingsError }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  clientLabelMode: { type: String, default: 'codes' } // 'codes' | 'initials'
});

const emit = defineEmits(['close', 'updated']);

const authStore = useAuthStore();
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
// Anyone with access to the school portal may post a school-wide banner announcement.
const canCreateAnnouncements = computed(() => !!authStore.user?.id);

const loading = ref(false);
const error = ref('');
const items = ref([]);

const prefsLoading = ref(false);
const lastSeenIso = ref(''); // for this org

const parseJsonMaybe = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const showSettings = ref(false);
const savingSettings = ref(false);
const settingsSaved = ref(false);
const settingsError = ref('');
const settings = ref({
  clientUpdates: true,
  orgSwaps: true,
  clientComments: true,
  clientMessages: true
});

const loadLastSeen = async () => {
  try {
    const uid = authStore.user?.id;
    if (!uid) return;
    prefsLoading.value = true;
    const pref = (await api.get(`/users/${uid}/preferences`)).data || {};
    const raw = pref.school_portal_notifications_progress;
    const m = parseJsonMaybe(raw) || raw;
    const key = String(props.schoolOrganizationId);
    const v = m && typeof m === 'object' ? String(m[key] || '') : '';
    lastSeenIso.value = v;
  } catch {
    lastSeenIso.value = '';
  } finally {
    prefsLoading.value = false;
  }
};

const loadCategories = async () => {
  try {
    const uid = authStore.user?.id;
    if (!uid) return {};
    const pref = (await api.get(`/users/${uid}/preferences`)).data || {};
    const raw = pref.notification_categories;
    const m = parseJsonMaybe(raw) || raw;
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
};

const openSettings = async () => {
  settingsError.value = '';
  settingsSaved.value = false;
  showSettings.value = true;
  const cats = await loadCategories();
  settings.value = {
    clientUpdates: cats.school_portal_client_updates !== false,
    orgSwaps: cats.school_portal_client_update_org_swaps !== false,
    clientComments: cats.school_portal_client_comments !== false,
    clientMessages: cats.school_portal_client_messages !== false
  };
};

const closeSettings = () => {
  showSettings.value = false;
  settingsError.value = '';
  settingsSaved.value = false;
};

const saveSettings = async () => {
  try {
    const uid = authStore.user?.id;
    if (!uid) return;
    savingSettings.value = true;
    settingsError.value = '';
    settingsSaved.value = false;

    const existing = await loadCategories();
    const next = { ...(existing || {}) };
    next.school_portal_client_updates = !!settings.value.clientUpdates;
    next.school_portal_client_update_org_swaps = !!settings.value.orgSwaps;
    next.school_portal_client_comments = !!settings.value.clientComments;
    next.school_portal_client_messages = !!settings.value.clientMessages;

    await api.put(`/users/${uid}/preferences`, {
      notification_categories: next
    });

    settingsSaved.value = true;
    setTimeout(() => { settingsSaved.value = false; }, 1500);
    await refresh();
  } catch (e) {
    settingsError.value = e.response?.data?.error?.message || 'Failed to save settings';
  } finally {
    savingSettings.value = false;
  }
};

const markSeenNow = async () => {
  try {
    const uid = authStore.user?.id;
    if (!uid) return;
    const nowIso = new Date().toISOString();

    // Merge with existing map (best-effort).
    const pref = (await api.get(`/users/${uid}/preferences`)).data || {};
    const raw = pref.school_portal_notifications_progress;
    const m = parseJsonMaybe(raw) || raw;
    const next = (m && typeof m === 'object') ? { ...m } : {};
    next[String(props.schoolOrganizationId)] = nowIso;

    await api.put(`/users/${uid}/preferences`, {
      school_portal_notifications_progress: next
    });
    lastSeenIso.value = nowIso;
  } catch {
    // ignore (should never block viewing)
  }
};

const fetchFeed = async () => {
  if (!props.schoolOrganizationId) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get(`/school-portal/${props.schoolOrganizationId}/notifications/feed`);
    items.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load notifications';
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const refresh = async () => {
  await Promise.all([loadLastSeen(), fetchFeed()]);
  // Let parent update card badge/snippet.
  emit('updated');
};

const lastSeenMs = computed(() => {
  try {
    const t = lastSeenIso.value ? new Date(lastSeenIso.value).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
});

const isUnread = (it) => {
  const t = it?.created_at ? new Date(it.created_at).getTime() : 0;
  return Number.isFinite(t) && t > lastSeenMs.value;
};

const unreadCount = computed(() => (items.value || []).filter(isUnread).length);

const formatClientLabel = (it) => {
  const code = String(it?.client_identifier_code || '').trim();
  const initials = String(it?.client_initials || '').trim();
  if (props.clientLabelMode === 'initials') return initials || code || '';
  return code || initials || '';
};

const formatMessage = (it) => {
  const raw = String(it?.message || '').trim();
  if (String(it?.kind || '').toLowerCase() !== 'client_event') return raw;
  const label = formatClientLabel(it);
  if (!label) return raw;
  const idx = raw.indexOf(':');
  const suffix = idx >= 0 ? raw.slice(idx + 1).trim() : raw;
  return suffix ? `${label}: ${suffix}` : label;
};

const formatWhen = (ts) => {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || '');
  }
};

// Create announcement UI
const createOpen = ref(false);
const draftTitle = ref('');
const draftMessage = ref('');
const draftStartsAt = ref('');
const draftEndsAt = ref('');
const creating = ref(false);
const createError = ref('');

const initCreateDefaults = () => {
  const now = new Date();
  const ends = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const toLocalInput = (d) => {
    // yyyy-MM-ddTHH:mm
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };
  draftStartsAt.value = toLocalInput(now);
  draftEndsAt.value = toLocalInput(ends);
};

const toggleCreate = () => {
  createOpen.value = !createOpen.value;
  createError.value = '';
  if (createOpen.value) initCreateDefaults();
};

const canSubmitCreate = computed(() => {
  if (!canCreateAnnouncements.value) return false;
  if (!draftMessage.value.trim()) return false;
  if (!draftStartsAt.value || !draftEndsAt.value) return false;
  return true;
});

const create = async () => {
  if (!canSubmitCreate.value) return;
  creating.value = true;
  createError.value = '';
  try {
    await api.post(`/school-portal/${props.schoolOrganizationId}/announcements`, {
      title: draftTitle.value.trim() || null,
      message: draftMessage.value.trim(),
      starts_at: new Date(draftStartsAt.value),
      ends_at: new Date(draftEndsAt.value)
    });
    draftTitle.value = '';
    draftMessage.value = '';
    createOpen.value = false;
    await refresh();
  } catch (e) {
    createError.value = e.response?.data?.error?.message || 'Failed to post announcement';
  } finally {
    creating.value = false;
  }
};

watch(
  () => props.schoolOrganizationId,
  async () => {
    items.value = [];
    error.value = '';
    lastSeenIso.value = '';
    await refresh();
    await markSeenNow();
  },
  { immediate: true }
);
</script>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 14px;
}
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.muted {
  color: var(--text-secondary);
}
.muted-small {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.spacer {
  flex: 1;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  border-radius: 12px;
  padding: 18px;
  max-width: 520px;
  width: 92vw;
  border: 1px solid var(--border);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
}
.btn-close:hover {
  color: var(--text-primary);
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  user-select: none;
}
.toggle-label {
  font-weight: 800;
  color: var(--text-primary);
}

.feed {
  display: grid;
  gap: 10px;
}
.item {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 10px 12px;
}
.item.unread {
  border-color: rgba(47, 143, 131, 0.45);
  background: rgba(47, 143, 131, 0.08);
}
.item-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.item-title {
  font-weight: 900;
}
.item-meta {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.item-msg {
  margin-top: 6px;
  white-space: pre-wrap;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 800;
}
.empty {
  color: var(--text-secondary);
  padding: 8px 2px;
}
.error {
  color: #c33;
  font-weight: 700;
}
.create-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  padding: 12px;
  margin-bottom: 12px;
}
.create-title {
  font-weight: 900;
  margin-bottom: 10px;
}
.create-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.field {
  display: grid;
  gap: 6px;
}
.field-wide {
  grid-column: 1 / -1;
}
.k {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 900;
}
input, textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}
.create-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
@media (max-width: 900px) {
  .create-grid {
    grid-template-columns: 1fr;
  }
}
</style>

