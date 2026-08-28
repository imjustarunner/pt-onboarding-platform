<template>
  <div class="qv">
    <header class="qv-top">
      <div>
        <div class="qv-brand">{{ agencyName || 'Quick View' }}</div>
        <div class="qv-sub" v-if="session">Expires {{ formatExpiry(expiresAt) }}</div>
      </div>
      <button v-if="session" type="button" class="qv-btn ghost" @click="logout">Lock</button>
    </header>

    <div v-if="error" class="qv-err">{{ error }}</div>
    <div v-else-if="loading" class="qv-pad">Loading…</div>

    <section v-else-if="!session" class="qv-gate">
      <h1>Quick View</h1>
      <p v-if="tokenInfo">Hi {{ tokenInfo.firstName || 'there' }} — enter your 6-digit passcode.</p>
      <p v-else>Validating your private link…</p>
      <form v-if="tokenInfo" class="qv-form" @submit.prevent="unlock">
        <input
          v-model="passcode"
          class="qv-pin"
          inputmode="numeric"
          maxlength="6"
          pattern="\d{6}"
          autocomplete="one-time-code"
          placeholder="••••••"
        />
        <button type="submit" class="qv-btn primary" :disabled="unlocking || passcode.length !== 6">
          {{ unlocking ? 'Opening…' : 'Open' }}
        </button>
      </form>
      <p class="qv-hint">Passcodes are never emailed. Reset yours from Account Info → Privacy after entering your password.</p>
    </section>

    <template v-else>
      <nav class="qv-tabs">
        <button type="button" :class="{ on: tab === 'home' }" @click="tab = 'home'">Messages</button>
        <button type="button" :class="{ on: tab === 'tasks' }" @click="switchTasks">Tasks</button>
        <button type="button" :class="{ on: tab === 'calendar' }" @click="switchCalendar">Calendar</button>
        <button type="button" :class="{ on: tab === 'contacts' }" @click="loadContacts">Contacts</button>
      </nav>

      <div v-if="tab === 'home'" class="qv-pane">
        <div class="qv-sorters">
          <button type="button" :class="{ on: sort === 'all' }" @click="sort = 'all'">All</button>
          <button type="button" :class="{ on: sort === 'unread' }" @click="sort = 'unread'">Unread</button>
          <button type="button" :class="{ on: sort === 'needs' }" @click="sort = 'needs'">Needs reply</button>
        </div>
        <button
          v-for="c in filteredConversations"
          :key="c.id"
          type="button"
          class="qv-row"
          :class="{ unread: c.is_unread }"
          @click="openConversation(c)"
        >
          <span class="ch">{{ channelIcon(c.channel) }}</span>
          <div class="meta">
            <strong>{{ c.subject || '(no subject)' }}</strong>
            <small>{{ c.last_message_preview || '' }}</small>
          </div>
          <span v-if="c.has_auto_reply" class="badge">Auto</span>
        </button>
        <div v-if="!filteredConversations.length" class="qv-pad muted">No messages.</div>
      </div>

      <div v-else-if="tab === 'thread'" class="qv-pane thread">
        <button type="button" class="qv-btn ghost" @click="tab = 'home'">← Back</button>
        <h2>{{ activeConv?.subject || 'Conversation' }}</h2>
        <div v-for="m in threadMessages" :key="m.id" class="qv-bubble" :class="m.direction">
          <div class="when">{{ formatTime(m.sent_at || m.created_at) }}
            <span v-if="m.is_auto_reply" class="badge">Auto-reply</span>
          </div>
          <div class="body">{{ m.body_text || stripHtml(m.body_html) }}</div>
        </div>
        <form class="qv-reply" @submit.prevent="sendQuickReply">
          <textarea v-model="replyText" rows="3" placeholder="Reply…" />
          <button type="submit" class="qv-btn primary" :disabled="replyBusy || !replyText.trim()">
            {{ replyBusy ? 'Sending…' : 'Send' }}
          </button>
        </form>
      </div>

      <div v-else-if="tab === 'tasks'" class="qv-pane">
        <div class="qv-sorters">
          <button type="button" :class="{ on: taskView === 'mine' }" @click="loadTasks('mine')">My tasks</button>
          <button type="button" :class="{ on: taskView === 'assigned' }" @click="loadTasks('assigned')">Assigned to me</button>
        </div>
        <button
          v-for="t in tasks"
          :key="t.id"
          type="button"
          class="qv-row"
          @click="toggleTask(t)"
        >
          <div class="meta">
            <strong>{{ t.title }}</strong>
            <small>{{ t.status }} · {{ t.due_at ? formatTime(t.due_at) : 'No due date' }} · tap to toggle</small>
          </div>
        </button>
        <div v-if="!tasks.length" class="qv-pad muted">No open tasks.</div>
      </div>

      <div v-else-if="tab === 'calendar'" class="qv-pane">
        <div class="qv-day-nav">
          <button type="button" class="qv-btn ghost" @click="shiftDay(-1)">‹</button>
          <input v-model="day" type="date" class="qv-date" @change="loadCalendar" />
          <button type="button" class="qv-btn ghost" @click="shiftDay(1)">›</button>
          <button type="button" class="qv-btn ghost" :class="{ on: showOffice }" @click="toggleOffice">
            {{ showOffice ? 'My day' : 'Office' }}
          </button>
        </div>
        <template v-if="!showOffice">
          <div v-for="item in dayItems" :key="item.id" class="qv-row">
            <div class="meta">
              <strong>{{ item.title || item.kind }}</strong>
              <small>{{ formatTime(item.startAt) }} · {{ item.location || '—' }}</small>
            </div>
            <a
              v-if="item.canJoin"
              class="qv-btn primary sm"
              :href="joinHref(item)"
              @click="extendForMeeting(item)"
            >Join</a>
          </div>
          <div v-if="!dayItems.length" class="qv-pad muted">Nothing scheduled.</div>
        </template>
        <template v-else>
          <div v-for="s in officeSlots" :key="s.id" class="qv-row">
            <div class="meta">
              <strong>{{ s.office_name || 'Office' }}</strong>
              <small>{{ formatTime(s.start_at) }} – {{ formatTime(s.end_at) }} · {{ s.status || '—' }}</small>
            </div>
          </div>
          <div v-if="!officeSlots.length" class="qv-pad muted">No office slots for this day.</div>
        </template>
      </div>

      <div v-else-if="tab === 'contacts'" class="qv-pane">
        <div v-for="c in contacts" :key="c.id" class="qv-row">
          <div class="meta">
            <strong>{{ c.display_name || c.email }}</strong>
            <small>{{ c.email }} · {{ c.trust_status }}</small>
          </div>
        </div>
        <div v-if="!contacts.length" class="qv-pad muted">No contacts yet.</div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';

