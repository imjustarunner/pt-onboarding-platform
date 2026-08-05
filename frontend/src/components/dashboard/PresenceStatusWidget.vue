<template>
  <div class="presence-widget" :class="{ 'presence-widget--compact': compact }">
    <div v-if="!compact" class="presence-widget-header">
      <span class="presence-widget-title">{{ headerLabel }}</span>
      <router-link v-if="canViewTeamBoard" to="/admin/presence" class="presence-team-link">View Team Board</router-link>
    </div>
    <div class="presence-widget-body" :class="{ 'presence-widget-body--compact': compact }">
      <button
        v-if="canUseAwayPrompt"
        type="button"
        class="presence-away-btn"
        @click="openAwayPrompt"
      >
        Set status…
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
  isPrivilegedPresenceRole,
  normalizePresenceDisplayLabel,
  teamBoardStatusLabel
} from '../../utils/presenceStatus';
import api from '../../services/api';

defineProps({
  compact: { type: Boolean, default: false }
});

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

const presenceRow = ref(null);
const loading = ref(true);
const error = ref('');

const currentStatusLabel = computed(() => {
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
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load';
  } finally {
    loading.value = false;
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

.presence-widget:not(.presence-widget--compact) .presence-away-btn {
  padding: 8px 14px;
  font-size: 0.9rem;
  border-radius: 8px;
  align-self: flex-start;
}
</style>
