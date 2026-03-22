<template>
  <div class="gsbe-wrap">
    <div class="gsbe-main">
      <div v-if="loading" class="gsbe-state muted">Loading event…</div>
      <div v-else-if="error" class="gsbe-state error-box">{{ error }}</div>
      <template v-else-if="detail">
        <SkillBuildersEventPortalLayout
          :title="detail.event?.title || 'Skill Builders'"
          :subtitle="guardianSubtitle"
          kicker="Family · Skill Builders"
        >
          <template #actions>
            <router-link class="btn btn-secondary btn-sm" :to="backTo">← Skill Builders</router-link>
          </template>

          <div class="gsbe-portal-grid">
            <section class="gsbe-portal-card gsbe-span-2">
              <h2 class="gsbe-card-title">Your child(ren) in this program</h2>
              <ul class="gsbe-list">
                <li v-for="ch in detail.myChildren" :key="ch.clientId">
                  <strong>{{ ch.fullName || ch.initials || `Client #${ch.clientId}` }}</strong>
                  <span v-if="ch.grade" class="muted"> · Grade {{ ch.grade }}</span>
                  <div v-if="ch.documentStatus || ch.paperworkStatusLabel" class="muted small">
                    Docs: {{ ch.paperworkStatusLabel || ch.documentStatus || '—' }}
                  </div>
                </li>
              </ul>
              <p v-if="detail.skillsGroup?.schoolName" class="muted small gsbe-foot">
                {{ detail.skillsGroup.schoolName }}
              </p>
            </section>

            <section class="gsbe-portal-card">
              <h2 class="gsbe-card-title">Schedule</h2>
              <p class="muted small gsbe-card-lead">
                Program dates: {{ formatDateOnly(detail.skillsGroup?.startDate) }} –
                {{ formatDateOnly(detail.skillsGroup?.endDate) }}
              </p>
              <ul v-if="detail.meetings?.length" class="gsbe-list">
                <li v-for="(m, i) in detail.meetings" :key="i">
                  {{ m.weekday }} · {{ formatClock(m.startTime) }}–{{ formatClock(m.endTime) }}
                </li>
              </ul>
              <p v-else class="muted">No weekly pattern on file yet.</p>
            </section>

            <section class="gsbe-portal-card">
              <h2 class="gsbe-card-title">Providers</h2>
              <ul class="gsbe-list">
                <li v-for="p in detail.providers" :key="p.id">{{ p.firstName }} {{ p.lastName }}</li>
              </ul>
            </section>

            <section class="gsbe-portal-card gsbe-span-2">
              <h2 class="gsbe-card-title">Discussion</h2>
              <p class="muted small gsbe-card-lead">Posting may be limited to staff; you can read updates here.</p>
              <div v-if="postsLoading" class="muted">Loading…</div>
              <ul v-else class="gsbe-posts">
                <li v-for="p in posts" :key="p.id" class="gsbe-post">
                  <div class="gsbe-post-meta">
                    {{ p.authorFirstName }} {{ p.authorLastName }} · {{ formatPostTime(p.createdAt) }}
                  </div>
                  <div class="gsbe-post-body">{{ p.body }}</div>
                </li>
              </ul>
            </section>
          </div>
        </SkillBuildersEventPortalLayout>
      </template>
    </div>
    <aside class="gsbe-chat">
      <div class="gsbe-chat-inner">
        <h2 class="gsbe-chat-title">Event chat</h2>
        <p class="muted gsbe-chat-hint">Message other families and staff when enabled.</p>
        <div v-if="chatLoading" class="muted">Loading…</div>
        <div v-else-if="chatError" class="error-box">{{ chatError }}</div>
        <template v-else>
          <ul class="gsbe-chat-msgs">
            <li v-for="m in chatMessages" :key="m.id" class="gsbe-chat-li">
              <div class="gsbe-chat-meta">
                {{ m.sender_first_name }} {{ m.sender_last_name }} · {{ formatPostTime(m.created_at) }}
              </div>
              <div class="gsbe-chat-body">{{ m.body }}</div>
            </li>
          </ul>
          <textarea v-model="chatDraft" class="input" rows="3" placeholder="Write a message…" />
          <button
            type="button"
            class="btn btn-primary btn-sm gsbe-chat-send"
            :disabled="!chatDraft.trim() || chatSending"
            @click="sendChat"
          >
            {{ chatSending ? 'Sending…' : 'Send' }}
          </button>
        </template>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import SkillBuildersEventPortalLayout from '../../components/skillBuilders/SkillBuildersEventPortalLayout.vue';

const route = useRoute();

const eventId = computed(() => Number(route.params.eventId));
const orgSlug = computed(() => String(route.params.organizationSlug || '').trim());

