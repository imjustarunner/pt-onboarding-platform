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

          <div class="gsbe-portal-grid gsbe-dash">
            <SkillBuildersEventDashboardSection
              v-bind="dashSection('children')"
              section-id="children"
              :title="(detail.myChildren || []).length === 1 ? 'Your child' : 'Your children'"
              :icon-url="sectionIconUrl('children')"
              :badge="`${detail.myChildren?.length || 0}`"
              :default-open="false"
              class="gsbe-span-2"
            >
              <ul class="gsbe-list">
                <li v-for="ch in detail.myChildren" :key="ch.clientId">
                  <strong>{{ ch.fullName || ch.initials || `Client #${ch.clientId}` }}</strong>
                  <span v-if="ch.grade" class="muted"> · Grade {{ formatGradeDisplay(ch.grade) }}</span>
                  <div v-if="ch.documentStatus || ch.paperworkStatusLabel" class="muted small">
                    Docs: {{ ch.paperworkStatusLabel || ch.documentStatus || '—' }}
                  </div>
                  <ul v-if="attendanceForChild(ch.clientId).length" class="gsbe-att-sub muted small">
                    <li v-for="row in attendanceForChild(ch.clientId)" :key="`att-${row.sessionId}-${row.clientId}`">
                      {{ formatSessionDateDisplay(row.sessionDate) }}
                      <span v-if="row.checkInAt"> · In {{ formatPostTime(row.checkInAt) }}</span>
                      <span v-if="row.checkOutAt"> · Out {{ formatPostTime(row.checkOutAt) }}</span>
                      <span v-if="row.signatureText"> · Signature on file</span>
                    </li>
                  </ul>
                </li>
              </ul>
              <p v-if="detail.skillsGroup?.schoolName" class="muted small gsbe-foot">
                {{ detail.skillsGroup.schoolName }}
              </p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.skillsGroup"
              v-bind="dashSection('session-details')"
              section-id="session-details"
              title="Session details"
              :icon-url="sectionIconUrl('session-details')"
              :default-open="false"
            >
              <p class="muted small gsbe-card-lead">
                Program dates: {{ formatDateOnly(detail.skillsGroup?.startDate) }} –
                {{ formatDateOnly(detail.skillsGroup?.endDate) }}
              </p>
              <p v-if="detail.event?.clientCheckInDisplayTime || detail.event?.clientCheckOutDisplayTime" class="muted small">
                <strong>Expected times:</strong>
                check-in {{ formatDisplayTime(detail.event?.clientCheckInDisplayTime) }} · check-out
                {{ formatDisplayTime(detail.event?.clientCheckOutDisplayTime) }}
              </p>
              <ul v-if="detail.meetings?.length" class="gsbe-list">
                <li v-for="(m, i) in detail.meetings" :key="i">
                  {{ m.weekday }} · {{ wallHmToDisplay(formatHm(m.startTime)) }}–{{ wallHmToDisplay(formatHm(m.endTime)) }}
                </li>
              </ul>
              <p v-else class="muted">No weekly pattern on file yet.</p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-bind="dashSection('materials')"
              section-id="materials"
              title="Materials"
              :icon-url="sectionIconUrl('materials')"
              badge="Coming soon"
              :default-open="false"
            >
              <p class="muted small">Course materials will appear here when your program team adds them.</p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.event?.registrationEligible"
              v-bind="dashSection('registrations')"
              section-id="registrations"
              title="Registrations"
              :icon-url="sectionIconUrl('registrations')"
              badge="Open"
              :default-open="false"
            >
              <p class="muted small gsbe-card-lead">
                This program accepts guardian registrations when listed in your Registration catalog. Enroll or add dependents
                from your guardian home.
              </p>
              <p v-if="registrationPayerLines.length" class="muted small">
                <strong>Payer options:</strong> {{ registrationPayerLines.join(' · ') }}
              </p>
              <p v-if="backTo" class="muted small">
                <router-link :to="backTo">Guardian home · Registration</router-link>
              </p>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-bind="dashSection('providers')"
              section-id="providers"
              title="Providers"
              :icon-url="sectionIconUrl('providers')"
              :default-open="false"
            >
              <p class="muted small gsbe-card-lead">Your child’s team (profile info; no schedule on this page).</p>
              <SkillBuildersEventProvidersGrid :providers="detail.providers || []" />
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="sessions.length && detail.event?.virtualSessionsEnabled !== false"
              v-bind="dashSection('session-virtual')"
              section-id="session-virtual"
              title="Virtual sessions"
              :icon-url="sectionIconUrl('session-virtual')"
              :default-open="false"
            >
              <p class="muted small gsbe-card-lead">Join opens 10 minutes before start through the scheduled end.</p>
              <ul class="gsbe-join-list">
                <li v-for="s in sessions" :key="`vj-${s.id}`" class="gsbe-join-li">
                  <span>{{ formatSessionDateDisplay(s.sessionDate) }} · {{ wallHmToDisplay(formatHm(s.startTime)) }}–{{ wallHmToDisplay(formatHm(s.endTime)) }}</span>
                  <a
                    v-if="sessionJoinVisible(s)"
                    class="btn btn-primary btn-sm"
                    :href="s.joinUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Join
                  </a>
                  <span v-else-if="s.joinUrl && (s.modality === 'virtual' || s.modality === 'hybrid')" class="muted small">Not yet open</span>
                  <span v-else class="muted small">—</span>
                </li>
              </ul>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-if="detail.skillsGroup && sessions.length"
              v-bind="dashSection('details')"
              section-id="details"
              title="Details — dates & locations"
              :icon-url="sectionIconUrl('details')"
              :default-open="false"
              class="gsbe-span-2"
            >
              <div class="gsbe-table-wrap">
                <table class="gsbe-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Location</th>
                      <th>Modality</th>
                      <th>Curriculum</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in sessionsTableRows" :key="`d-${s.id}`">
                      <td>{{ formatSessionDateDisplay(s.sessionDate) }}</td>
                      <td>{{ wallHmToDisplay(formatHm(s.startTime)) }}–{{ wallHmToDisplay(formatHm(s.endTime)) }}</td>
                      <td>{{ s.locationLabel || s.locationAddress || '—' }}</td>
                      <td>{{ s.modality || '—' }}</td>
                      <td>
                        <a
                          v-if="s.hasCurriculum"
                          class="gsbe-curr-link"
                          :href="guardianSessionCurriculumHref(s.id)"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View PDF
                        </a>
                        <span v-else class="muted">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-bind="dashSection('discussion')"
              section-id="discussion"
              title="Discussion"
              :icon-url="sectionIconUrl('discussion')"
              :default-open="false"
              class="gsbe-span-2"
            >
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
            </SkillBuildersEventDashboardSection>

            <SkillBuildersEventDashboardSection
              v-bind="dashSection('event-chat')"
              section-id="event-chat"
              title="Event chat"
              :icon-url="sectionIconUrl('event-chat')"
              :default-open="false"
              class="gsbe-span-2"
            >
              <p class="muted small gsbe-card-lead">Message other families and staff when enabled.</p>
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
            </SkillBuildersEventDashboardSection>
          </div>
        </SkillBuildersEventPortalLayout>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import SkillBuildersEventPortalLayout from '../../components/skillBuilders/SkillBuildersEventPortalLayout.vue';
