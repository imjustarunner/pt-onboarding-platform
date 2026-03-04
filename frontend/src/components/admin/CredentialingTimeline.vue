<template>
  <div class="credentialing-timeline">
    <div v-if="loading" class="loading">Loading timeline…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="items.length === 0" class="muted">No credentialing changes recorded.</div>
    <ul v-else class="timeline-list">
      <li v-for="item in items" :key="item.id" class="timeline-item">
        <span class="timeline-date">{{ formatDate(item.changed_at) }}</span>
        <span class="timeline-detail">
          <strong>{{ item.field_changed }}</strong>
          {{ item.target_first_name || item.target_last_name ? ` (${[item.target_first_name, item.target_last_name].filter(Boolean).join(' ')})` : '' }}
          {{ item.insurance_name ? ` · ${item.insurance_name}` : '' }}
          <span v-if="item.old_value !== null || item.new_value !== null">
            — {{ item.old_value ?? '(empty)' }} → {{ item.new_value ?? '(empty)' }}
          </span>
        </span>
        <span v-if="item.changed_by_first_name || item.changed_by_last_name" class="muted">
          by {{ [item.changed_by_first_name, item.changed_by_last_name].filter(Boolean).join(' ') }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, default: null },
  userId: { type: Number, default: null }
});

const items = ref([]);
const loading = ref(false);
const error = ref('');

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleString();
};

const fetchTimeline = async () => {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const params = props.userId ? { userId: props.userId } : {};
    const res = await api.get(`/agencies/${props.agencyId}/credentialing/timeline`, { params });
    items.value = res.data?.timeline || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load timeline';
    items.value = [];
  } finally {
    loading.value = false;
  }
};

watch([() => props.agencyId, () => props.userId], fetchTimeline, { immediate: true });
</script>

<style scoped>
.credentialing-timeline {
  padding: 12px 0;
  font-family: var(--agency-font-family, var(--font-body));
}
.timeline-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.timeline-item {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}
.timeline-date {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  min-width: 160px;
}
.timeline-detail {
  flex: 1;
}
</style>
