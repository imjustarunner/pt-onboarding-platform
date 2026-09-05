<template>
  <div class="msg-hub">
    <header class="msg-hub-head">
      <div>
        <h2 class="msg-hub-title">Messages</h2>
        <p class="msg-hub-sub">
          Pick a person, choose how to send, then write in the box at the bottom.
        </p>
      </div>
      <button type="button" class="btn btn-primary" @click="openNewConversation">
        + New conversation
      </button>
    </header>

    <div v-if="error" class="msg-hub-error">{{ error }}</div>

    <div class="msg-hub-grid">
      <section class="msg-hub-list-col" aria-label="People">
        <div class="msg-hub-filters">
          <button
            v-for="f in listFilters"
            :key="f.id"
            type="button"
            class="msg-hub-chip"
            :class="{ active: listFilter === f.id }"
            @click="setListFilter(f.id)"
          >
            {{ f.label }}
          </button>
        </div>
        <label class="msg-hub-search">
          <span class="sr-only">Filter list</span>
          <input
            v-model="listSearch"
            type="search"
            placeholder="Filter this list…"
          />
        </label>
        <div v-if="loadingList" class="msg-hub-muted pad">Loading…</div>
        <ul v-else-if="filteredPeople.length" class="msg-hub-list">
          <li
            v-for="p in filteredPeople"
            :key="p.personKey"
            class="msg-hub-row"
            :class="{ active: selected?.personKey === p.personKey }"
            @click="pickPerson(p)"
          >
            <div class="msg-hub-avatar" aria-hidden="true">{{ initials(p.displayName) }}</div>
            <div class="msg-hub-row-body">
              <div class="msg-hub-row-top">
                <strong>{{ p.displayName }}</strong>
                <span v-if="p.occurredAt" class="msg-hub-time">{{ formatTime(p.occurredAt) }}</span>
              </div>
              <p class="msg-hub-snippet">
                <span v-if="p.agencyName" class="msg-hub-agency">{{ p.agencyName }}</span>
                <span v-if="p.agencyName && (p.relationshipMeta || kindsLabel(p.kinds))"> · </span>
                {{ p.relationshipMeta || kindsLabel(p.kinds) }}
              </p>
            </div>
            <span class="msg-hub-kind" :class="`kind-${p.preferredMethod || 'secure'}`">
              {{ methodLabel(p.preferredMethod) || kindFromKinds(p.kinds) }}
            </span>
          </li>
        </ul>
        <div v-else class="msg-hub-empty">
          <p>{{ emptyListCopy }}</p>
          <button type="button" class="btn btn-primary" @click="openNewConversation">
            + New conversation
          </button>
        </div>
      </section>

      <section class="msg-hub-thread-col" aria-label="Conversation">
        <template v-if="selected">
          <header class="msg-hub-thread-head">
            <div class="msg-hub-avatar lg" aria-hidden="true">{{ initials(selected.displayName) }}</div>
            <div>
              <h3>{{ selected.displayName }}</h3>
              <p class="msg-hub-muted">
                <span v-if="selected.agencyName" class="msg-hub-agency">{{ selected.agencyName }}</span>
                <span v-if="selected.agencyName && (selected.relationshipMeta || kindsLabel(selected.kinds))"> · </span>
                {{ selected.relationshipMeta || kindsLabel(selected.kinds) }}
              </p>
            </div>
          </header>

          <div class="msg-hub-channel-toggles" role="tablist" aria-label="Send via">
            <button
              v-for="ch in methodButtons"
              :key="ch.id"
              type="button"
              class="msg-hub-channel"
              :class="{ active: sendMethod === ch.id, recommended: ch.recommended }"
              :disabled="!ch.available"
              :title="ch.reason || ''"
              @click="selectMethod(ch.id)"
            >
              {{ methodLabel(ch.id) }}
              <span v-if="ch.recommended && ch.available" class="msg-hub-rec">Best</span>
            </button>
          </div>
          <p v-if="secureHint" class="msg-hub-secure-hint">{{ secureHint }}</p>
          <label
            v-if="showSecureEmailToggle"
            class="msg-hub-secure-toggle"
          >
            <input
              type="checkbox"
              :checked="sendMethod === 'secure'"
              @change="onSecureToggle($event)"
            />
            Send as secure portal message (recommended for active clients)
          </label>

          <div class="msg-hub-timeline">
            <div v-if="loadingTimeline" class="msg-hub-muted">Loading conversation…</div>
            <template v-else-if="timeline.length">
              <div
                v-for="msg in timeline"
                :key="msg.id"
                class="msg-hub-bubble"
                :class="[msg.direction, `ch-${msg.channel}`]"
              >
                <span class="msg-hub-bubble-ch">{{ methodLabel(msg.channel) }}</span>
                <p>{{ msg.bodyPreview }}</p>
                <div class="msg-hub-bubble-meta">
                  <time>{{ formatTime(msg.createdAt) }}</time>
                  <button
                    v-if="msg.channel === 'email' && msg.meta?.conversationId"
                    type="button"
                    class="msg-hub-like"
                    title="Like"
                    :disabled="reactingId === msg.id"
                    @click="reactToMessage(msg)"
                  >
                    {{ reactingId === msg.id ? '…' : '❤️' }}
                  </button>
                </div>
              </div>
            </template>
            <div v-else class="msg-hub-empty soft">
              No messages yet. Write below and send.
            </div>
          </div>

          <div class="msg-hub-composer">
            <template v-if="sendMethod === 'email'">
              <input
                v-model="composeSubject"
                type="text"
                class="msg-hub-subject"
                placeholder="Subject"
              />
              <div class="msg-hub-email-row">
                <label>From</label>
                <select v-model="composeFromAliasId" class="msg-hub-alias">
                  <option v-for="a in emailAliases" :key="a.id" :value="a.id">
                    {{ a.email }} ({{ a.displayName }})
                  </option>
                  <option v-if="!emailAliases.length" :value="null">messages@ (default)</option>
                </select>
              </div>
              <input
                v-model="composeCc"
                type="text"
                class="msg-hub-subject"
                placeholder="Cc (comma-separated emails)"
              />
              <input
                v-model="composeBcc"
                type="text"
                class="msg-hub-subject"
                placeholder="Bcc (comma-separated emails)"
              />
              <div class="msg-hub-attach-row">
                <label class="msg-hub-attach-btn">
                  Attach files
                  <input type="file" multiple hidden @change="onAttachFiles" />
                </label>
                <ul v-if="composeAttachments.length" class="msg-hub-attach-list">
                  <li v-for="(f, i) in composeAttachments" :key="i">
                    {{ f.filename }}
                    <button type="button" @click="composeAttachments.splice(i, 1)">×</button>
                  </li>
                </ul>
              </div>
            </template>
            <textarea
              ref="composeEl"
              v-model="composeBody"
              rows="3"
              :placeholder="composerPlaceholder"
              @keydown.meta.enter.prevent="send"
              @keydown.ctrl.enter.prevent="send"
            />
            <div class="msg-hub-compose-actions">
              <span class="msg-hub-muted">Via {{ methodLabel(sendMethod) || '…' }}</span>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="sending || !composeBody.trim() || !activeMethod?.available"
                @click="send"
              >
                {{ sending ? 'Sending…' : 'Send' }}
              </button>
            </div>
            <p v-if="sendError" class="msg-hub-error inline">{{ sendError }}</p>
          </div>
        </template>
        <div v-else class="msg-hub-thread-empty">
          <h3>Who do you want to reach?</h3>
          <p>
            Browse your clients by initials or code, open someone recent, or search by name, email, or phone.
          </p>
          <button type="button" class="btn btn-primary" @click="openNewConversation">
            + New conversation
          </button>
        </div>
      </section>

      <aside class="msg-hub-context" aria-label="Context">
        <template v-if="selected">
          <section class="msg-hub-panel">
            <h3>Profile</h3>
            <p class="msg-hub-profile-name">{{ selected.displayName }}</p>
            <p class="msg-hub-muted">
              <span v-if="selected.agencyName" class="msg-hub-agency">{{ selected.agencyName }}</span>
              <span v-if="selected.agencyName && (selected.relationshipMeta || kindsLabel(selected.kinds))"> · </span>
              {{ selected.relationshipMeta || kindsLabel(selected.kinds) }}
            </p>
            <ul class="msg-hub-kv">
              <li v-if="selected.agencyName"><span>Agency</span><strong>{{ selected.agencyName }}</strong></li>
              <li v-if="selected.email"><span>Email</span><strong>{{ selected.email }}</strong></li>
              <li v-if="selected.phone"><span>Phone</span><strong>{{ selected.phone }}</strong></li>
              <li>
                <span>Preferred</span>
                <strong>{{ methodLabel(selected.preferredMethod) || '—' }}</strong>
              </li>
            </ul>
          </section>
          <section class="msg-hub-panel">
            <h3>Methods</h3>
            <ul class="msg-hub-methods">
              <li v-for="m in selected.methods || []" :key="m.id" :class="{ off: !m.available }">
                <strong>{{ methodLabel(m.id) }}</strong>
                <span>{{ m.available ? (m.recommended ? 'Recommended' : 'Available') : m.reason }}</span>
              </li>
            </ul>
          </section>
        </template>
        <section v-else class="msg-hub-panel msg-hub-panel-muted">
          <p>Select a person to see contact details and available send methods.</p>
        </section>
        <section class="msg-hub-panel msg-hub-banner">
          <p>One conversation per person. Channels are how you send — not separate inboxes.</p>
        </section>
      </aside>
    </div>

    <div v-if="showNew" class="msg-hub-modal" @click.self="showNew = false">
      <div class="msg-hub-modal-card" role="dialog" aria-labelledby="msg-hub-new-title">
        <header>
          <h3 id="msg-hub-new-title">New conversation</h3>
          <button type="button" class="msg-hub-modal-close" @click="showNew = false">×</button>
        </header>
        <div class="msg-hub-modal-tabs">
          <button
            v-for="t in newTabs"
            :key="t.id"
            type="button"
            class="msg-hub-chip"
            :class="{ active: newTab === t.id }"
            @click="setNewTab(t.id)"
          >
            {{ t.label }}
          </button>
        </div>
        <p class="msg-hub-muted">{{ newTabHint }}</p>
        <input
          v-if="newTab === 'search'"
          ref="newSearchEl"
          v-model="peopleQuery"
          type="search"
          class="msg-hub-modal-input"
          placeholder="Name, initials, code, email, or phone…"
          @input="onPeopleSearch"
        />
        <div v-if="peopleLoading" class="msg-hub-muted">Loading…</div>
        <ul v-else-if="peopleResults.length" class="msg-hub-people">
          <li v-for="p in peopleResults" :key="p.personKey" @click="pickPerson(p)">
            <div class="msg-hub-avatar" aria-hidden="true">{{ initials(p.displayName) }}</div>
            <div>
              <strong>{{ p.displayName }}</strong>
              <p class="msg-hub-muted">
                <span v-if="p.agencyName" class="msg-hub-agency">{{ p.agencyName }}</span>
                <span v-if="p.agencyName && (p.relationshipMeta || kindsLabel(p.kinds))"> · </span>
                {{ p.relationshipMeta || kindsLabel(p.kinds) }}
              </p>
              <p class="msg-hub-methods-inline">
                <span
                  v-for="m in (p.methods || []).filter((x) => x.available)"
                  :key="m.id"
                  class="msg-hub-kind"
                  :class="`kind-${m.id}`"
                >{{ methodLabel(m.id) }}</span>
              </p>
            </div>
          </li>
        </ul>
        <p v-else class="msg-hub-muted">{{ emptyPickerCopy }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const loadingList = ref(false);
const loadingTimeline = ref(false);
const peopleLoading = ref(false);
const sending = ref(false);
const error = ref('');
const sendError = ref('');
const people = ref([]);
const listFilter = ref('recent');
const listSearch = ref('');
const selected = ref(null);
const timeline = ref([]);
const sendMethod = ref('secure');
const composeBody = ref('');
const composeSubject = ref('');
const composeCc = ref('');
const composeBcc = ref('');
const composeAttachments = ref([]);
const composeFromAliasId = ref(null);
const emailAliases = ref([]);
const reactingId = ref(null);
const showNew = ref(false);
const newTab = ref('caseload');
const peopleQuery = ref('');
const peopleResults = ref([]);
const newSearchEl = ref(null);
const composeEl = ref(null);
let peopleTimer = null;

const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const listFilters = [
  { id: 'recent', label: 'Recent' },
  { id: 'caseload', label: 'My clients' },
  { id: 'clients', label: 'Clients' },
  { id: 'guardians', label: 'Guardians' },
  { id: 'staff', label: 'Staff' }
];

const newTabs = [
  { id: 'caseload', label: 'My clients' },
  { id: 'recent', label: 'Recent' },
  { id: 'staff', label: 'Staff' },
  { id: 'guardians', label: 'Guardians' },
  { id: 'clients', label: 'Clients' },
  { id: 'search', label: 'Search' }
];

const filteredPeople = computed(() => {
  let list = [...(people.value || [])];
  if (listFilter.value === 'guardians') {
    list = list.filter((p) => (p.kinds || []).includes('guardian'));
  } else if (listFilter.value === 'clients') {
    list = list.filter((p) => (p.kinds || []).includes('client'));
  } else if (listFilter.value === 'staff') {
    list = list.filter((p) =>
      (p.kinds || []).some((k) => ['employee', 'staff', 'team', 'school_staff'].includes(k))
    );
  } else if (listFilter.value === 'caseload') {
    list = list.filter((p) => (p.kinds || []).includes('client'));
  }
  const q = listSearch.value.trim().toLowerCase();
  if (q) {
    list = list.filter((p) => fuzzyMatchPerson(p, q));
  }
  return list;
});

const emptyListCopy = computed(() => {
  if (listFilter.value === 'caseload' || listFilter.value === 'clients') {
    return 'No clients in this view yet. Try Search (letters can match anywhere in the name).';
  }
  if (listFilter.value === 'recent') {
    return 'No recent people yet. Open New conversation and browse My clients.';
  }
  if (listFilter.value === 'staff') return 'No staff in this list. Try Search.';
  if (listFilter.value === 'guardians') return 'No guardians in this list. Try Search.';
  return 'Nothing in this filter. Try My clients or Search.';
});

const newTabHint = computed(() => {
  if (newTab.value === 'caseload') {
    return 'Your assigned clients — shown by name, initials, or code so you can find them without memorizing a full name.';
  }
  if (newTab.value === 'recent') {
    return 'People you recently messaged across every agency you belong to — each row shows the person and their agency.';
  }
  if (newTab.value === 'staff') return 'Staff and school staff across your agencies.';
  if (newTab.value === 'guardians') return 'Guardians / parents with portal access.';
  if (newTab.value === 'clients') return 'Clients across your agencies.';
  return 'Type at least 2 characters — matches anywhere in the name (typos OK). Initials, code, email, or phone also work.';
});

function fuzzyMatchPerson(p, q) {
  const hay = `${p.displayName || ''} ${p.relationshipMeta || ''} ${p.agencyName || ''} ${p.email || ''} ${p.phone || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9@+.\s]/g, ' ');
  const needle = String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9@+.\s]/g, ' ')
    .trim();
  if (!needle) return true;
  if (hay.includes(needle)) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => hay.includes(t))) return true;
  // light typo tolerance: consecutive chars appear in order
  const compact = hay.replace(/\s+/g, '');
  const n = needle.replace(/\s+/g, '');
  if (n.length >= 2) {
    let i = 0;
    for (const ch of compact) {
      if (ch === n[i]) i += 1;
      if (i >= n.length) return true;
    }
  }
  return false;
}

const emptyPickerCopy = computed(() => {
  if (newTab.value === 'search' && peopleQuery.value.trim().length >= 2) return 'No matches.';
  if (newTab.value === 'search') return 'Start typing to search.';
  return 'No people in this list yet.';
});

const methodButtons = computed(() => selected.value?.methods || []);
const activeMethod = computed(() =>
  (selected.value?.methods || []).find((m) => m.id === sendMethod.value)
);

const showSecureEmailToggle = computed(() => {
  if (!selected.value?.isActiveClient && !selected.value?.secureDefault) return false;
  const secure = (selected.value?.methods || []).find((m) => m.id === 'secure');
  const email = (selected.value?.methods || []).find((m) => m.id === 'email');
  return !!(secure?.available && email?.available);
});

const secureHint = computed(() => {
  if (!selected.value) return '';
  if (selected.value.isActiveClient || selected.value.secureDefault) {
    if (sendMethod.value === 'secure') {
      return 'Active client: Secure is on. Uncheck below (or pick Email) for a normal email if they prefer not to open the portal.';
    }
    if (sendMethod.value === 'email') {
      return 'Sending as regular email — not a secure portal message. Replies look like normal email.';
    }
  }
  if (sendMethod.value === 'email') {
    return 'Regular email via messages@ — looks like normal email in and out.';
  }
  return '';
});

const composerPlaceholder = computed(() => {
  if (sendMethod.value === 'sms') return 'Write a text message…';
  if (sendMethod.value === 'email') return 'Write an email…';
  if (sendMethod.value === 'internal') return 'Write an internal message…';
  return 'Write a secure message…';
});

function onSecureToggle(ev) {
  const on = !!ev?.target?.checked;
  if (on) selectMethod('secure');
  else selectMethod('email');
}

function methodLabel(id) {
  const map = { secure: 'Secure', sms: 'SMS', email: 'Email', internal: 'Internal' };
  return map[id] || '';
}

function kindsLabel(kinds) {
  if (!kinds?.length) return '';
  return kinds.map((k) => String(k).replace(/_/g, ' ')).join(' · ');
}

function kindFromKinds(kinds) {
  if ((kinds || []).includes('guardian') || (kinds || []).includes('client')) return 'Client';
  if ((kinds || []).some((k) => ['employee', 'staff', 'team'].includes(k))) return 'Staff';
  return 'Person';
}

function initials(label) {
  const parts = String(label || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatTime(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

async function focusComposer() {
  await nextTick();
  composeEl.value?.focus?.();
}

function selectMethod(id) {
  sendMethod.value = id;
  focusComposer();
}

async function fetchPeople({ browse, q, limit = 40 } = {}) {
  const params = { allAgencies: true, limit };
  if (agencyId.value) params.agencyId = agencyId.value;
  if (browse) params.browse = browse;
  if (q) params.q = q;
  const { data } = await api.get('/messages/hub/people', { params, skipGlobalLoading: true });
  return Array.isArray(data?.results) ? data.results : [];
}

async function loadList() {
  loadingList.value = true;
  error.value = '';
  try {
    const browse =
      listFilter.value === 'caseload' ? 'caseload' : listFilter.value === 'recent' ? 'recent' : 'suggested';
    people.value = await fetchPeople({ browse });
  } catch (e) {
    people.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not load people';
  } finally {
    loadingList.value = false;
  }
}

function setListFilter(id) {
  listFilter.value = id;
  loadList();
}

async function openNewConversation() {
  showNew.value = true;
  peopleQuery.value = '';
  newTab.value = 'caseload';
  await setNewTab('caseload');
}

async function setNewTab(id) {
  newTab.value = id;
  peopleQuery.value = '';
  peopleLoading.value = true;
  try {
    if (id === 'search') {
      peopleResults.value = [];
      await nextTick();
      newSearchEl.value?.focus?.();
    } else if (id === 'staff' || id === 'guardians' || id === 'clients') {
      const browse = id === 'clients' ? 'caseload' : 'suggested';
      const all = await fetchPeople({ browse, limit: 60 });
      peopleResults.value = all.filter((p) => {
        if (id === 'staff') {
          return (p.kinds || []).some((k) => ['employee', 'staff', 'team', 'school_staff'].includes(k));
        }
        if (id === 'guardians') return (p.kinds || []).includes('guardian');
        return (p.kinds || []).includes('client');
      });
    } else {
      peopleResults.value = await fetchPeople({ browse: id, limit: 40 });
    }
  } catch (e) {
    peopleResults.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not load people';
  } finally {
    peopleLoading.value = false;
  }
}

function onPeopleSearch() {
  clearTimeout(peopleTimer);
  const q = peopleQuery.value.trim();
  if (q.length < 2) {
    peopleResults.value = [];
    return;
  }
  peopleTimer = setTimeout(async () => {
    peopleLoading.value = true;
    try {
      peopleResults.value = await fetchPeople({ q, limit: 25 });
    } catch (e) {
      peopleResults.value = [];
      error.value = e?.response?.data?.error?.message || 'Search failed';
    } finally {
      peopleLoading.value = false;
    }
  }, 220);
}

async function pickPerson(person) {
  showNew.value = false;
  selected.value = person;
  sendMethod.value = person.preferredMethod || person.methods?.find((m) => m.available)?.id || 'secure';
  composeBody.value = '';
  composeSubject.value = '';
  composeCc.value = '';
  composeBcc.value = '';
  composeAttachments.value = [];
  await loadEmailAliases(person?.agencyId || agencyId.value);
  sendError.value = '';
  if (!people.value.some((p) => p.personKey === person.personKey)) {
    people.value = [person, ...people.value];
  }
  await loadTimeline(person.personKey);
  await focusComposer();
}

async function loadTimeline(personKey) {
  if (!personKey) {
    timeline.value = [];
    return;
  }
  loadingTimeline.value = true;
  try {
    const aid = selected.value?.agencyId || agencyId.value;
    const reqParams = {};
    if (aid) reqParams.agencyId = aid;
    const { data } = await api.get(`/messages/hub/people/${encodeURIComponent(personKey)}/timeline`, {
      params: reqParams,
      skipGlobalLoading: true
    });
    if (data?.person) selected.value = data.person;
    timeline.value = Array.isArray(data?.items) ? data.items : [];
  } catch (e) {
    timeline.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not load timeline';
  } finally {
    loadingTimeline.value = false;
  }
}

async function loadEmailAliases(aid) {
  emailAliases.value = [];
  composeFromAliasId.value = null;
  if (!aid) return;
  try {
    const { data } = await api.get('/messages/hub/aliases', {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    emailAliases.value = Array.isArray(data?.aliases) ? data.aliases : [];
    const messages = emailAliases.value.find((a) => a.kind === 'messages');
    composeFromAliasId.value = messages?.id || emailAliases.value[0]?.id || null;
  } catch {
    emailAliases.value = [];
  }
}

function readFileAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        contentBase64: base64
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onAttachFiles(ev) {
  const files = Array.from(ev.target?.files || []);
  ev.target.value = '';
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) {
      sendError.value = `${file.name} is too large (max 8MB)`;
      continue;
    }
    try {
      const att = await readFileAsAttachment(file);
      composeAttachments.value.push(att);
    } catch {
      sendError.value = `Could not attach ${file.name}`;
    }
  }
}

async function reactToMessage(msg) {
  const conversationId = msg?.meta?.conversationId;
  if (!conversationId) return;
  reactingId.value = msg.id;
  try {
    await api.post('/messages/hub/react', {
      agencyId: selected.value?.agencyId || agencyId.value,
      conversationId,
      emoji: '❤️'
    });
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Could not react';
  } finally {
    reactingId.value = null;
  }
}

async function send() {
  if (!selected.value?.personKey || !composeBody.value.trim()) return;
  const sendAgencyId = selected.value.agencyId || agencyId.value;
  if (!sendAgencyId) {
    sendError.value = 'Missing agency for this conversation';
    return;
  }
  if (!activeMethod.value?.available) {
    sendError.value = activeMethod.value?.reason || 'That method is not available';
    return;
  }
  sending.value = true;
  sendError.value = '';
  try {
    const payload = {
      agencyId: sendAgencyId,
      personKey: selected.value.personKey,
      method: sendMethod.value,
      body: composeBody.value.trim(),
      subject: composeSubject.value.trim() || undefined
    };
    if (sendMethod.value === 'email') {
      if (composeCc.value.trim()) payload.cc = composeCc.value.trim();
      if (composeBcc.value.trim()) payload.bcc = composeBcc.value.trim();
      if (composeAttachments.value.length) payload.attachments = composeAttachments.value;
      if (composeFromAliasId.value) payload.fromAliasIdentityId = composeFromAliasId.value;
    }
    await api.post('/messages/hub/send', payload);
    composeBody.value = '';
    composeSubject.value = '';
    composeCc.value = '';
    composeBcc.value = '';
    composeAttachments.value = [];
    await loadTimeline(selected.value.personKey);
  } catch (e) {
    sendError.value = e?.response?.data?.error?.message || 'Send failed';
  } finally {
    sending.value = false;
  }
}

watch(
  () => agencyStore.currentAgency?.id,
  () => {
    selected.value = null;
    timeline.value = [];
    loadList();
  }
);

onMounted(loadList);

defineExpose({ reload: loadList });
</script>

<style scoped>
.msg-hub {
  --mh-primary: var(--primary, var(--agency-primary-color, #1f6b4a));
  --mh-ink: #0f172a;
  --mh-muted: #64748b;
  --mh-line: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
  color: var(--mh-ink);
}
.msg-hub-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
  flex-shrink: 0;
}
.msg-hub-title {
  margin: 0;
  font-size: clamp(1.35rem, 2vw, 1.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: color-mix(in srgb, var(--mh-primary) 45%, var(--mh-ink));
}
.msg-hub-sub { margin: 4px 0 0; color: var(--mh-muted); font-size: 13px; max-width: 42rem; }
.msg-hub-error {
  color: #b91c1c;
  background: #fef2f2;
  padding: 10px 12px;
  border-radius: 10px;
  flex-shrink: 0;
}
.msg-hub-error.inline { margin: 0; padding: 8px 10px; }
.msg-hub-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr) minmax(200px, 260px);
  gap: 10px;
  overflow: hidden;
}
.msg-hub-list-col,
.msg-hub-thread-col,
.msg-hub-context {
  background: #fff;
  border: 1px solid var(--mh-line);
  border-radius: 14px;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.msg-hub-filters,
.msg-hub-modal-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 12px 0;
}
.msg-hub-modal-tabs { padding: 0 0 8px; }
.msg-hub-chip {
  border: 1px solid var(--mh-line);
  background: #f8fafc;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}
.msg-hub-chip.active {
  background: color-mix(in srgb, var(--mh-primary) 14%, #fff);
  border-color: color-mix(in srgb, var(--mh-primary) 40%, var(--mh-line));
  color: var(--mh-primary);
}
.msg-hub-search { display: block; padding: 10px 12px; }
.msg-hub-search input,
.msg-hub-modal-input,
.msg-hub-subject,
.msg-hub-composer textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.msg-hub-list {
  list-style: none;
  margin: 0;
  padding: 0 0 12px;
  overflow: auto;
  flex: 1;
}
.msg-hub-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  border-top: 1px solid #f1f5f9;
  align-items: center;
}
.msg-hub-row:hover,
.msg-hub-row.active { background: color-mix(in srgb, var(--mh-primary) 6%, #fff); }
.msg-hub-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mh-primary) 18%, #e2e8f0);
  color: var(--mh-primary);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
}
.msg-hub-avatar.lg { width: 48px; height: 48px; font-size: 14px; }
.msg-hub-row-top { display: flex; justify-content: space-between; gap: 8px; }
.msg-hub-time,
.msg-hub-muted,
.msg-hub-snippet { margin: 0; font-size: 12px; color: var(--mh-muted); }
.msg-hub-snippet { margin-top: 4px; color: #475569; }
.msg-hub-agency {
  font-weight: 700;
  color: var(--mh-primary);
}
.msg-hub-kind {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
  white-space: nowrap;
}
.kind-sms { background: #ecfdf5; color: #047857; }
.kind-secure { background: #eff6ff; color: #1d4ed8; }
.kind-internal { background: #f5f3ff; color: #6d28d9; }
.kind-email { background: #fff7ed; color: #c2410c; }
.msg-hub-empty,
.msg-hub-thread-empty {
  padding: 28px 20px;
  text-align: center;
  color: var(--mh-muted);
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}
.msg-hub-empty.soft { padding: 16px; }
.msg-hub-empty p { margin: 0; max-width: 22rem; }
.pad { padding: 12px; }
.msg-hub-thread-empty h3 { margin: 0; color: var(--mh-ink); }
.msg-hub-thread-head {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--mh-line);
  flex-shrink: 0;
}
.msg-hub-thread-head h3 { margin: 0; font-size: 1.05rem; }
.msg-hub-channel-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--mh-line);
  flex-shrink: 0;
}
.msg-hub-channel {
  border: 1px solid var(--mh-line);
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.msg-hub-channel.active {
  border-color: var(--mh-primary);
  background: color-mix(in srgb, var(--mh-primary) 12%, #fff);
  color: var(--mh-primary);
}
.msg-hub-channel:disabled { opacity: 0.4; cursor: not-allowed; }
.msg-hub-secure-hint {
  margin: 0;
  padding: 0 16px 8px;
  font-size: 12px;
  color: var(--mh-muted);
  line-height: 1.4;
}
.msg-hub-secure-toggle {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 0 16px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--mh-ink);
  cursor: pointer;
}
.msg-hub-secure-toggle input {
  margin-top: 2px;
}
.msg-hub-rec {
  font-size: 9px;
  text-transform: uppercase;
  background: var(--mh-primary);
  color: #fff;
  border-radius: 4px;
  padding: 1px 4px;
}
.msg-hub-timeline {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #f8fafc;
}
.msg-hub-bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid var(--mh-line);
  align-self: flex-start;
}
.msg-hub-bubble.outbound {
  align-self: flex-end;
  background: color-mix(in srgb, var(--mh-primary) 10%, #fff);
}
.msg-hub-bubble p { margin: 4px 0; white-space: pre-wrap; font-size: 14px; }
.msg-hub-bubble time { font-size: 11px; color: var(--mh-muted); }
.msg-hub-bubble-ch {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--mh-primary);
}
.msg-hub-composer {
  padding: 12px 16px;
  border-top: 1px solid var(--mh-line);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  background: #fff;
}
.msg-hub-subject {
  width: 100%;
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}
.msg-hub-email-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--mh-muted);
}
.msg-hub-alias {
  flex: 1;
  border: 1px solid var(--mh-line);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
}
.msg-hub-attach-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.msg-hub-attach-btn {
  cursor: pointer;
  color: var(--mh-primary);
  font-weight: 650;
}
.msg-hub-attach-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.msg-hub-attach-list li {
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.msg-hub-attach-list button {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.msg-hub-bubble-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.msg-hub-like {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  opacity: 0.75;
}
.msg-hub-like:hover { opacity: 1; }
.msg-hub-compose-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.msg-hub-context { padding: 12px; gap: 10px; overflow: auto; }
.msg-hub-panel {
  border: 1px solid var(--mh-line);
  border-radius: 12px;
  padding: 12px;
  background: #fff;
}
.msg-hub-panel h3 { margin: 0 0 6px; font-size: 0.92rem; color: var(--mh-primary); }
.msg-hub-profile-name { margin: 0 0 4px; font-weight: 750; }
.msg-hub-kv { list-style: none; margin: 10px 0 0; padding: 0; }
.msg-hub-kv li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  padding: 4px 0;
  border-top: 1px solid #f1f5f9;
}
.msg-hub-kv span { color: var(--mh-muted); }
.msg-hub-methods { list-style: none; margin: 0; padding: 0; }
.msg-hub-methods li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  padding: 6px 0;
  border-top: 1px solid #f1f5f9;
}
.msg-hub-methods li.off { opacity: 0.55; }
.msg-hub-banner {
  background: color-mix(in srgb, var(--mh-primary) 10%, #fff);
  font-size: 13px;
  color: #334155;
}
.msg-hub-banner p { margin: 0; }
.msg-hub-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 16px;
}
.msg-hub-modal-card {
  width: min(520px, 100%);
  max-height: min(80vh, 640px);
  overflow: auto;
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}
.msg-hub-modal-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.msg-hub-modal-card h3 { margin: 0; }
.msg-hub-modal-close {
  border: 0;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}
.msg-hub-modal-input { margin: 10px 0; }
.msg-hub-people { list-style: none; margin: 0; padding: 0; }
.msg-hub-people li {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 10px;
  padding: 10px 4px;
  border-top: 1px solid #f1f5f9;
  cursor: pointer;
}
.msg-hub-people li:hover { background: #f8fafc; }
.msg-hub-methods-inline { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 1100px) {
  .msg-hub-grid { grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); }
  .msg-hub-context { display: none; }
}
@media (max-width: 800px) {
  .msg-hub-grid { grid-template-columns: 1fr; }
}
</style>