const route = useRoute();
const router = useRouter();
const apiBase = '/api/quick-view';

const loading = ref(true);
const error = ref('');
const tokenInfo = ref(null);
const passcode = ref('');
const unlocking = ref(false);
const session = ref(null);
const expiresAt = ref(null);
const agencyName = ref('');
const tab = ref('home');
const sort = ref('all');
const conversations = ref([]);
const activeConv = ref(null);
const threadMessages = ref([]);
const tasks = ref([]);
const taskView = ref('mine');
const day = ref(new Date().toISOString().slice(0, 10));
const dayItems = ref([]);
const showOffice = ref(false);
const officeSlots = ref([]);
const contacts = ref([]);
let heartbeatTimer = null;

const filteredConversations = computed(() => {
  let list = conversations.value || [];
  if (sort.value === 'unread') list = list.filter((c) => c.is_unread);
  if (sort.value === 'needs') list = list.filter((c) => ['new', 'needs_reply'].includes(c.status));
  return list;
});

function authHeaders() {
  const h = {};
  const tok = session.value;
  if (tok) h['X-Quick-View-Session'] = tok;
  return h;
}

const isDelivery = computed(() => route.name === 'QuickViewDeliveryAccess' || route.meta?.quickViewDelivery === true);

async function loadTokenInfo() {
  loading.value = true;
  error.value = '';
  try {
    const token = String(route.params.token || '');
    const path = isDelivery.value ? `/d/${encodeURIComponent(token)}` : `/t/${encodeURIComponent(token)}`;
    const { data } = await axios.get(`${apiBase}${path}`, {
      params: { join: route.query.join, id: route.query.id }
    });
    tokenInfo.value = data;
    agencyName.value = data.agencyName || '';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Invalid Quick View link';
  } finally {
    loading.value = false;
  }
}