const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/guardian` : '/guardian'));

const loading = ref(false);
const error = ref('');
const detail = ref(null);
const posts = ref([]);
const postsLoading = ref(false);
const chatThreadId = ref(null);
const chatAgencyId = ref(null);
const chatLoading = ref(false);
const chatError = ref('');
const chatMessages = ref([]);
const chatDraft = ref('');
const chatSending = ref(false);

const guardianSubtitle = computed(() => {
  const parts = [];
  const ev = detail.value?.event;
  const a = new Date(ev?.startsAt || 0);
  const b = new Date(ev?.endsAt || 0);
  if (Number.isFinite(a.getTime())) {
    const opt = { dateStyle: 'medium', timeStyle: 'short' };
    try {
      parts.push(
        `${a.toLocaleString(undefined, opt)} – ${Number.isFinite(b.getTime()) ? b.toLocaleString(undefined, opt) : ''}`
      );
    } catch {
      parts.push(String(ev?.startsAt || ''));
    }
  }
  if (detail.value?.skillsGroup) {
    parts.push(`${detail.value.skillsGroup.schoolName} · ${detail.value.skillsGroup.name}`);
  }
  return parts.filter(Boolean).join(' · ');
});

function formatDateOnly(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

function formatClock(t) {
  const s = String(t || '').slice(0, 5);
  return s || '—';
}

function formatPostTime(t) {
  try {
    return new Date(t).toLocaleString();
  } catch {
    return String(t || '');
  }
}

async function loadAll() {
  if (!eventId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/guardian-portal/skill-builders/events/${eventId.value}/detail`, { skipGlobalLoading: true });
    detail.value = res.data;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    detail.value = null;
  } finally {
    loading.value = false;
  }

  postsLoading.value = true;
  try {
    const res = await api.get(`/guardian-portal/skill-builders/events/${eventId.value}/posts`, { skipGlobalLoading: true });
    posts.value = Array.isArray(res.data?.posts) ? res.data.posts : [];
  } catch {
    posts.value = [];
  } finally {
    postsLoading.value = false;
  }

  chatLoading.value = true;
  chatError.value = '';
  try {
    const r = await api.get(`/guardian-portal/skill-builders/events/${eventId.value}/chat-thread`, { skipGlobalLoading: true });
    chatThreadId.value = r.data?.threadId ? Number(r.data.threadId) : null;
    chatAgencyId.value = r.data?.agencyId ? Number(r.data.agencyId) : null;
    if (!chatThreadId.value) {
      chatError.value = 'Chat not available';
      chatMessages.value = [];
      return;
    }
    const m = await api.get(`/chat/threads/${chatThreadId.value}/messages`, { params: { limit: 120 }, skipGlobalLoading: true });
    chatMessages.value = Array.isArray(m.data) ? m.data : [];
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || e.message || 'Chat unavailable';
    chatMessages.value = [];
  } finally {
    chatLoading.value = false;
  }
}

async function sendChat() {
  const tid = chatThreadId.value;
  const body = String(chatDraft.value || '').trim();
  if (!tid || !body) return;
  chatSending.value = true;
  try {
    await api.post(`/chat/threads/${tid}/messages`, { body }, { skipGlobalLoading: true });
    chatDraft.value = '';
    const m = await api.get(`/chat/threads/${tid}/messages`, { params: { limit: 120 }, skipGlobalLoading: true });
    chatMessages.value = Array.isArray(m.data) ? m.data : [];
  } catch (e) {
    chatError.value = e.response?.data?.error?.message || e.message || 'Send failed';
  } finally {
    chatSending.value = false;
  }
}

watch(
  () => eventId.value,
  () => {
    loadAll();
  },
  { immediate: true }
);
</script>

<style scoped>
.gsbe-wrap {
  display: flex;
  align-items: stretch;
  min-height: calc(100vh - 48px);
}
.gsbe-main {
  flex: 1;
  min-width: 0;
}
.gsbe-state {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 16px;
}
.gsbe-portal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 860px) {
  .gsbe-portal-grid {
    grid-template-columns: 1fr;
  }
  .gsbe-span-2 {
    grid-column: auto;
  }
}
.gsbe-span-2 {
  grid-column: span 2;
}
.gsbe-portal-card {
  padding: 18px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.gsbe-portal-card:hover {
  border-color: rgba(15, 118, 110, 0.35);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.gsbe-card-title {
  margin: 0 0 10px;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--primary, #0f766e);
}
.gsbe-card-lead {
  margin: 0 0 10px;
  line-height: 1.45;
}
.gsbe-foot {
  margin: 12px 0 0;
}
.gsbe-list {
  margin: 0;
  padding-left: 1.2rem;
}
.small {
  font-size: 0.85rem;
}
.gsbe-posts {
  list-style: none;
  margin: 0;
  padding: 0;
}
.gsbe-post {
  padding: 8px 0;
  border-bottom: 1px solid #e2e8f0;
}
.gsbe-post-meta {
  font-size: 0.75rem;
  color: var(--text-secondary, #64748b);
}
.gsbe-post-body {
  margin-top: 4px;
  white-space: pre-wrap;
}
.gsbe-chat {
  width: 340px;
  max-width: 38vw;
  border-left: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
  align-self: flex-start;
  position: sticky;
  top: 0;
  max-height: 100vh;
  overflow-y: auto;
}
.gsbe-chat-inner {
  padding: 16px;
}
.gsbe-chat-title {
  margin: 0 0 6px;
  font-size: 1.05rem;
}
.gsbe-chat-hint {
  font-size: 0.8rem;
  margin-bottom: 10px;
}
.gsbe-chat-msgs {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  max-height: 46vh;
  overflow-y: auto;
}
.gsbe-chat-li {
  padding: 6px 0;
  border-bottom: 1px solid #e2e8f0;
}
.gsbe-chat-meta {
  font-size: 0.72rem;
  color: var(--text-secondary, #64748b);
}
.gsbe-chat-body {
  font-size: 0.88rem;
  white-space: pre-wrap;
}
.gsbe-chat-send {
  margin-top: 8px;
}
.muted {
  color: var(--text-secondary, #64748b);
}
.error-box {
  color: #b91c1c;
  padding: 10px;
  background: #fef2f2;
  border-radius: 8px;
}
@media (max-width: 900px) {
  .gsbe-wrap {
    flex-direction: column;
  }
  .gsbe-chat {
    width: 100%;
    max-width: none;
    border-left: none;
    border-top: 1px solid var(--border, #e2e8f0);
    position: relative;
    max-height: none;
  }
}
</style>
