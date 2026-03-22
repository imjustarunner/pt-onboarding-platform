<template>
  <div class="pae-wrap">
    <header class="pae-head">
      <h1>{{ pageTitle }}</h1>
      <p class="muted">{{ pageSubtitle }}</p>
    </header>
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <ul v-else class="pae-list">
      <li v-for="ev in events" :key="ev.id" class="pae-item">
        <strong>{{ ev.title }}</strong>
        <div class="muted">{{ formatEv(ev) }}</div>
      </li>
      <li v-if="!events.length" class="muted">No upcoming Skill Builders events.</li>
    </ul>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const slug = computed(() => String(route.params.agencySlug || '').trim());

const loading = ref(false);
const error = ref('');
const events = ref([]);

function formatEv(ev) {
  const a = new Date(ev?.startsAt || 0);
  const b = new Date(ev?.endsAt || 0);
  if (!Number.isFinite(a.getTime())) return '';
  const opt = { dateStyle: 'medium', timeStyle: 'short' };
  try {
    return `${a.toLocaleString(undefined, opt)} – ${Number.isFinite(b.getTime()) ? b.toLocaleString(undefined, opt) : ''} (${ev.timezone || 'UTC'})`;
  } catch {
    return '';
  }
}

async function load() {
  if (!agencySlug.value || !programSlug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(
      `/public/skill-builders/agency/${encodeURIComponent(agencySlug.value)}/programs/${encodeURIComponent(programSlug.value)}/events`,
      { skipGlobalLoading: true }
    );
    events.value = Array.isArray(res.data?.events) ? res.data.events : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    events.value = [];
  } finally {
    loading.value = false;
  }
}

watch([agencySlug, programSlug], () => load(), { immediate: true });
</script>

<style scoped>
.pae-wrap {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 16px;
}
.pae-head h1 {
  margin: 0 0 8px;
}
.pae-list {
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
}
.pae-item {
  padding: 14px 0;
  border-bottom: 1px solid #e2e8f0;
}
.muted {
  color: #64748b;
  font-size: 0.9rem;
}
.error {
  color: #b91c1c;
}
</style>
