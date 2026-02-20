<template>
  <div class="presence-preview">
    <div class="presence-preview-header">
      <span class="presence-preview-title">Team Presence</span>
      <router-link to="/admin/presence" class="presence-preview-link">View full board</router-link>
    </div>
    <div v-if="loading" class="presence-preview-loading">Loading…</div>
    <div v-else-if="error" class="presence-preview-error">{{ error }}</div>
    <div v-else class="presence-preview-avatars">
      <div
        v-for="person in people"
        :key="person.id"
        class="avatar-wrap"
        :title="`${person.display_name} – ${statusLabel(person.presence_status) || 'No status'}`"
      >
        <div class="avatar" :class="{ 'has-photo': person.profile_photo_url }">
          <img
            v-if="person.profile_photo_url"
            :src="avatarUrl(person.profile_photo_url)"
            :alt="person.display_name"
            class="avatar-img"
            loading="lazy"
          />
          <span v-else class="avatar-initial">{{ avatarInitial(person) }}</span>
        </div>
        <span class="status-dot" :class="statusDotClass(person.presence_status)" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const POLL_INTERVAL_MS = 15 * 1000;
let pollTimer = null;

const statusOptions = [
  { value: 'in_available', label: 'In – Available' },
  { value: 'in_heads_down', label: 'In – Heads Down' },
  { value: 'in_available_for_phone', label: 'In – Available for Phone' },
  { value: 'out_quick', label: 'Out – Quick' },
  { value: 'out_am', label: 'Out – AM' },
  { value: 'out_pm', label: 'Out – PM' },
  { value: 'out_full_day', label: 'Out – Full Day' },
  { value: 'traveling_offsite', label: 'Traveling / Offsite' }
];

const loading = ref(true);
const error = ref('');
const people = ref([]);

const avatarUrl = (rel) => toUploadsUrl(rel);

const avatarInitial = (p) => {
  const f = String(p.first_name || '').trim();
  const l = String(p.last_name || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || '?';
};

const statusLabel = (status) => {
  const opt = statusOptions.find((o) => o.value === status);
  return opt ? opt.label : '';
};

const statusDotClass = (status) => {
  if (!status) return 'dot-none';
  if (['in_available', 'in_heads_down', 'in_available_for_phone'].includes(status)) return 'dot-in';
  if (status === 'out_quick') return 'dot-out-quick';
  if (status === 'traveling_offsite') return 'dot-traveling';
  if (['out_am', 'out_pm', 'out_full_day'].includes(status)) return 'dot-out';
  return 'dot-none';
};

const fetchPresence = async (showLoading = true) => {
  try {
    if (showLoading) loading.value = true;
    error.value = '';
    const res = await api.get('/presence');
    people.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load';
    people.value = [];
  } finally {
    loading.value = false;
  }
};

const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') fetchPresence(false);
};

onMounted(() => {
  fetchPresence(true);
  pollTimer = setInterval(() => fetchPresence(false), POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<style scoped>
.presence-preview {
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  padding: 16px;
  box-shadow: var(--shadow);
}

.presence-preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.presence-preview-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.presence-preview-link {
  font-size: 0.8rem;
  color: var(--primary);
  text-decoration: none;
}

.presence-preview-link:hover {
  text-decoration: underline;
}

.presence-preview-loading,
.presence-preview-error {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.presence-preview-error {
  color: var(--danger);
}

.presence-preview-avatars {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.avatar-wrap {
  position: relative;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initial {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}

.status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid white;
}

.status-dot.dot-in {
  background: #22c55e;
}

.status-dot.dot-out-quick {
  background: #eab308;
}

.status-dot.dot-traveling {
  background: #3b82f6;
}

.status-dot.dot-out {
  background: #ef4444;
}

.status-dot.dot-none {
  background: var(--border);
}
</style>
