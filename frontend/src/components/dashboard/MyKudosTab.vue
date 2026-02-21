<template>
  <div class="my-kudos">
    <div class="header">
      <h1>My Kudos</h1>
      <p class="subtitle">Your earned kudos and recognition from coworkers. Redeem points for rewards (coming soon).</p>
    </div>

    <div v-if="loading" class="muted" style="margin: 16px 0;">Loading…</div>
    <div v-else-if="error" class="warn-box" style="margin: 16px 0;">{{ error }}</div>
    <template v-else>
      <div class="kudos-summary">
        <div class="kudos-total-card">
          <div class="kudos-total-label">Total Kudos</div>
          <div class="kudos-total-value">{{ points }}</div>
          <div class="kudos-total-hint">points earned</div>
        </div>
        <div v-if="tierProgress?.currentTier" class="kudos-tier-card">
          <div class="kudos-tier-label">Current tier</div>
          <div class="kudos-tier-value">{{ tierProgress.currentTier.tierName }}</div>
          <div v-if="tierProgress.nextTier" class="kudos-tier-hint">
            {{ tierProgress.pointsToNextTier }} more to {{ tierProgress.nextTier.tierName }}
          </div>
        </div>
      </div>

      <div class="kudos-rewards-coming">
        <p class="muted">
          Redeem kudos for dinners, events, awards, gear, and more — coming soon.
        </p>
      </div>

      <div class="kudos-history">
        <h2>Kudos received</h2>
        <div v-if="!kudos.length" class="muted">No kudos yet.</div>
        <div v-else class="kudos-list">
          <div
            v-for="item in kudos"
            :key="item.id"
            class="kudos-item"
          >
            <div class="kudos-item-header">
              <img
                v-if="item.fromProfilePhotoUrl"
                :src="item.fromProfilePhotoUrl"
                :alt="item.fromName"
                class="kudos-avatar"
              />
              <div v-else class="kudos-avatar-placeholder">{{ avatarInitial(item.fromName) }}</div>
              <div class="kudos-item-meta">
                <span class="kudos-from">{{ item.fromName }}</span>
                <span class="kudos-date">{{ formatDate(item.createdAt) }}</span>
              </div>
              <span v-if="item.approvalStatus === 'pending'" class="kudos-pending-badge">Pending</span>
              <span v-else class="kudos-plus">+1</span>
            </div>
            <div class="kudos-reason">{{ item.reason }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const props = defineProps({
  agencyId: { type: Number, default: null }
});

const loading = ref(false);
const error = ref(null);
const kudos = ref([]);
const totalCount = ref(0);
const points = ref(0);
const tierProgress = ref(null);

const fetchKudos = async () => {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = null;
  try {
    const res = await api.get('/kudos/me', {
      params: { agencyId: props.agencyId, limit: 50, offset: 0 }
    });
    kudos.value = res.data?.kudos || [];
    totalCount.value = res.data?.totalCount ?? 0;
    points.value = res.data?.points ?? 0;
    tierProgress.value = res.data?.tierProgress || null;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load kudos';
    kudos.value = [];
    totalCount.value = 0;
    points.value = 0;
    tierProgress.value = null;
  } finally {
    loading.value = false;
  }
};

const avatarInitial = (name) => {
  const n = String(name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return n[0].toUpperCase();
};

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

watch(
  () => props.agencyId,
  (id) => {
    if (id) fetchKudos();
    else {
      kudos.value = [];
      totalCount.value = 0;
      points.value = 0;
      tierProgress.value = null;
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.my-kudos {
  padding: 0 0 24px;
}

.header {
  margin-bottom: 20px;
}

.header h1 {
  margin: 0 0 4px;
  font-size: 1.5rem;
}

.subtitle {
  margin: 0;
  color: var(--muted, #666);
  font-size: 0.95rem;
}

.kudos-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.kudos-total-card,
.kudos-tier-card {
  padding: 16px 20px;
  border-radius: 8px;
  background: var(--gray-100, #f3f4f6);
  min-width: 140px;
}

.kudos-total-label,
.kudos-tier-label {
  font-size: 0.8rem;
  color: var(--muted, #666);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.kudos-total-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--success-color, #2F8F83);
}

.kudos-total-hint,
.kudos-tier-hint {
  font-size: 0.85rem;
  color: var(--muted, #666);
  margin-top: 4px;
}

.kudos-tier-value {
  font-size: 1.1rem;
  font-weight: 600;
}

.kudos-rewards-coming {
  margin-bottom: 24px;
  padding: 12px 16px;
  background: var(--gray-50, #f9fafb);
  border-radius: 8px;
}

.kudos-history h2 {
  font-size: 1.1rem;
  margin: 0 0 12px;
}

.kudos-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kudos-item {
  padding: 12px 16px;
  border: 1px solid var(--gray-200, #e5e7eb);
  border-radius: 8px;
  background: #fff;
}

.kudos-item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.kudos-avatar,
.kudos-avatar-placeholder {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.kudos-avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--gray-200, #e5e7eb);
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-600, #4b5563);
}

.kudos-item-meta {
  flex: 1;
  min-width: 0;
}

.kudos-from {
  font-weight: 600;
  display: block;
}

.kudos-date {
  font-size: 0.85rem;
  color: var(--muted, #666);
}

.kudos-plus {
  font-weight: 700;
  color: var(--success-color, #2F8F83);
  font-size: 1rem;
}

.kudos-pending-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--gray-200, #e5e7eb);
  color: var(--muted, #666);
}

.kudos-reason {
  font-size: 0.95rem;
  color: var(--gray-700, #374151);
  line-height: 1.4;
}
</style>