import SkillBuildersEventDashboardSection from '../../components/skillBuilders/SkillBuildersEventDashboardSection.vue';
import SkillBuildersEventProvidersGrid from '../../components/skillBuilders/SkillBuildersEventProvidersGrid.vue';
import { useBrandingStore } from '../../store/branding';
import { formatGradeDisplay } from '../../utils/clientGrade.js';

const route = useRoute();
const brandingStore = useBrandingStore();

const eventId = computed(() => Number(route.params.eventId));

function guardianSessionCurriculumHref(sessionId) {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return `${base}/guardian-portal/skill-builders/events/${eventId.value}/sessions/${sessionId}/curriculum`;
}
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

const joinNowTick = ref(0);
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    joinNowTick.value += 1;
  }, 15000);
}

const sectionQuery = computed(() => String(route.query.section || '').trim());

function dashSection(id) {
  const q = sectionQuery.value;
  if (!q) return {};
  return { open: q === id };
}

function sectionIconUrl(sectionKey) {
  if (sectionKey === 'providers') {
    const school = brandingStore.getSchoolPortalCardIconUrl('providers');
    return school || brandingStore.getDashboardCardIconUrl('staff');
  }
  const map = {
    children: 'clients',
    'session-details': 'my_schedule',
    materials: 'documents',
    registrations: 'submit',
    'session-virtual': 'communications',
    details: 'checklist',
    discussion: 'communications',
    'event-chat': 'chats'
  };
  const id = map[sectionKey];
  return id ? brandingStore.getDashboardCardIconUrl(id) : '';
}