async function unlock() {
  unlocking.value = true;
  error.value = '';
  try {
    const token = String(route.params.token || '');
    const body = {
      passcode: passcode.value,
      agencyId: tokenInfo.value?.agencyId || null
    };
    if (route.query.join && route.query.id) {
      body.meetingEventType = String(route.query.join);
      body.meetingEventId = Number(route.query.id);
    }
    const path = isDelivery.value
      ? `/d/${encodeURIComponent(token)}/unlock`
      : `/t/${encodeURIComponent(token)}/unlock`;
    const { data } = await axios.post(`${apiBase}${path}`, body);
    session.value = data.sessionToken;
    expiresAt.value = data.expiresAt;
    startHeartbeat();
    await loadHome();
    if (route.query.join && route.query.id) {
      const joinType = String(route.query.join);
      const id = String(route.query.id);
      const pathJoin = joinType === 'supervision'
        ? `/join/supervision/${encodeURIComponent(id)}`
        : `/join/team-meeting/${encodeURIComponent(id)}`;
      window.location.href = pathJoin;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unlock failed';
  } finally {
    unlocking.value = false;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    try {
      const { data } = await axios.post(`${apiBase}/session/heartbeat`, {}, { headers: authHeaders() });
      expiresAt.value = data.expiresAt;
    } catch {
      session.value = null;
      stopHeartbeat();
    }
  }, 60000);
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function loadHome() {
  const { data } = await axios.get(`${apiBase}/home`, { headers: authHeaders() });
  conversations.value = data.conversations || [];
  tab.value = 'home';
}

async function openConversation(c) {
  activeConv.value = c;
  const { data } = await axios.get(`${apiBase}/conversations/${c.id}`, { headers: authHeaders() });
  threadMessages.value = data.messages || [];
  tab.value = 'thread';
  c.is_unread = 0;
}

async function loadTasks(view = 'mine') {
  taskView.value = view;
  tab.value = 'tasks';
  const { data } = await axios.get(`${apiBase}/tasks`, { headers: authHeaders(), params: { view } });
  tasks.value = data.tasks || [];
}
function switchTasks() { loadTasks(taskView.value); }

async function loadCalendar() {
  tab.value = 'calendar';
  const { data } = await axios.get(`${apiBase}/calendar/day`, { headers: authHeaders(), params: { day: day.value } });
  dayItems.value = data.items || [];
}
function switchCalendar() { loadCalendar(); }
function shiftDay(delta) {
  const d = new Date(`${day.value}T12:00:00`);
  d.setDate(d.getDate() + delta);
  day.value = d.toISOString().slice(0, 10);
  if (showOffice.value) loadOffice();
  else loadCalendar();
}
async function toggleOffice() {
  showOffice.value = !showOffice.value;
  if (showOffice.value) await loadOffice();
  else await loadCalendar();
}
async function loadOffice() {
  const { data } = await axios.get(`${apiBase}/office`, { headers: authHeaders(), params: { day: day.value } });
  officeSlots.value = data.slots || [];
}

async function loadContacts() {
  tab.value = 'contacts';
  try {
    const { data } = await axios.get(`${apiBase}/contacts`, { headers: authHeaders() });
    contacts.value = data.contacts || [];
  } catch {
    contacts.value = [];
  }
}

const replyText = ref('');
const replyBusy = ref(false);
async function sendQuickReply() {
  if (!activeConv.value?.id || !replyText.value.trim()) return;
  replyBusy.value = true;
  try {
    await axios.post(
      `${apiBase}/conversations/${activeConv.value.id}/reply`,
      { text: replyText.value.trim() },
      { headers: authHeaders() }
    );
    replyText.value = '';
    await openConversation(activeConv.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Reply failed';
  } finally {
    replyBusy.value = false;
  }
}

async function toggleTask(task) {
  const next = ['completed', 'done'].includes(String(task.status || '').toLowerCase())
    ? 'open'
    : 'completed';
  try {
    await axios.patch(`${apiBase}/tasks/${task.id}/status`, { status: next }, { headers: authHeaders() });
    await loadTasks(taskView.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not update task';
  }
}

function joinHref(item) {
  const kind = String(item.kind || '').toUpperCase();
  if (kind.includes('SUPERVISION')) return `/join/supervision/${encodeURIComponent(item.joinKey)}`;
  return `/join/team-meeting/${encodeURIComponent(item.joinKey)}`;
}
function extendForMeeting(item) {
  axios.post(`${apiBase}/session/heartbeat`, { meetingEndsAt: item.endAt }, { headers: authHeaders() }).catch(() => {});
}

async function logout() {
  await axios.post(`${apiBase}/session/logout`, {}, { headers: authHeaders() }).catch(() => {});
  session.value = null;
  stopHeartbeat();
  passcode.value = '';
}

function channelIcon(ch) {
  const c = String(ch || '');
  if (c === 'sms') return '📱';
  if (c === 'secure') return '🔒';
  if (c === 'call' || c === 'voicemail') return '📞';
  return '✉';
}
function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}
function formatExpiry(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleTimeString();
  } catch {
    return '';
  }
}

onMounted(loadTokenInfo);
onUnmounted(stopHeartbeat);
</script>

<style scoped>
.qv { min-height: 100vh; background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; }
.qv-top { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #1e293b; }
.qv-brand { font-weight: 800; }
.qv-sub { font-size: 11px; color: #94a3b8; }
.qv-gate, .qv-pad { padding: 24px 16px; }
.qv-form { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.qv-pin { font-size: 28px; letter-spacing: 0.4em; text-align: center; padding: 12px; border-radius: 12px; border: 1px solid #334155; background: #1e293b; color: #fff; }
.qv-btn { border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
.qv-btn.primary { background: #166534; color: #fff; }
.qv-btn.ghost { background: transparent; color: #cbd5e1; }
.qv-btn.sm { padding: 6px 10px; font-size: 12px; }
.qv-hint { font-size: 12px; color: #94a3b8; margin-top: 16px; }
.qv-err { margin: 12px 16px; padding: 10px; background: #7f1d1d; border-radius: 8px; }
.qv-tabs { display: flex; gap: 4px; padding: 8px; border-bottom: 1px solid #1e293b; overflow-x: auto; }
.qv-tabs button { flex: 1; background: #1e293b; color: #cbd5e1; border: none; border-radius: 8px; padding: 8px; font-weight: 700; }
.qv-tabs button.on { background: #166534; color: #fff; }
.qv-sorters, .qv-day-nav { display: flex; gap: 6px; padding: 8px 12px; flex-wrap: wrap; align-items: center; }
.qv-sorters button { background: #1e293b; color: #94a3b8; border: none; border-radius: 999px; padding: 6px 10px; font-size: 12px; }
.qv-sorters button.on { background: #334155; color: #fff; }
.qv-row { width: 100%; display: flex; gap: 10px; align-items: center; text-align: left; background: transparent; border: none; border-bottom: 1px solid #1e293b; padding: 12px 16px; color: inherit; cursor: pointer; }
.qv-row.unread strong { color: #fff; }
.qv-row .meta { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qv-row .meta strong { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qv-row .meta small { font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { font-size: 10px; background: #854d0e; color: #fef9c3; border-radius: 999px; padding: 2px 6px; font-weight: 800; }
.qv-bubble { margin: 10px 16px; padding: 10px 12px; border-radius: 12px; background: #1e293b; }
.qv-bubble.outbound { background: #14532d; }
.qv-bubble .when { font-size: 11px; color: #94a3b8; margin-bottom: 4px; }
.qv-reply { display: grid; gap: 8px; margin: 12px 16px 20px; }
.qv-reply textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #f8fafc;
  padding: 10px;
  resize: vertical;
}
.qv-date { background: #1e293b; color: #fff; border: 1px solid #334155; border-radius: 8px; padding: 6px; }
.muted { color: #94a3b8; }
</style>
