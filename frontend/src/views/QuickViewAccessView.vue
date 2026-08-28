<template>
  <div class="qv" :style="brandStyle">
    <header class="qv-top">
      <div class="qv-brand-row">
        <img v-if="agencyLogoUrl" :src="agencyLogoUrl" alt="" class="qv-logo" />
        <div>
          <div class="qv-brand">{{ agencyName || 'Quick View' }}</div>
          <div class="qv-sub" v-if="session">Expires {{ formatExpiry(expiresAt) }}</div>
        </div>
      </div>
      <button v-if="session" type="button" class="qv-btn ghost" @click="logout">Lock</button>
    </header>

    <div v-if="homeScreenTip && !session" class="qv-homescreen">
      <strong>Add to Home Screen</strong>
      <p>
        On this tenant Quick View page, use Share → Add to Home Screen.
        Keep <strong>Open as Web App</strong> on — it should open this tenant’s Quick View (not the main login).
      </p>
      <button type="button" class="qv-btn ghost sm" @click="dismissHomeTip">Got it</button>
    </div>

    <div v-if="error" class="qv-err">
      {{ error }}
      <button v-if="session" type="button" class="qv-btn ghost sm" @click="retryHome">Retry</button>
    </div>
    <div v-if="loading && !session" class="qv-pad">Loading…</div>

    <section v-else-if="!session && !loading" class="qv-gate">
      <img v-if="agencyLogoUrl" :src="agencyLogoUrl" alt="" class="qv-gate-logo" />
      <h1>{{ agencyName || 'Quick View' }}</h1>
      <template v-if="isLocked">
        <p>Quick View is locked after 3 incorrect passcode attempts.</p>
        <p class="qv-hint">
          Sign in to the portal and reset your 6-digit passcode under My Dashboard → Settings → Privacy &amp; Quick View.
        </p>
        <a v-if="loginUrl" class="qv-btn primary" :href="loginUrl">Sign in to reset</a>
      </template>
      <template v-else>
        <p v-if="tokenInfo">Hi {{ tokenInfo.firstName || 'there' }} — enter your 6-digit passcode.</p>
        <p v-else-if="!error">Validating your private link…</p>
        <form v-if="tokenInfo" class="qv-form" @submit.prevent="unlock">
          <input
            v-model="passcode"
            class="qv-pin"
            type="password"
            inputmode="numeric"
            maxlength="6"
            pattern="\d{6}"
            autocomplete="one-time-code"
            placeholder="••••••"
            aria-label="6-digit Quick View passcode"
          />
          <button type="submit" class="qv-btn primary" :disabled="unlocking || passcode.length !== 6">
            {{ unlocking ? 'Opening…' : 'Open' }}
          </button>
        </form>
        <p class="qv-hint">
          Passcodes are never emailed. Reset yours from My Dashboard → Settings → Privacy &amp; Quick View.
        </p>
      </template>
    </section>

    <template v-if="session">
      <nav class="qv-tabs">
        <button type="button" :class="{ on: tab === 'home' }" @click="tab = 'home'; loadHome()">Messages</button>
        <button type="button" :class="{ on: tab === 'tasks' }" @click="switchTasks">Tasks</button>
        <button type="button" :class="{ on: tab === 'calendar' }" @click="switchCalendar">Calendar</button>
        <button type="button" :class="{ on: tab === 'contacts' }" @click="loadContacts">Contacts</button>
      </nav>

      <div v-if="tab === 'home'" class="qv-pane">
        <div class="qv-toolbar">
          <div class="qv-sorters">
            <button type="button" :class="{ on: sort === 'all' }" @click="sort = 'all'">All</button>
            <button type="button" :class="{ on: sort === 'unread' }" @click="sort = 'unread'">Unread</button>
            <button type="button" :class="{ on: sort === 'needs' }" @click="sort = 'needs'">Needs reply</button>
          </div>
          <button type="button" class="qv-btn primary sm" @click="showCompose = true">New message</button>
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
        <div v-if="!filteredConversations.length" class="qv-pad muted">No messages in your personal inbox.</div>
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
        <div class="qv-toolbar">
          <div class="qv-sorters">
            <button type="button" :class="{ on: taskView === 'assigned' }" @click="loadTasks('assigned')">Assigned to me</button>
            <button type="button" :class="{ on: taskView === 'mine' }" @click="loadTasks('mine')">My tasks</button>
          </div>
          <button type="button" class="qv-btn primary sm" @click="showNewTask = true">Add task</button>
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
        <div class="qv-toolbar">
          <div class="qv-pad muted" style="padding: 8px 0; margin: 0;">Saved contacts</div>
          <button type="button" class="qv-btn primary sm" @click="showNewContact = true">Add contact</button>
        </div>
        <div v-for="c in contacts" :key="c.id" class="qv-row">
          <div class="meta">
            <strong>{{ c.display_name || c.email }}</strong>
            <small>{{ c.email }} · {{ c.trust_status }}</small>
          </div>
          <button type="button" class="qv-btn ghost sm" @click="composeTo(c)">Message</button>
        </div>
        <div v-if="!contacts.length" class="qv-pad muted">No contacts yet.</div>
      </div>
    </template>

    <div v-if="showCompose" class="qv-modal" @click.self="showCompose = false">
      <form class="qv-sheet" @submit.prevent="sendCompose">
        <h3>New message</h3>
        <label>To</label>
        <input v-model="composeToEmail" type="email" required placeholder="email@example.com" />
        <label>Subject</label>
        <input v-model="composeSubject" type="text" placeholder="Subject" />
        <label>Message</label>
        <textarea v-model="composeText" rows="4" required placeholder="Write your message…" />
        <div class="qv-sheet-actions">
          <button type="button" class="qv-btn ghost" @click="showCompose = false">Cancel</button>
          <button type="submit" class="qv-btn primary" :disabled="composeBusy">{{ composeBusy ? 'Sending…' : 'Send' }}</button>
        </div>
      </form>
    </div>

    <div v-if="showNewTask" class="qv-modal" @click.self="showNewTask = false">
      <form class="qv-sheet" @submit.prevent="createTask">
        <h3>Add task</h3>
        <label>Title</label>
        <input v-model="newTaskTitle" type="text" required placeholder="What needs doing?" />
        <label>Due (optional)</label>
        <input v-model="newTaskDue" type="date" />
        <div class="qv-sheet-actions">
          <button type="button" class="qv-btn ghost" @click="showNewTask = false">Cancel</button>
          <button type="submit" class="qv-btn primary" :disabled="taskBusy">{{ taskBusy ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>

    <div v-if="showNewContact" class="qv-modal" @click.self="showNewContact = false">
      <form class="qv-sheet" @submit.prevent="createContact">
        <h3>Add contact</h3>
        <label>Name</label>
        <input v-model="newContactName" type="text" placeholder="Display name" />
        <label>Email</label>
        <input v-model="newContactEmail" type="email" required placeholder="email@example.com" />
        <label>Phone (optional)</label>
        <input v-model="newContactPhone" type="tel" placeholder="Phone" />
        <div class="qv-sheet-actions">
          <button type="button" class="qv-btn ghost" @click="showNewContact = false">Cancel</button>
          <button type="submit" class="qv-btn primary" :disabled="contactBusy">{{ contactBusy ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';

const BOOKMARK_KEY = 'plottwist.quickViewBookmark';
const TOKEN_KEY = 'plottwist.quickViewToken';
const HOME_TIP_KEY = 'plottwist.quickViewHomeTipDismissed';
const LOGIN_URL_KEY = 'plottwist.quickViewLoginUrl';

const route = useRoute();
const apiBase = '/api/quick-view';

const loading = ref(true);
const error = ref('');
const tokenInfo = ref(null);
const passcode = ref('');
const unlocking = ref(false);
const session = ref(null);
const expiresAt = ref(null);
const agencyName = ref('');
const agencyLogoUrl = ref('');
const agencyPrimaryColor = ref('');
const loginUrl = ref('');
const isLocked = ref(false);
const tab = ref('home');
const sort = ref('all');
const conversations = ref([]);
const activeConv = ref(null);
const threadMessages = ref([]);
const tasks = ref([]);
const taskView = ref('assigned');
const day = ref(new Date().toISOString().slice(0, 10));
const dayItems = ref([]);
const showOffice = ref(false);
const officeSlots = ref([]);
const contacts = ref([]);
const homeScreenTip = ref(false);
let heartbeatTimer = null;

const showCompose = ref(false);
const composeToEmail = ref('');
const composeSubject = ref('');
const composeText = ref('');
const composeBusy = ref(false);
const showNewTask = ref(false);
const newTaskTitle = ref('');
const newTaskDue = ref('');
const taskBusy = ref(false);
const showNewContact = ref(false);
const newContactName = ref('');
const newContactEmail = ref('');
const newContactPhone = ref('');
const contactBusy = ref(false);
const replyText = ref('');
const replyBusy = ref(false);

const brandStyle = computed(() => {
  const primary = agencyPrimaryColor.value || '#166534';
  return {
    '--qv-primary': primary,
    '--qv-primary-soft': primary
  };
});

const filteredConversations = computed(() => {
  let list = conversations.value || [];
  if (sort.value === 'unread') list = list.filter((c) => c.is_unread);
  if (sort.value === 'needs') list = list.filter((c) => ['new', 'needs_reply'].includes(c.status));
  return list;
});

function authHeaders() {
  const h = {};
  const tok = session.value;
  if (tok && tok !== 'cookie') h['X-Quick-View-Session'] = tok;
  return h;
}

const isDelivery = computed(() =>
  route.name === 'QuickViewDeliveryAccess'
  || route.name === 'QuickViewDeliveryShort'
  || route.meta?.quickViewDelivery === true
);

const sessionOnly = computed(() => route.meta?.quickViewSessionOnly === true);

async function resumeSession() {
  loading.value = true;
  error.value = '';
  try {
    let stored = '';
    try {
      stored = String(sessionStorage.getItem('plottwist.quickViewSession') || '').trim();
    } catch { /* ignore */ }
    if (stored) session.value = stored;
    else session.value = 'cookie';

    const { data } = await axios.post(
      `${apiBase}/session/heartbeat`,
      {},
      { headers: authHeaders(), withCredentials: true }
    );
    expiresAt.value = data.expiresAt;
    if (stored) session.value = stored;
    startHeartbeat();
    // Branding from tenant endpoint when possible
    try {
      const host = window.location.hostname;
      const tenant = await axios.get(`${apiBase}/tenant`, {
        params: { host: host.replace(/^qv\./, '') },
        withCredentials: true
      });
      agencyName.value = tenant.data.agencyName || agencyName.value;
      agencyLogoUrl.value = tenant.data.agencyLogoUrl || '';
      agencyPrimaryColor.value = tenant.data.agencyPrimaryColor || '';
      loginUrl.value = tenant.data.loginUrl || '';
      installQuickViewManifest();
    } catch { /* ignore */ }
    await loadHome();
  } catch {
    session.value = null;
    try { sessionStorage.removeItem('plottwist.quickViewSession'); } catch { /* ignore */ }
    // Back to PIN launcher
    window.location.replace('/qv');
  } finally {
    loading.value = false;
  }
}

function rememberBookmark() {
  const token = String(route.params.token || '').trim();
  if (!token) return;
  const path = isDelivery.value
    ? `/quick-view/d/${token}`
    : (route.name === 'QuickViewTokenShort' || isQvHostPath() ? `/t/${token}` : `/quick-view/${token}`);
  try {
    localStorage.setItem(BOOKMARK_KEY, path);
    localStorage.setItem(TOKEN_KEY, token);
  } catch { /* ignore */ }
}

function isQvHostPath() {
  try {
    return String(window.location.hostname || '').toLowerCase().startsWith('qv');
  } catch {
    return false;
  }
}

function installQuickViewManifest() {
  if (typeof document === 'undefined') return;
  const origin = window.location.origin;
  const name = agencyName.value ? `${agencyName.value} Quick View` : 'Quick View';
  const iconSrc = agencyLogoUrl.value || '/branding/plottwisthq-platform-bg.png';
  const theme = agencyPrimaryColor.value || '#0f172a';
  // Server-served manifest so iOS "Open as Web App" uses this origin's root — not plottwisthq /
  const href =
    `${apiBase}/pwa-manifest?` +
    new URLSearchParams({
      origin,
      name,
      theme,
      icon: iconSrc
    }).toString();
  try {
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.setAttribute('href', href);
    const apple = document.getElementById('app-apple-touch-icon');
    if (apple && agencyLogoUrl.value) apple.setAttribute('href', agencyLogoUrl.value);
    document.title = name;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', theme);
  } catch { /* ignore */ }
}

function dismissHomeTip() {
  homeScreenTip.value = false;
  try {
    localStorage.setItem(HOME_TIP_KEY, '1');
  } catch { /* ignore */ }
}

async function loadTokenInfo() {
  loading.value = true;
  error.value = '';
  rememberBookmark();
  try {
    const token = String(route.params.token || '');
    const path = isDelivery.value ? `/d/${encodeURIComponent(token)}` : `/t/${encodeURIComponent(token)}`;
    const { data } = await axios.get(`${apiBase}${path}`, {
      params: { join: route.query.join, id: route.query.id },
      withCredentials: true
    });
    tokenInfo.value = data;
    agencyName.value = data.agencyName || '';
    agencyLogoUrl.value = data.agencyLogoUrl || '';
    agencyPrimaryColor.value = data.agencyPrimaryColor || '';
    loginUrl.value = data.loginUrl || '';
    isLocked.value = !!data.isLocked || !!data.requiresReset;
    if (loginUrl.value) {
      try { localStorage.setItem(LOGIN_URL_KEY, loginUrl.value); } catch { /* ignore */ }
    }
    installQuickViewManifest();
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
    const { data } = await axios.post(`${apiBase}${path}`, body, { withCredentials: true });
    session.value = data.sessionToken;
    expiresAt.value = data.expiresAt;
    rememberBookmark();
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
    const err = e?.response?.data?.error || {};
    error.value = err.message || 'Unlock failed';
    if (err.requiresReset || err.code === 'locked') {
      isLocked.value = true;
      if (err.loginUrl) loginUrl.value = err.loginUrl;
    }
  } finally {
    unlocking.value = false;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    try {
      const { data } = await axios.post(
        `${apiBase}/session/heartbeat`,
        {},
        { headers: authHeaders(), withCredentials: true }
      );
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
  error.value = '';
  try {
    const { data } = await axios.get(`${apiBase}/home`, {
      headers: authHeaders(),
      withCredentials: true
    });
    conversations.value = data.conversations || [];
    tab.value = 'home';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load messages';
  }
}

async function retryHome() {
  await loadHome();
}

async function openConversation(c) {
  activeConv.value = c;
  const { data } = await axios.get(`${apiBase}/conversations/${c.id}`, {
    headers: authHeaders(),
    withCredentials: true
  });
  threadMessages.value = data.messages || [];
  tab.value = 'thread';
  c.is_unread = 0;
}

async function loadTasks(view = 'assigned') {
  taskView.value = view;
  tab.value = 'tasks';
  const { data } = await axios.get(`${apiBase}/tasks`, {
    headers: authHeaders(),
    withCredentials: true,
    params: { view }
  });
  tasks.value = data.tasks || [];
}
function switchTasks() { loadTasks(taskView.value); }

async function loadCalendar() {
  tab.value = 'calendar';
  const { data } = await axios.get(`${apiBase}/calendar/day`, {
    headers: authHeaders(),
    withCredentials: true,
    params: { day: day.value }
  });
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
  const { data } = await axios.get(`${apiBase}/office`, {
    headers: authHeaders(),
    withCredentials: true,
    params: { day: day.value }
  });
  officeSlots.value = data.slots || [];
}

async function loadContacts() {
  tab.value = 'contacts';
  try {
    const { data } = await axios.get(`${apiBase}/contacts`, {
      headers: authHeaders(),
      withCredentials: true
    });
    contacts.value = data.contacts || [];
  } catch {
    contacts.value = [];
  }
}

function composeTo(c) {
  composeToEmail.value = c.email || '';
  composeSubject.value = '';
  composeText.value = '';
  showCompose.value = true;
}

async function sendCompose() {
  if (!composeToEmail.value.trim() || !composeText.value.trim()) return;
  composeBusy.value = true;
  error.value = '';
  try {
    await axios.post(
      `${apiBase}/compose`,
      {
        to: composeToEmail.value.trim(),
        subject: composeSubject.value.trim(),
        text: composeText.value.trim()
      },
      { headers: authHeaders(), withCredentials: true }
    );
    showCompose.value = false;
    composeToEmail.value = '';
    composeSubject.value = '';
    composeText.value = '';
    await loadHome();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not send message';
  } finally {
    composeBusy.value = false;
  }
}

async function createTask() {
  if (!newTaskTitle.value.trim()) return;
  taskBusy.value = true;
  error.value = '';
  try {
    await axios.post(
      `${apiBase}/tasks`,
      { title: newTaskTitle.value.trim(), dueDate: newTaskDue.value || null },
      { headers: authHeaders(), withCredentials: true }
    );
    showNewTask.value = false;
    newTaskTitle.value = '';
    newTaskDue.value = '';
    await loadTasks(taskView.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not create task';
  } finally {
    taskBusy.value = false;
  }
}

async function createContact() {
  if (!newContactEmail.value.trim()) return;
  contactBusy.value = true;
  error.value = '';
  try {
    await axios.post(
      `${apiBase}/contacts`,
      {
        email: newContactEmail.value.trim(),
        displayName: newContactName.value.trim() || null,
        phone: newContactPhone.value.trim() || null
      },
      { headers: authHeaders(), withCredentials: true }
    );
    showNewContact.value = false;
    newContactName.value = '';
    newContactEmail.value = '';
    newContactPhone.value = '';
    await loadContacts();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not save contact';
  } finally {
    contactBusy.value = false;
  }
}

async function sendQuickReply() {
  if (!activeConv.value?.id || !replyText.value.trim()) return;
  replyBusy.value = true;
  try {
    await axios.post(
      `${apiBase}/conversations/${activeConv.value.id}/reply`,
      { text: replyText.value.trim() },
      { headers: authHeaders(), withCredentials: true }
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
  const nextStatus = ['completed', 'done'].includes(String(task.status || '').toLowerCase())
    ? 'open'
    : 'completed';
  try {
    await axios.patch(
      `${apiBase}/tasks/${task.id}/status`,
      { status: nextStatus },
      { headers: authHeaders(), withCredentials: true }
    );
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
  axios
    .post(
      `${apiBase}/session/heartbeat`,
      { meetingEndsAt: item.endAt },
      { headers: authHeaders(), withCredentials: true }
    )
    .catch(() => {});
}

async function logout() {
  await axios
    .post(`${apiBase}/session/logout`, {}, { headers: authHeaders(), withCredentials: true })
    .catch(() => {});
  session.value = null;
  stopHeartbeat();
  passcode.value = '';
  error.value = '';
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

watch([agencyName, agencyLogoUrl, agencyPrimaryColor], () => {
  if (route.params.token) installQuickViewManifest();
});

onMounted(() => {
  try {
    homeScreenTip.value = localStorage.getItem(HOME_TIP_KEY) !== '1';
  } catch {
    homeScreenTip.value = true;
  }
  if (sessionOnly.value || (!route.params.token && route.name === 'QuickViewApp')) {
    resumeSession();
  } else {
    loadTokenInfo();
  }
});
onUnmounted(() => {
  stopHeartbeat();
});
</script>

<style scoped>
.qv {
  box-sizing: border-box;
  width: 100%;
  min-width: 100%;
  max-width: 100vw;
  min-height: 100vh;
  min-height: 100dvh;
  margin: 0;
  background: #0f172a;
  color: #f8fafc;
  font-family: system-ui, -apple-system, sans-serif;
  overflow-x: hidden;
}
.qv *,
.qv *::before,
.qv *::after {
  box-sizing: border-box;
}
.qv-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #1e293b;
}
.qv-brand-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.qv-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: contain;
  background: #fff;
  flex-shrink: 0;
}
.qv-gate-logo {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  object-fit: contain;
  background: #fff;
  margin-bottom: 12px;
}
.qv-brand { font-weight: 800; font-size: 1.05rem; }
.qv-sub { font-size: 11px; color: #94a3b8; }
.qv-homescreen {
  margin: 12px 16px;
  padding: 12px;
  border-radius: 12px;
  background: #1e293b;
  border: 1px solid #334155;
}
.qv-homescreen strong { display: block; margin-bottom: 4px; }
.qv-homescreen p { margin: 0 0 8px; font-size: 13px; color: #cbd5e1; line-height: 1.4; }
.qv-gate, .qv-pad { padding: 24px 16px; }
.qv-gate h1 {
  margin: 0 0 8px;
  font-size: clamp(1.75rem, 8vw, 2.4rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #e2e8f0;
}
.qv-gate p { margin: 0; line-height: 1.4; }
.qv-form { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; width: 100%; }
.qv-pin {
  width: 100%;
  font-size: 28px;
  letter-spacing: 0.35em;
  text-align: center;
  padding: 14px 12px;
  border-radius: 12px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #fff;
  -webkit-text-security: disc;
  text-security: disc;
}
.qv-btn { border: none; border-radius: 10px; padding: 12px 14px; font-weight: 700; cursor: pointer; }
.qv-btn.primary { background: var(--qv-primary, #166534); color: #fff; width: 100%; }
.qv-btn.ghost { background: transparent; color: #cbd5e1; }
.qv-btn.sm { padding: 6px 10px; font-size: 12px; width: auto; }
.qv-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 16px;
  line-height: 1.45;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.qv-err {
  margin: 12px 16px;
  padding: 10px 12px;
  background: #7f1d1d;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.qv-tabs { display: flex; gap: 4px; padding: 8px; border-bottom: 1px solid #1e293b; overflow-x: auto; }
.qv-tabs button { flex: 1; min-width: 0; background: #1e293b; color: #cbd5e1; border: none; border-radius: 8px; padding: 10px 8px; font-weight: 700; }
.qv-tabs button.on { background: var(--qv-primary, #166534); color: #fff; }
.qv-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 12px; flex-wrap: wrap; }
.qv-sorters, .qv-day-nav { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.qv-sorters button { background: #1e293b; color: #94a3b8; border: none; border-radius: 999px; padding: 6px 10px; font-size: 12px; }
.qv-sorters button.on { background: #334155; color: #fff; }
.qv-day-nav { padding: 8px 12px; }
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
.qv-reply textarea,
.qv-sheet input,
.qv-sheet textarea {
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
.qv-modal {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.72);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 40;
  padding: 12px;
}
.qv-sheet {
  width: 100%;
  max-width: 480px;
  background: #111827;
  border: 1px solid #334155;
  border-radius: 16px 16px 12px 12px;
  padding: 16px;
  display: grid;
  gap: 8px;
}
.qv-sheet h3 { margin: 0 0 4px; }
.qv-sheet label { font-size: 12px; color: #94a3b8; }
.qv-sheet-actions { display: flex; gap: 8px; margin-top: 8px; }
.qv-sheet-actions .qv-btn { flex: 1; }
.qv-btn.ghost.on { color: #fff; background: #334155; }
</style>