const sessions = computed(() => (Array.isArray(detail.value?.sessions) ? detail.value.sessions : []));

const registrationPayerLines = computed(() => {
  const e = detail.value?.event;
  if (!e?.registrationEligible) return [];
  const parts = [];
  if (e.medicaidEligible) parts.push('Medicaid');
  if (e.cashEligible) parts.push('Cash / self-pay');
  return parts;
});

const SESSIONS_TABLE_LIMIT = 50;
const sessionsTableRows = computed(() => sessions.value.slice(0, SESSIONS_TABLE_LIMIT));

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

function formatHm(t) {
  return String(t || '').slice(0, 5) || '—';
}

function wallHmToDisplay(hm) {
  const s = String(hm || '').slice(0, 5);
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s === '—' ? '' : s;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return s;
  const d = new Date(2000, 0, 1, h, mi, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatSessionDateDisplay(raw) {
  const s = String(raw || '').trim();
  if (!s) return '—';
  const ymd = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, mo, da] = ymd.split('-').map(Number);
    const d = new Date(y, mo - 1, da);
    if (Number.isFinite(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return ymd;
  }
  const t = new Date(s);
  if (Number.isFinite(t.getTime())) {
    return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return s;
}

function formatDateOnly(d) {
  if (d == null || d === '') return '—';
  return formatSessionDateDisplay(d);
}

function formatDisplayTime(t) {
  if (t == null || t === '') return '—';
  return wallHmToDisplay(formatHm(String(t)));
}

function formatPostTime(t) {
  try {
    return new Date(t).toLocaleString();
  } catch {
    return String(t || '');
  }
}

function attendanceForChild(clientId) {
  const rows = detail.value?.clientAttendance;
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => Number(r.clientId) === Number(clientId));
}

function sessionJoinVisible(s) {
  void joinNowTick.value;
  if (!s?.joinUrl) return false;
  const mod = String(s.modality || '').toLowerCase();
  if (mod !== 'virtual' && mod !== 'hybrid') return false;
  const st = new Date(s.startsAt);
  const en = new Date(s.endsAt);
  if (!Number.isFinite(st.getTime()) || !Number.isFinite(en.getTime())) return false;
  const t = Date.now();
  return t >= st.getTime() - 10 * 60 * 1000 && t <= en.getTime();
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
  min-height: calc(100vh - 48px);
}
.gsbe-main {
  width: 100%;
  min-width: 0;
}
.gsbe-state {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 16px;
}
.gsbe-portal-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 2px 24px;
}
.gsbe-portal-grid.gsbe-dash {
  max-width: 720px;
}
@media (min-width: 1100px) {
  .gsbe-portal-grid.gsbe-dash {
    max-width: 880px;
  }
}
.gsbe-span-2 {
  grid-column: 1 / -1;
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
.gsbe-att-sub {
  list-style: disc;
  margin: 6px 0 0 1rem;
  padding: 0;
}
.gsbe-join-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.gsbe-join-li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
  font-size: 0.9rem;
}
.gsbe-table-wrap {
  overflow-x: auto;
}
.gsbe-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.gsbe-table th,
.gsbe-curr-link {
  font-weight: 600;
  color: var(--primary, #0f766e);
  text-decoration: none;
}
.gsbe-curr-link:hover {
  text-decoration: underline;
}
.gsbe-table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.gsbe-table th {
  font-weight: 700;
  color: var(--text-secondary, #64748b);
  font-size: 0.78rem;
  text-transform: uppercase;
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
.gsbe-chat-msgs {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  max-height: min(40vh, 320px);
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
</style>
