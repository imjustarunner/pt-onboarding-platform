<template>
  <div class="social-feeds-panel">
    <div class="section-header">
      <h2 style="margin: 0;">Social &amp; feeds</h2>
    </div>
    <div v-if="loading" class="muted">Loading feeds…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!feeds.length" class="empty-state">
      <p class="muted">No social or school feeds configured for your organization.</p>
    </div>
    <template v-else>
      <div class="feed-list">
        <button
          v-for="f in feeds"
          :key="f.id"
          type="button"
          class="feed-card"
          :class="{ active: selectedFeedId === f.id }"
          @click="selectFeed(f)"
        >
          <span class="feed-card-icon" :aria-label="f.type">{{ platformIcon(f.type) }}</span>
          <span class="feed-card-label">{{ f.label }}</span>
        </button>
      </div>
      <div v-if="selectedFeed" class="feed-detail">
        <div class="feed-detail-head">
          <h3 style="margin: 0;">{{ selectedFeed.label }}</h3>
          <button
            v-if="isEmbedType(selectedFeed.type)"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="embedExpanded = !embedExpanded"
          >
            {{ embedExpanded ? 'Collapse' : 'Expand' }}
          </button>
        </div>
        <SocialFeedEmbed :feed="selectedFeed" :expanded="embedExpanded" />
      </div>
      <div v-else class="hint">Select a feed above to view it.</div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import SocialFeedEmbed from './SocialFeedEmbed.vue';

const props = defineProps({
  agencyId: {
    type: [Number, String],
    default: null
  },
  organizationId: {
    type: [Number, String],
    default: null
  },
  programId: {
    type: [Number, String],
    default: null
  },
  selectedFeedIdFromParent: {
    type: [Number, String],
    default: null
  }
});

const feeds = ref([]);
const loading = ref(false);
const error = ref('');
const selectedFeedId = ref(null);
const embedExpanded = ref(false);

const selectedFeed = computed(() => {
  const id = selectedFeedId.value;
  if (!id) return null;
  return feeds.value.find((f) => Number(f.id) === Number(id)) || null;
});

function platformIcon(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'instagram') return 'IG';
  if (t === 'facebook') return 'FB';
  if (t === 'rss') return 'RSS';
  return 'Link';
}

function isEmbedType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'instagram' || t === 'facebook';
}

async function load() {
  if (!props.agencyId) {
    feeds.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const params = { agencyId: props.agencyId };
    if (props.organizationId) params.organizationId = props.organizationId;
    if (props.programId) params.programId = props.programId;
    const res = await api.get('/dashboard/social-feeds', { params });
    feeds.value = Array.isArray(res.data?.feeds) ? res.data.feeds : [];
    if (!feeds.value.some((f) => Number(f.id) === Number(selectedFeedId.value))) {
      selectedFeedId.value = null;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load feeds';
    feeds.value = [];
  } finally {
    loading.value = false;
  }
}

function selectFeed(feed) {
  selectedFeedId.value = feed.id;
  embedExpanded.value = false;
}

watch(
  () => [props.agencyId, props.organizationId, props.programId],
  () => { load(); },
  { immediate: true }
);

watch(
  () => props.selectedFeedIdFromParent,
  (id) => {
    if (id != null && feeds.value.some((f) => Number(f.id) === Number(id))) {
      selectedFeedId.value = id;
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.social-feeds-panel {
  padding: 0;
}

.feed-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.feed-card {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  background: var(--bg-card, #fff);
  cursor: pointer;
  font-size: 14px;
  text-align: left;
}

.feed-card:hover {
  border-color: var(--primary, #3498db);
  background: var(--bg-hover, #f8f9fa);
}

.feed-card.active {
  border-color: var(--primary, #3498db);
  background: var(--primary-light, #e8f4fc);
}

.feed-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--bg-muted, #eee);
  font-size: 11px;
  font-weight: 600;
}

.feed-detail {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.feed-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.empty-state {
  padding: 24px 0;
}

.hint {
  color: var(--text-muted, #666);
  font-size: 14px;
  margin-top: 12px;
}
</style>
