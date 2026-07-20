<template>
  <div class="msg-dash">
    <header class="msg-dash-head">
      <div>
        <h2 class="msg-dash-title">Messages</h2>
        <p class="msg-dash-sub">{{ greeting }} Here’s what needs your attention.</p>
      </div>
      <button type="button" class="btn btn-primary" @click="openWorkspace()">
        Open inbox
      </button>
    </header>

    <div v-if="error" class="msg-dash-error">{{ error }}</div>
    <div v-if="loading" class="msg-dash-muted">Loading your messages…</div>

    <div v-else class="msg-dash-cards">
      <button
        v-for="card in cardList"
        :key="card.key"
        type="button"
        class="msg-dash-card"
        @click="openWorkspace(card.tab)"
      >
        <div class="msg-dash-card-top">
          <span class="msg-dash-card-label">{{ card.label }}</span>
          <span class="msg-dash-card-value">{{ card.value }}</span>
        </div>
        <div class="msg-dash-card-cta">{{ card.cta }} →</div>
      </button>
    </div>

    <div class="msg-dash-grid">
      <section class="msg-dash-panel">
        <div class="msg-dash-panel-head">
          <h3>Prioritize your conversations</h3>
          <div class="msg-dash-filters">
            <button
              v-for="f in filters"
              :key="f.id"
              type="button"
              class="msg-dash-chip"
              :class="{ active: filter === f.id }"
              @click="filter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
        </div>
        <ul v-if="filteredPriority.length" class="msg-dash-list">
          <li
            v-for="item in filteredPriority"
            :key="item.id"
            class="msg-dash-row"
            @click="openWorkspace(item.kind === 'secure' ? 'dms' : 'sms', item)"
          >
            <div class="msg-dash-row-main">
              <strong>{{ item.label }}</strong>
              <span class="msg-dash-kind" :class="`kind-${item.kind}`">{{ kindLabel(item.kind) }}</span>
            </div>
            <p class="msg-dash-snippet">{{ item.snippet || '—' }}</p>
            <div class="msg-dash-row-meta">
              <span class="msg-dash-muted">{{ formatTime(item.occurredAt) }}</span>
              <span v-if="item.unread" class="msg-dash-unread">{{ item.unread }}</span>
            </div>
          </li>
        </ul>
        <div v-else class="msg-dash-empty">
          You’re caught up. Open your inbox to start a conversation.
        </div>
        <button type="button" class="msg-dash-link" @click="openWorkspace()">
          View all conversations →
        </button>
      </section>

      <aside class="msg-dash-side">
        <section class="msg-dash-panel">
          <h3>Mentions</h3>
          <p class="msg-dash-muted">
            {{ cards.mentions || 0 }} mention{{ cards.mentions === 1 ? '' : 's' }} need your input
          </p>
          <button type="button" class="msg-dash-link" @click="openWorkspace('mentions')">
            Open mentions →
          </button>
        </section>
        <section class="msg-dash-panel">
          <h3>Shared files</h3>
          <p class="msg-dash-muted">{{ cards.sharedFiles || 0 }} recently shared</p>
          <button type="button" class="msg-dash-link" @click="openWorkspace('files')">
            Browse files →
          </button>
        </section>
        <section class="msg-dash-panel msg-dash-banner">
          <p>
            All your conversations in one place — SMS, secure messages, team chat, calls, and more —
            organized by what matters most.
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const emit = defineEmits(['open-workspace']);

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading = ref(false);
const error = ref('');
const cards = ref({
  unread: 0,
  clientMessages: 0,
  teamDiscussions: 0,
  calls: 0,
  voicemail: 0,
  mentions: 0,
  sharedFiles: 0
});
const priority = ref([]);
const filter = ref('all');

