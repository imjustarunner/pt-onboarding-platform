<template>
  <div class="feed-panel">
    <div class="feed-panel-header">
      <h3 class="feed-title">Club Feed</h3>
      <button v-if="clubId" class="feed-refresh-btn" @click="load" :disabled="loading" title="Refresh">↻</button>
    </div>

    <div v-if="loading && !items.length" class="feed-loading">
      <div class="feed-spinner"></div>
    </div>

    <div v-else-if="!clubId" class="feed-empty">Join a club to see the feed.</div>

    <div v-else-if="!items.length && !loading" class="feed-empty">
      No activity yet. Be the first to log a workout!
    </div>

    <div v-else class="feed-list">
      <div
        v-for="item in items"
        :key="item.id"
        class="feed-item"
        :class="item.type === 'announcement' ? 'feed-item--announcement' : 'feed-item--workout'"
      >
        <!-- Club Announcement -->
        <template v-if="item.type === 'announcement'">
          <div class="feed-ann-badge">📣 Club Post</div>
          <p class="feed-ann-text">{{ item.text }}</p>
          <div class="feed-meta">
            <span class="feed-who">{{ item.name }}</span>
            <span class="feed-dot">·</span>
            <span class="feed-when">{{ timeAgo(item.timestamp) }}</span>
          </div>
        </template>

        <!-- Workout Activity -->
        <template v-else>
          <div class="feed-workout-top">
            <span class="feed-avatar">{{ initials(item.name) }}</span>
            <div class="feed-workout-info">
              <span class="feed-who">{{ item.name }}</span>
              <span class="feed-activity-type">{{ formatActivity(item.activityType) }}</span>
            </div>
            <span v-if="item.isRace" class="feed-race-badge">🏅 Race</span>
          </div>
          <div class="feed-workout-stats">
            <span v-if="item.distanceMiles != null" class="feed-stat">
              {{ item.distanceMiles.toFixed(2) }} mi
            </span>
            <span v-if="item.durationMinutes" class="feed-stat">{{ item.durationMinutes }} min</span>
            <span v-if="item.points" class="feed-stat feed-pts">+{{ item.points }} pts</span>
          </div>
          <div v-if="item.notes" class="feed-notes">{{ item.notes }}</div>
          <div class="feed-meta">
            <span v-if="item.seasonName" class="feed-season-tag">{{ item.seasonName }}</span>
            <span class="feed-dot">·</span>
            <span class="feed-when">{{ timeAgo(item.timestamp) }}</span>
          </div>
        </template>
      </div>

      <button v-if="canLoadMore" class="feed-load-more" @click="loadMore" :disabled="loading">
        {{ loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clubId: { type: [Number, String], default: null }
});

const items = ref([]);
const loading = ref(false);
const limit = 40;
const canLoadMore = ref(false);
let pollInterval = null;

const load = async () => {
  if (!props.clubId) return;
  loading.value = true;
  try {
    const r = await api.get(`/summit-stats/clubs/${props.clubId}/feed`, {
      params: { limit },
      skipGlobalLoading: true
    });
    items.value = Array.isArray(r.data?.items) ? r.data.items : [];
    canLoadMore.value = items.value.length >= limit;
  } catch {
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const loadMore = async () => {
  if (!props.clubId || loading.value) return;
  loading.value = true;
  try {
    const r = await api.get(`/summit-stats/clubs/${props.clubId}/feed`, {
      params: { limit: limit * 2 },
      skipGlobalLoading: true
    });
    items.value = Array.isArray(r.data?.items) ? r.data.items : [];
    canLoadMore.value = false;
  } catch {} finally {
    loading.value = false;
  }
};

const timeAgo = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const initials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
};

const formatActivity = (t) => {
  if (!t) return 'Workout';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

watch(() => props.clubId, () => { items.value = []; load(); });

onMounted(() => {
  load();
  pollInterval = setInterval(load, 60_000);
});

onUnmounted(() => clearInterval(pollInterval));
</script>

<style scoped>
.feed-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-bg, #f8fafc);
  border-left: 1px solid var(--border, #e2e8f0);
}

.feed-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 1;
}

.feed-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text, #0f172a);
  letter-spacing: 0.01em;
}

.feed-refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  color: #94a3b8;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.15s;
}
.feed-refresh-btn:hover { color: var(--primary, #1d4ed8); }

.feed-loading {
  display: flex;
  justify-content: center;
  padding: 32px;
}
.feed-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #e2e8f0;
  border-top-color: var(--primary, #1d4ed8);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.feed-empty {
  padding: 32px 16px;
  text-align: center;
  color: #94a3b8;
  font-size: 0.87rem;
}

.feed-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.feed-item {
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.1s;
}
.feed-item:hover { background: #f8fafc; }

/* Announcement styling */
.feed-item--announcement {
  background: linear-gradient(135deg, #eff6ff, #f0f9ff);
  border-left: 3px solid #3b82f6;
  margin: 4px 8px;
  border-radius: 8px;
  border-bottom: none;
}
.feed-item--announcement:hover { background: #dbeafe; }

.feed-ann-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: #2563eb;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.feed-ann-text {
  margin: 0 0 6px;
  font-size: 0.88rem;
  color: #1e3a8a;
  line-height: 1.4;
}

/* Workout styling */
.feed-workout-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 5px;
}

.feed-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--primary, #1d4ed8);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.feed-workout-info {
  flex: 1;
  min-width: 0;
}

.feed-who {
  font-weight: 600;
  font-size: 0.85rem;
  color: #0f172a;
  display: block;
  line-height: 1.2;
}

.feed-activity-type {
  font-size: 0.78rem;
  color: #64748b;
}

.feed-race-badge {
  font-size: 0.72rem;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 1px 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.feed-workout-stats {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
  padding-left: 38px;
}

.feed-stat {
  font-size: 0.8rem;
  background: #f1f5f9;
  border-radius: 10px;
  padding: 1px 8px;
  color: #334155;
}

.feed-pts {
  background: #dcfce7;
  color: #166534;
  font-weight: 600;
}

.feed-notes {
  padding-left: 38px;
  font-size: 0.78rem;
  color: #64748b;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feed-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 38px;
}

.feed-season-tag {
  font-size: 0.72rem;
  color: #94a3b8;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 1px 6px;
}

.feed-dot { color: #cbd5e1; font-size: 0.75rem; }

.feed-when {
  font-size: 0.75rem;
  color: #94a3b8;
}

.feed-load-more {
  width: 100%;
  padding: 10px;
  background: transparent;
  border: none;
  color: var(--primary, #1d4ed8);
  font-size: 0.85rem;
  cursor: pointer;
  border-top: 1px solid #f1f5f9;
}
.feed-load-more:hover { background: #f8fafc; }
</style>
