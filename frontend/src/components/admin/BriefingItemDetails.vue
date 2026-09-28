<template>
  <article class="briefing-detail" :aria-busy="loading">
    <div class="detail-kicker">{{ section.title }}</div>
    <h2>{{ item.label }}</h2>
    <p v-if="item.meta" class="detail-meta">{{ item.meta }}</p>
    <p v-if="loading" role="status">Loading details...</p>
    <div v-if="error" class="detail-error" role="alert">
      {{ error }} <button type="button" @click="load">Retry</button>
    </div>
    <dl v-if="facts.length" class="detail-facts">
      <template v-for="fact in facts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></template>
    </dl>
    <p v-if="description" class="detail-description">{{ description }}</p>
    <p v-else-if="!loading && !error" class="detail-meta">No additional description.</p>
    <template v-if="section.key === 'meetings'">
      <h3 v-if="workspace.focusTitle">{{ workspace.focusTitle }}</h3>
      <section v-if="participants.length" class="detail-section">
        <h3>Participants</h3>
        <ul><li v-for="(person, index) in participants" :key="person.userId || person.id || index">{{ person.name || person.displayName || [person.first_name, person.last_name].filter(Boolean).join(' ') || person.email || 'Participant' }}<span v-if="person.isHost"> (Host)</span></li></ul>
      </section>
      <section v-for="group in meetingGroups" :key="group.title" class="detail-section">
        <h3>{{ group.title }}</h3>
        <ul><li v-for="entry in group.items" :key="entry.id" :class="{ 'detail-complete': entry.done }">{{ entry.text }}<span v-if="entry.done"> (Completed)</span></li></ul>
      </section>
      <a v-if="joinUrl" :href="joinUrl" class="detail-join" target="_blank" rel="noopener noreferrer"><Video :size="18" aria-hidden="true" /> Open meeting <ExternalLink :size="16" aria-hidden="true" /></a>
    </template>
    <section v-if="messages.length" class="detail-section">
      <h3>Recent replies</h3>
      <article v-for="message in messages.slice(-5)" :key="message.id" class="detail-reply">
        <strong>{{ [message.author_first_name, message.author_last_name].filter(Boolean).join(' ') || 'Team member' }}</strong>
        <time>{{ formatDate(message.created_at) }}</time>
        <p>{{ message.body || message.message || message.message_text }}</p>
      </article>
    </section>
  </article>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ExternalLink, Video } from '@lucide/vue';
import api from '../../services/api';

const props = defineProps({ item: { type: Object, required: true }, section: { type: Object, required: true } });
const loading = ref(false), error = ref(''), data = ref({});
let generation = 0;
const record = computed(() => ({ ...(props.item.raw || {}), ...(data.value.ticket || data.value.task || (props.section.key === 'tasks' ? data.value : {})) }));
const workspace = computed(() => data.value.workspace || {});
const participants = computed(() => data.value.participants || record.value.attendees || []);
const messages = computed(() => data.value.messages || []);
const description = computed(() => record.value.description || record.value.message || record.value.body || record.value.notes || '');
const meetingGroups = computed(() => [
  { title: 'Goals', items: workspace.value.goals || [] },
  { title: 'Action items', items: workspace.value.actionItems || [] }
].filter(group => group.items.length));
function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
const facts = computed(() => {
  const r = record.value;
  return [
    { label: 'Organization', value: r.agency_name || r.agencyName || r.school_name },
    { label: 'Status', value: r.escalation_status || r.status },
    { label: 'Priority', value: r.priority },
    { label: 'Starts', value: formatDate(r.start || r.startAt || r.startsAt) },
    { label: 'Ends', value: formatDate(r.end || r.endAt || r.endsAt) },
    { label: 'Due', value: formatDate(r.due_date || r.dueDate) },
    { label: 'Location', value: r.location || r.locationName },
    { label: 'Created', value: formatDate(r.created_at || r.createdAt) }
  ].filter(fact => fact.value && typeof fact.value !== 'object');
});
const joinUrl = computed(() => {
  const raw = props.item.raw?.url;
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
});

async function load() {
  const current = ++generation;
  data.value = {};
  error.value = '';
  loading.value = false;
  const id = props.item.raw?.id;
  let path = '';
  if (id && ['tickets', 'escalations'].includes(props.section.key)) path = `/support-tickets/${encodeURIComponent(id)}/messages`;
  if (id && props.section.key === 'tasks') path = `/tasks/${encodeURIComponent(id)}`;
  if (id && props.section.key === 'meetings' && ['TEAM_MEETING', 'HUDDLE'].includes(props.item.raw?.kind)) path = `/team-meetings/${encodeURIComponent(id)}/workspace`;
  if (!path) return;
  loading.value = true;
  try {
    const response = await api.get(path, { skipGlobalLoading: true, skipAuthRedirect: true, timeout: 10000 });
    if (current === generation) data.value = response.data || {};
  } catch {
    if (current === generation) error.value = 'Additional details could not be loaded.';
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(() => [props.section.key, props.item.id], load, { immediate: true });
onBeforeUnmount(() => { generation += 1; });
</script>

<style scoped>
.briefing-detail { color:var(--text-primary); overflow-wrap:anywhere; }
.detail-kicker, .detail-meta { color:var(--text-secondary); font-size:13px; }
.briefing-detail h2 { font-size:22px; margin:10px 0; color:var(--text-primary); }
.briefing-detail h3 { font-size:16px; color:var(--text-primary); }
.detail-facts { display:grid; grid-template-columns:100px minmax(0,1fr); gap:12px; margin:24px 0; font-size:14px; }
.detail-facts dt { color:var(--text-secondary); }
.detail-facts dd { margin:0; }
.detail-description, .detail-reply p { white-space:pre-wrap; line-height:1.6; margin:18px 0; }
.detail-section { margin-top:24px; padding-top:16px; border-top:1px solid var(--border); }
.detail-section ul { padding-left:20px; margin:12px 0; }
.detail-section li { margin:10px 0; }
.detail-complete { color:var(--text-secondary); }
.detail-reply { padding:12px 0; border-bottom:1px solid var(--border); }
.detail-reply time { display:block; margin-top:4px; font-size:12px; color:var(--text-secondary); }
.detail-join { display:inline-flex; align-items:center; gap:8px; padding:10px 14px; margin-top:20px; border:1px solid var(--border); border-radius:6px; text-decoration:none; color:var(--text-primary); background:var(--bg-alt); }
.detail-error { padding:12px; border:1px solid var(--border); border-radius:6px; }
.detail-error button { margin-left:8px; color:var(--text-primary); background:var(--bg-alt); border:1px solid var(--border); border-radius:4px; padding:6px 10px; cursor:pointer; }
</style>