const greeting = computed(() => {
  const name = authStore.user?.first_name || 'there';
  const h = new Date().getHours();
  const hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${hi}, ${name}!`;
});

const cardList = computed(() => [
  { key: 'unread', label: 'Unread', value: cards.value.unread, cta: 'Across all channels', tab: 'dms' },
  { key: 'client', label: 'Client messages', value: cards.value.clientMessages, cta: 'Requires response', tab: 'sms' },
  { key: 'team', label: 'Team discussions', value: cards.value.teamDiscussions, cta: 'Active conversations', tab: 'dms' },
  { key: 'calls', label: 'Calls', value: cards.value.calls, cta: 'Missed calls', tab: 'dms' },
  { key: 'vm', label: 'Voicemail', value: cards.value.voicemail, cta: 'New voicemail', tab: 'dms' },
  { key: 'mentions', label: 'Mentions', value: cards.value.mentions, cta: 'Need your input', tab: 'mentions' },
  { key: 'files', label: 'Shared files', value: cards.value.sharedFiles, cta: 'Newly shared', tab: 'files' }
]);

const filters = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'secure', label: 'Secure' },
  { id: 'sms', label: 'SMS' }
];

const filteredPriority = computed(() => {
  let list = priority.value || [];
  if (filter.value === 'unread') list = list.filter((i) => i.unread > 0);
  if (filter.value === 'secure') list = list.filter((i) => i.kind === 'secure');
  if (filter.value === 'sms') list = list.filter((i) => i.kind === 'sms');
  return list;
});

function kindLabel(kind) {
  if (kind === 'sms') return 'SMS';
  if (kind === 'voicemail') return 'Voicemail';
  if (kind === 'team') return 'Team Chat';
  return 'Secure Message';
}

function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function openWorkspace(tab = 'dms') {
  emit('open-workspace', { tab });
  const slug = String(route.params?.organizationSlug || '').trim();
  const path = slug ? `/${slug}/messages` : '/messages';
  router.push({ path, query: { ...route.query, view: 'workspace', tab } }).catch(() => {});
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const agencyId = agencyStore.currentAgency?.id;
    const r = await api.get('/messages/dashboard-summary', {
      params: agencyId ? { agencyId } : {},
      skipGlobalLoading: true
    });
    cards.value = { ...cards.value, ...(r.data?.cards || {}) };
    priority.value = Array.isArray(r.data?.priority) ? r.data.priority : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load messages overview';
  } finally {
    loading.value = false;
  }
}

watch(
  () => agencyStore.currentAgency?.id,
  () => load()
);

onMounted(load);

defineExpose({ reload: load });
</script>

<style scoped>
.msg-dash {
  --md-primary: var(--primary, var(--agency-primary-color, #1f6b4a));
  --md-secondary: var(--secondary, var(--agency-secondary-color, var(--md-primary)));
  --md-accent: var(--accent, var(--agency-accent-color, var(--md-secondary)));
  --md-ink: color-mix(in srgb, var(--md-primary) 16%, #0f172a);
  --md-muted: color-mix(in srgb, var(--md-primary) 10%, #64748b);
  --md-line: color-mix(in srgb, var(--md-primary) 14%, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px 0 32px;
  width: 100%;
  color: var(--md-ink);
}
.msg-dash-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.msg-dash-title {
  margin: 0;
  font-size: clamp(1.75rem, 2.5vw, 2.25rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: color-mix(in srgb, var(--md-primary) 50%, var(--md-ink));
}
.msg-dash-sub {
  margin: 8px 0 0;
  color: var(--md-muted);
  font-size: 15px;
}
.msg-dash-error {
  color: #b91c1c;
  background: #fef2f2;
  padding: 12px 14px;
  border-radius: 12px;
}
.msg-dash-muted { color: var(--md-muted); font-size: 13px; }
.msg-dash-cards {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 1100px) {
  .msg-dash-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .msg-dash-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.msg-dash-card {
  text-align: left;
  border: 1px solid var(--md-line);
  background: linear-gradient(165deg, color-mix(in srgb, var(--md-primary) 6%, #fff), #fff);
  border-radius: 16px;
  padding: 14px 16px;
  cursor: pointer;
  min-height: 110px;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--md-primary) 6%, transparent);
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.msg-dash-card:nth-child(3n) {
  background: linear-gradient(165deg, color-mix(in srgb, var(--md-secondary) 8%, #fff), #fff);
}
.msg-dash-card:nth-child(3n + 2) {
  background: linear-gradient(165deg, color-mix(in srgb, var(--md-accent) 10%, #fff), #fff);
}
.msg-dash-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--md-primary) 45%, var(--md-line));
  box-shadow: 0 14px 32px color-mix(in srgb, var(--md-primary) 16%, transparent);
}
.msg-dash-card-top {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.msg-dash-card-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--md-muted);
}
.msg-dash-card-value {
  font-size: 1.7rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--md-primary);
}
.msg-dash-card-cta {
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--md-primary);
}
.msg-dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(260px, 1fr);
  gap: 16px;
}
@media (max-width: 900px) {
  .msg-dash-grid { grid-template-columns: 1fr; }
}
.msg-dash-panel {
  border: 1px solid var(--md-line);
  border-radius: 18px;
  background: #fff;
  padding: 18px;
  box-shadow: 0 12px 36px color-mix(in srgb, var(--md-primary) 7%, transparent);
}
.msg-dash-panel h3 {
  margin: 0 0 10px;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: color-mix(in srgb, var(--md-primary) 40%, var(--md-ink));
}
.msg-dash-panel-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 12px;
}
.msg-dash-filters { display: flex; flex-wrap: wrap; gap: 6px; }
.msg-dash-chip {
  border: 1px solid var(--md-line);
  background: color-mix(in srgb, var(--md-primary) 4%, #f8fafc);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  color: var(--md-muted);
}
.msg-dash-chip.active {
  background: var(--md-primary);
  border-color: var(--md-primary);
  color: #fff;
}
.msg-dash-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 480px;
  overflow: auto;
}
.msg-dash-row {
  border: 1px solid var(--md-line);
  border-radius: 14px;
  padding: 12px 14px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.msg-dash-row:hover {
  background: color-mix(in srgb, var(--md-primary) 5%, #fff);
  border-color: color-mix(in srgb, var(--md-primary) 35%, var(--md-line));
}
.msg-dash-row-main {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.msg-dash-kind {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  padding: 3px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--md-primary) 16%, #fff);
  color: color-mix(in srgb, var(--md-primary) 70%, #0f172a);
}
.kind-sms {
  background: color-mix(in srgb, var(--md-secondary) 22%, #fff);
  color: color-mix(in srgb, var(--md-secondary) 65%, #0f172a);
}
.kind-team {
  background: color-mix(in srgb, var(--md-accent) 24%, #fff);
  color: color-mix(in srgb, var(--md-accent) 60%, #0f172a);
}
.msg-dash-snippet {
  margin: 8px 0;
  font-size: 13px;
  color: var(--md-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.msg-dash-row-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.msg-dash-unread {
  background: var(--md-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  min-width: 22px;
  text-align: center;
  border-radius: 999px;
  padding: 2px 7px;
}
.msg-dash-empty { padding: 20px 0; color: var(--md-muted); }
.msg-dash-link {
  margin-top: 12px;
  border: none;
  background: none;
  color: var(--md-primary);
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}
.msg-dash-side { display: flex; flex-direction: column; gap: 14px; }
.msg-dash-banner {
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--md-primary) 12%, #fff),
    color-mix(in srgb, var(--md-secondary) 6%, #f8fafc) 60%
  );
  border-color: color-mix(in srgb, var(--md-primary) 28%, #fff);
}
.msg-dash-banner p { margin: 0; font-size: 13px; line-height: 1.5; color: color-mix(in srgb, var(--md-primary) 20%, #334155); }
</style>
