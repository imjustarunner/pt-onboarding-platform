<template>
  <div class="presence-widget" :class="{ 'presence-widget--compact': compact }">
    <div v-if="!compact" class="presence-widget-header">
      <span class="presence-widget-title">{{ headerLabel }}</span>
      <router-link v-if="canViewTeamBoard" to="/admin/presence" class="presence-team-link">View Team Board</router-link>
    </div>
    <div class="presence-widget-body" :class="{ 'presence-widget-body--compact': compact }">
      <select
        :value="currentOptionKey"
        class="presence-select"
        :class="{ 'presence-select--compact': compact }"
        :disabled="saving"
        @change="onChange"
      >
        <option value="">{{ compact ? 'Status…' : '— Set status —' }}</option>
        <option
          v-for="opt in statusOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
      <button
        v-if="canUseAwayPrompt"
        type="button"
        class="presence-away-btn"
        @click="openAwayPrompt"
      >
        {{ compact ? 'Set status…' : 'Set Away status…' }}
      </button>
      <p v-if="loading && !compact" class="presence-muted">Loading…</p>
      <p v-else-if="error" class="presence-error">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { usePresenceSessionStore } from '../../store/presenceSession';
import {
  IN_PRESENCE_OPTIONS,
  inPresenceOptionKey,
  isPrivilegedPresenceRole,
  labelForInPresenceOptionKey,
  normalizePresenceDisplayLabel,
  teamBoardStatusLabel
} from '../../utils/presenceStatus';
import api from '../../services/api';

defineProps({
  compact: { type: Boolean, default: false }
});

const emit = defineEmits(['updated']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const presenceSession = usePresenceSessionStore();
const canViewTeamBoard = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  if (role !== 'admin' && role !== 'support') return false;
  const flags = agencyStore.currentAgency?.feature_flags || agencyStore.currentAgency?.featureFlags || {};
  const f = typeof flags === 'object' ? flags : (() => { try { return JSON.parse(flags || '{}'); } catch { return {}; } })();
  return f?.presenceEnabled === true;
});

const canUseAwayPrompt = computed(() =>
  isPrivilegedPresenceRole(authStore.user?.role) || presenceSession.shouldUseStatusPrompt(authStore.user?.role)
);

const openAwayPrompt = () => {
  presenceSession.openManualTimeoutPrompt();
};

const statusOptions = IN_PRESENCE_OPTIONS;

const currentOptionKey = ref('');
const presenceRow = ref(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

const currentStatusLabel = computed(() => {
  if (currentOptionKey.value) return labelForInPresenceOptionKey(currentOptionKey.value);
  const row = presenceRow.value;
  if (!row) return '';
  const rich = normalizePresenceDisplayLabel(row.presence_display_label || row.display_label || '');
  if (rich) return rich;
  return teamBoardStatusLabel(row) || '';
});

const headerLabel = computed(() => {
  if (loading.value) return 'Status';
  return currentStatusLabel.value || 'Status';
});

const fetchStatus = async () => {
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/presence/status/me');
    presenceRow.value = res.data || {};
    currentOptionKey.value = inPresenceOptionKey(presenceRow.value);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load';
    currentOptionKey.value = '';
  } finally {
    loading.value = false;
  }
};

const onChange = async (event) => {
  const key = event.target?.value || '';
  if (!key) return;
  const opt = statusOptions.find((o) => o.value === key);
  if (!opt) return;

  try {
    saving.value = true;
    error.value = '';
    await api.put('/presence/status/me', {
      status: opt.status || opt.value,
      display_label: opt.displayLabel || opt.label,
      reason: null,
      note: null
    });
    currentOptionKey.value = key;
    presenceRow.value = {
      ...(presenceRow.value || {}),
      presence_status: opt.status || opt.value,
      presence_display_label: opt.displayLabel || opt.label,
      display_label: opt.displayLabel || opt.label
    };
    emit('updated');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update';
    event.target.value = currentOptionKey.value;
  } finally {
    saving.value = false;
  }
};

onMounted(fetchStatus);
</script>

<style scoped>
.presence-widget {
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 16px;
  box-shadow: var(--shadow);
}

.presence-widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.presence-team-link {
  font-size: 0.8rem;
  color: var(--primary, #2563eb);
  text-decoration: none;
}
.presence-team-link:hover {
  text-decoration: underline;
}

.presence-widget-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.presence-widget-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.presence-select {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 0.9rem;
  min-width: 180px;
}

.presence-select:disabled {
  opacity: 0.7;
}

.presence-muted {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.presence-error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--danger);
}

.presence-widget--compact {
  background: transparent;
  border: none;
  padding: 0;
  box-shadow: none;
}

.presence-widget-body--compact {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.presence-select--compact {
  min-width: 0;
  width: auto;
  max-width: 168px;
  padding: 5px 8px;
  font-size: 11px;
  border-radius: 8px;
}

.presence-away-btn {
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 28%, #e2e8f0);
  background: #fff;
  color: var(--ops-primary, #1f6b4a);
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
}

.presence-away-btn:hover {
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 8%, #fff);
}
</style>
