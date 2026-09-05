<template>
  <div class="scm-overlay" @click.self="emitClose">
    <div class="scm-card" role="dialog" aria-labelledby="scm-title">
      <header class="scm-header">
        <div>
          <h3 id="scm-title">Start a conversation</h3>
          <p class="scm-sub">Search for a person or group to message.</p>
        </div>
        <button type="button" class="scm-close" aria-label="Close" @click="emitClose">×</button>
      </header>

      <div v-if="step === 'browse'" class="scm-body">
        <div class="scm-search-wrap">
          <span class="scm-search-icon" aria-hidden="true">⌕</span>
          <input
            ref="searchEl"
            v-model="query"
            type="search"
            class="scm-search"
            placeholder="Search clients, guardians, staff, school staff, or groups…"
            @input="onSearchInput"
          />
        </div>

        <div class="scm-chips" role="tablist">
          <button
            v-for="chip in chips"
            :key="chip.id"
            type="button"
            class="scm-chip"
            :class="{ active: activeChip === chip.id }"
            @click="setChip(chip.id)"
          >
            {{ chip.label }}
          </button>
        </div>

        <div v-if="loading" class="scm-muted">Loading…</div>
        <div v-else class="scm-sections">
          <template v-if="activeChip === 'all' && !searching">
            <section v-if="(sections.recent || []).length" class="scm-section">
              <div class="scm-section-head">
                <h4>Recent people</h4>
                <button type="button" class="scm-see-all" @click="setChip('recent')">See all</button>
              </div>
              <div class="scm-grid">
                <button
                  v-for="p in (sections.recent || []).slice(0, previewCount)"
                  :key="p.personKey"
                  type="button"
                  class="scm-person"
                  :class="{ selected: pendingPick?.personKey === p.personKey }"
                  @click="pick(p)"
                >
                  <span class="scm-avatar">{{ initials(p.displayName) }}</span>
                  <span class="scm-person-text">
                    <strong>{{ p.displayName }}</strong>
                    <small>{{ meta(p) }}</small>
                  </span>
                  <span class="scm-chev" aria-hidden="true">›</span>
                </button>
              </div>
            </section>

            <section
              v-for="sec in categorySections"
              :key="sec.id"
              class="scm-section"
            >
              <div class="scm-section-head">
                <h4>{{ sec.label }}</h4>
                <button
                  v-if="sec.id === 'groups' || (sections[sec.id] || []).length"
                  type="button"
                  class="scm-see-all"
                  @click="setChip(sec.id)"
                >
                  See all
                </button>
              </div>

              <div v-if="sec.id === 'groups'">
                <button type="button" class="scm-person scm-new-group scm-new-group-wide" @click="openCreateGroup">
                  <span class="scm-avatar scm-avatar-plus" aria-hidden="true">+</span>
                  <span class="scm-person-text">
                    <strong>Start a new group</strong>
                    <small>Create a named group chat</small>
                  </span>
                  <span class="scm-chev" aria-hidden="true">›</span>
                </button>
                <div v-if="(sections.groups || []).length" class="scm-grid">
                  <button
                    v-for="p in (sections.groups || []).slice(0, previewCount)"
                    :key="p.personKey"
                    type="button"
                    class="scm-person"
                    :class="{ selected: pendingPick?.personKey === p.personKey }"
                    @click="pick(p)"
                  >
                    <span class="scm-avatar">{{ initials(p.displayName) }}</span>
                    <span class="scm-person-text">
                      <strong>{{ p.displayName }}</strong>
                      <small>{{ meta(p) }}</small>
                    </span>
                    <span class="scm-chev" aria-hidden="true">›</span>
                  </button>
                </div>
                <p v-else class="scm-muted scm-empty-sec">No groups yet — start one above.</p>
              </div>

              <div v-else-if="(sections[sec.id] || []).length" class="scm-grid">
                <button
                  v-for="p in (sections[sec.id] || []).slice(0, previewCount)"
                  :key="p.personKey"
                  type="button"
                  class="scm-person"
                  :class="{ selected: pendingPick?.personKey === p.personKey }"
                  @click="pick(p)"
                >
                  <span class="scm-avatar">{{ initials(p.displayName) }}</span>
                  <span class="scm-person-text">
                    <strong>{{ p.displayName }}</strong>
                    <small>{{ meta(p) }}</small>
                  </span>
                  <span class="scm-chev" aria-hidden="true">›</span>
                </button>
              </div>
              <p v-else class="scm-muted scm-empty-sec">No {{ sec.label.toLowerCase() }} yet.</p>
            </section>
          </template>

          <template v-else>
            <section class="scm-section">
              <div class="scm-section-head">
                <h4>{{ chipTitle }}</h4>
              </div>

              <div v-if="activeChip === 'groups'" class="scm-groups-actions">
                <button type="button" class="scm-person scm-new-group scm-new-group-wide" @click="openCreateGroup">
                  <span class="scm-avatar scm-avatar-plus" aria-hidden="true">+</span>
                  <span class="scm-person-text">
                    <strong>Start a new group</strong>
                    <small>Create a named group chat for your team</small>
                  </span>
                  <span class="scm-chev" aria-hidden="true">›</span>
                </button>
              </div>

              <div v-if="chipPeople.length" class="scm-grid scm-grid-full">
                <button
                  v-for="p in chipPeople"
                  :key="p.personKey"
                  type="button"
                  class="scm-person"
                  :class="{ selected: pendingPick?.personKey === p.personKey }"
                  @click="pick(p)"
                >
                  <span class="scm-avatar">{{ initials(p.displayName) }}</span>
                  <span class="scm-person-text">
                    <strong>{{ p.displayName }}</strong>
                    <small>{{ meta(p) }}</small>
                  </span>
                  <span class="scm-chev" aria-hidden="true">›</span>
                </button>
              </div>
              <p v-else-if="activeChip !== 'groups'" class="scm-muted">
                {{ searching ? 'No matches. Try a different search, or start with someone outside the system below.' : 'Nothing in this list yet.' }}
              </p>
              <p v-else-if="!chipPeople.length" class="scm-muted">No groups yet — start one above.</p>
            </section>
          </template>

          <section class="scm-external">
            <h4>Can’t find the person?</h4>
            <p class="scm-muted">Start a new conversation with someone outside your system.</p>
            <div class="scm-external-grid">
              <button type="button" class="scm-external-card" @click="openExternal('email')">
                <span class="scm-ext-icon" aria-hidden="true">✉</span>
                <span>
                  <strong>Send an email to</strong>
                  <em>{{ externalHint?.channel === 'email' ? externalHint.value : 'new address…' }}</em>
                  <small>New external contact</small>
                </span>
              </button>
              <button type="button" class="scm-external-card" @click="openExternal('sms')">
                <span class="scm-ext-icon" aria-hidden="true">☎</span>
                <span>
                  <strong>Send a text to</strong>
                  <em>{{ externalHint?.channel === 'sms' ? externalHint.value : 'new number…' }}</em>
                  <small>New external contact</small>
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>

      <div v-else-if="step === 'create-group'" class="scm-body">
        <button type="button" class="scm-back" @click="step = 'browse'">← Back</button>
        <h4 class="scm-ext-title">Start a new group</h4>
        <p class="scm-muted">Name the group, then open it in Team chat. You can add members after it’s created.</p>

        <label class="scm-field">
          <span>Group name</span>
          <input
            v-model="newGroupName"
            type="text"
            maxlength="120"
            placeholder="e.g. Caseload stand-up"
            @keydown.enter.prevent="createGroup"
          />
        </label>
        <label class="scm-check">
          <input v-model="newGroupPrivate" type="checkbox" />
          <span>Private (invite-only)</span>
        </label>
        <p v-if="createGroupError" class="scm-error">{{ createGroupError }}</p>
      </div>

      <div v-else-if="step === 'external'" class="scm-body">
        <button type="button" class="scm-back" @click="step = 'browse'">← Back</button>
        <h4 class="scm-ext-title">
          {{ externalForm.channel === 'sms' ? 'Text someone new' : 'Email someone new' }}
        </h4>
        <p class="scm-muted">
          Create or link a Contact before sending so this address stays reusable.
        </p>

        <label class="scm-field">
          <span>{{ externalForm.channel === 'sms' ? 'Phone' : 'Email' }}</span>
          <input
            v-if="externalForm.channel === 'email'"
            v-model="externalForm.email"
            type="email"
            required
            placeholder="name@example.com"
            @change="runLookup"
          />
          <input
            v-else
            v-model="externalForm.phone"
            type="tel"
            required
            placeholder="(303) 555-0123"
            @change="runLookup"
          />
        </label>
        <label class="scm-field">
          <span>Full name</span>
          <input v-model="externalForm.fullName" type="text" placeholder="Optional" />
        </label>

        <div v-if="lookupLoading" class="scm-muted">Checking for existing people…</div>
        <div v-else-if="lookupUsers.length || lookupContacts.length" class="scm-lookup">
          <h5>Add to existing</h5>
          <button
            v-for="u in lookupUsers"
            :key="`u-${u.userId}`"
            type="button"
            class="scm-person"
            @click="linkExistingUser(u)"
          >
            <span class="scm-avatar">{{ initials(u.displayName) }}</span>
            <span class="scm-person-text">
              <strong>{{ u.displayName }}</strong>
              <small>{{ u.email || u.phone || u.role }} · in system</small>
            </span>
          </button>
          <button
            v-for="c in lookupContacts"
            :key="`c-${c.contactId}`"
            type="button"
            class="scm-person"
            @click="linkExistingContact(c)"
          >
            <span class="scm-avatar">{{ initials(c.displayName) }}</span>
            <span class="scm-person-text">
              <strong>{{ c.displayName }}</strong>
              <small>Saved contact</small>
            </span>
          </button>
        </div>

        <div class="scm-create-block">
          <h5>Or create new contact</h5>
          <label class="scm-field">
            <span>Link to client (optional)</span>
            <select v-model="externalForm.clientId">
              <option value="">None</option>
              <option v-for="c in clientOptions" :key="c.personKey" :value="String(c.clientId)">
                {{ c.displayName }}
              </option>
            </select>
          </label>
          <label v-if="externalForm.clientId" class="scm-field">
            <span>Relationship to client</span>
            <select v-model="externalForm.relationshipType">
              <option value="parent">Parent / guardian</option>
              <option value="school_staff">School staff</option>
              <option value="case_manager">Case manager</option>
              <option value="referral_source">Referral source</option>
              <option value="other">Other contact</option>
            </select>
          </label>
        </div>

        <p v-if="externalError" class="scm-error">{{ externalError }}</p>
      </div>

      <footer class="scm-footer">
        <button type="button" class="btn btn-secondary" @click="emitClose">Cancel</button>
        <button
          v-if="step === 'external'"
          type="button"
          class="btn btn-primary"
          :disabled="savingExternal"
          @click="createAndContinue"
        >
          {{ savingExternal ? 'Saving…' : 'Continue' }}
        </button>
        <button
          v-else-if="step === 'create-group'"
          type="button"
          class="btn btn-primary"
          :disabled="creatingGroup || !newGroupName.trim()"
          @click="createGroup"
        >
          {{ creatingGroup ? 'Creating…' : 'Create group' }}
        </button>
        <button
          v-else
          type="button"
          class="btn btn-primary"
          :disabled="!pendingPick"
          @click="continuePick"
        >
          Continue
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'pick', 'open-group']);

const previewCount = 3;
const searchEl = ref(null);
const query = ref('');
const loading = ref(false);
const sections = ref({});
const externalHint = ref(null);
const searching = ref(false);
const activeChip = ref('all');
const pendingPick = ref(null);
const step = ref('browse'); // browse | external | create-group
const clientOptions = ref([]);

const newGroupName = ref('');
const newGroupPrivate = ref(false);
const creatingGroup = ref(false);
const createGroupError = ref('');

const externalForm = ref({
  channel: 'email',
  email: '',
  phone: '',
  fullName: '',
  clientId: '',
  relationshipType: 'other'
});
const lookupUsers = ref([]);
const lookupContacts = ref([]);
const lookupLoading = ref(false);
const savingExternal = ref(false);
const externalError = ref('');

let searchTimer = null;

const chips = [
  { id: 'all', label: 'Recent' },
  { id: 'clients', label: 'Clients' },
  { id: 'guardians', label: 'Guardians' },
  { id: 'staff', label: 'Staff' },
  { id: 'school_staff', label: 'School Staff' },
  { id: 'groups', label: 'Groups' }
];

const categorySections = [
  { id: 'clients', label: 'Clients' },
  { id: 'guardians', label: 'Guardians' },
  { id: 'staff', label: 'Staff' },
  { id: 'school_staff', label: 'School staff' },
  { id: 'groups', label: 'Groups' }
];

const chipTitle = computed(() => {
  if (searching.value) return 'Search results';
  if (activeChip.value === 'recent') return 'Recent people';
  return chips.find((c) => c.id === activeChip.value)?.label || 'People';
});

const chipPeople = computed(() => {
  if (searching.value && activeChip.value === 'all') {
    return sections.value.matches || [];
  }
  if (activeChip.value === 'recent') return sections.value.recent || [];
  if (activeChip.value === 'all') return sections.value.matches || [];
  return sections.value[activeChip.value] || [];
});

function isClient(p) {
  return (p.kinds || []).includes('client');
}
function isGuardian(p) {
  return (p.kinds || []).includes('guardian');
}
function isStaff(p) {
  return (
    (p.kinds || []).some((k) => ['employee', 'staff', 'team'].includes(k)) &&
    !(p.kinds || []).includes('school_staff')
  );
}
function isSchoolStaff(p) {
  return (p.kinds || []).includes('school_staff');
}

function kindPred(id) {
  if (id === 'clients') return isClient;
  if (id === 'guardians') return isGuardian;
  if (id === 'staff') return isStaff;
  if (id === 'school_staff') return isSchoolStaff;
  return null;
}

function mergeRecentFirst(recentPool, fillPool, pred) {
  const seen = new Set();
  const out = [];
  const push = (p) => {
    if (!p || (pred && !pred(p))) return;
    const key = p.personKey || (p.userId != null ? `u:${p.userId}` : p.displayName);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };
  for (const p of recentPool || []) push(p);
  for (const p of fillPool || []) push(p);
  return out;
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function meta(p) {
  return [p.relationshipMeta, p.title, p.agencyName].filter(Boolean).join(' · ') || '';
}

function emitClose() {
  emit('close');
}

function setChip(id) {
  activeChip.value = id;
  pendingPick.value = null;
}

function pick(p) {
  pendingPick.value = p;
  if ((p.kinds || []).includes('group')) {
    emit('open-group', p);
    emit('close');
    return;
  }
  emit('pick', p);
  emit('close');
}

function continuePick() {
  if (pendingPick.value) pick(pendingPick.value);
}

function openCreateGroup() {
  step.value = 'create-group';
  createGroupError.value = '';
  newGroupName.value = '';
  newGroupPrivate.value = false;
}

async function createGroup() {
  const name = newGroupName.value.trim();
  if (!name || !props.agencyId) return;
  creatingGroup.value = true;
  createGroupError.value = '';
  try {
    const { data } = await api.post(
      '/chat/channels',
      {
        agencyId: Number(props.agencyId),
        name,
        visibility: newGroupPrivate.value ? 'private' : 'public'
      },
      { skipGlobalLoading: true }
    );
    const threadId = data?.threadId || data?.channel?.thread_id || data?.channel?.id;
    emit('open-group', {
      kinds: ['group'],
      displayName: name,
      groupId: threadId ? Number(threadId) : null,
      agencyId: Number(props.agencyId),
      personKey: threadId ? `group:${threadId}@${props.agencyId}` : `group:new`
    });
    emit('close');
  } catch (e) {
    createGroupError.value =
      e?.response?.data?.error?.message || 'Could not create group. You may need channel create access.';
  } finally {
    creatingGroup.value = false;
  }
}

async function loadDirectory() {
  if (!props.agencyId) return;
  loading.value = true;
  try {
    const { data } = await api.get('/messages/hub/start-directory', {
      params: {
        agencyId: props.agencyId,
        q: query.value.trim() || undefined,
        allAgencies: true,
        perSection: previewCount
      },
      skipGlobalLoading: true
    });
    sections.value = data?.sections || {};
    externalHint.value = data?.externalHint || null;
    searching.value = !!data?.searching;
    if (searching.value) activeChip.value = 'all';
  } catch {
    sections.value = {};
    externalHint.value = null;
  } finally {
    loading.value = false;
  }
}

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadDirectory();
  }, 220);
}

async function loadClientOptions() {
  if (!props.agencyId) return;
  try {
    const { data } = await api.get('/messages/hub/people', {
      params: { agencyId: props.agencyId, browse: 'caseload', limit: 80, allAgencies: true },
      skipGlobalLoading: true
    });
    clientOptions.value = (data?.results || []).filter((p) => (p.kinds || []).includes('client') && p.clientId);
  } catch {
    clientOptions.value = [];
  }
}

function openExternal(channel) {
  step.value = 'external';
  externalError.value = '';
  externalForm.value = {
    channel,
    email: channel === 'email' && externalHint.value?.channel === 'email' ? externalHint.value.value : '',
    phone: channel === 'sms' && externalHint.value?.channel === 'sms' ? externalHint.value.value : '',
    fullName: '',
    clientId: '',
    relationshipType: 'other'
  };
  lookupUsers.value = [];
  lookupContacts.value = [];
  runLookup();
}

async function runLookup() {
  if (!props.agencyId) return;
  const email = externalForm.value.channel === 'email' ? externalForm.value.email.trim() : '';
  const phone = externalForm.value.channel === 'sms' ? externalForm.value.phone.trim() : '';
  if (!email && !phone) {
    lookupUsers.value = [];
    lookupContacts.value = [];
    return;
  }
  lookupLoading.value = true;
  try {
    const { data } = await api.get('/messages/hub/external-lookup', {
      params: {
        agencyId: props.agencyId,
        email: email || undefined,
        phone: phone || undefined,
        allAgencies: true
      },
      skipGlobalLoading: true
    });
    lookupUsers.value = data?.users || [];
    lookupContacts.value = data?.contacts || [];
  } catch {
    lookupUsers.value = [];
    lookupContacts.value = [];
  } finally {
    lookupLoading.value = false;
  }
}

async function linkExistingUser(u) {
  savingExternal.value = true;
  externalError.value = '';
  try {
    const { data } = await api.post(
      '/messages/hub/external-contact',
      {
        agencyId: props.agencyId,
        channel: externalForm.value.channel,
        email: externalForm.value.email || undefined,
        phone: externalForm.value.phone || undefined,
        fullName: externalForm.value.fullName || undefined,
        linkUserId: u.userId
      },
      { skipGlobalLoading: true }
    );
    if (data?.person) {
      emit('pick', data.person);
      emit('close');
    }
  } catch (e) {
    externalError.value = e?.response?.data?.error?.message || 'Could not link that person';
  } finally {
    savingExternal.value = false;
  }
}

async function linkExistingContact(c) {
  savingExternal.value = true;
  externalError.value = '';
  try {
    const { data } = await api.post(
      '/messages/hub/external-contact',
      {
        agencyId: props.agencyId,
        channel: externalForm.value.channel,
        existingContactId: c.contactId
      },
      { skipGlobalLoading: true }
    );
    if (data?.person) {
      emit('pick', data.person);
      emit('close');
    }
  } catch (e) {
    externalError.value = e?.response?.data?.error?.message || 'Could not open that contact';
  } finally {
    savingExternal.value = false;
  }
}

async function createAndContinue() {
  externalError.value = '';
  const ch = externalForm.value.channel;
  if (ch === 'email' && !externalForm.value.email.trim()) {
    externalError.value = 'Enter an email address';
    return;
  }
  if (ch === 'sms' && !externalForm.value.phone.trim()) {
    externalError.value = 'Enter a phone number';
    return;
  }
  savingExternal.value = true;
  try {
    const { data } = await api.post(
      '/messages/hub/external-contact',
      {
        agencyId: props.agencyId,
        channel: ch,
        email: externalForm.value.email || undefined,
        phone: externalForm.value.phone || undefined,
        fullName: externalForm.value.fullName || undefined,
        clientId: externalForm.value.clientId || undefined,
        relationshipType: externalForm.value.clientId
          ? externalForm.value.relationshipType
          : undefined
      },
      { skipGlobalLoading: true }
    );
    if (data?.person) {
      emit('pick', data.person);
      emit('close');
    } else {
      externalError.value = 'Contact saved but could not open conversation';
    }
  } catch (e) {
    externalError.value = e?.response?.data?.error?.message || 'Could not create contact';
  } finally {
    savingExternal.value = false;
  }
}

watch(activeChip, async (id) => {
  if (id === 'all' || searching.value) return;
  if (!props.agencyId) return;
  loading.value = true;
  try {
    if (id === 'groups') {
      const { data } = await api.get('/messages/hub/start-directory', {
        params: { agencyId: props.agencyId, allAgencies: true, perSection: 40 },
        skipGlobalLoading: true
      });
      sections.value = { ...sections.value, groups: data?.sections?.groups || [] };
    } else if (id === 'recent') {
      const { data } = await api.get('/messages/hub/people', {
        params: { agencyId: props.agencyId, browse: 'recent', limit: 60, allAgencies: true },
        skipGlobalLoading: true
      });
      sections.value = { ...sections.value, recent: data?.results || [] };
    } else {
      const browse = id === 'clients' ? 'caseload' : id;
      const pred = kindPred(id);
      const [{ data: browseData }, { data: recentData }] = await Promise.all([
        api.get('/messages/hub/people', {
          params: { agencyId: props.agencyId, browse, limit: 60, allAgencies: true },
          skipGlobalLoading: true
        }),
        api.get('/messages/hub/people', {
          params: { agencyId: props.agencyId, browse: 'recent', limit: 60, allAgencies: true },
          skipGlobalLoading: true
        })
      ]);
      let fill = browseData?.results || [];
      if (id === 'clients') fill = fill.filter(isClient);
      const recentPool = recentData?.results || sections.value.recent || [];
      sections.value = {
        ...sections.value,
        [id]: mergeRecentFirst(recentPool, fill, pred)
      };
    }
  } catch {
    /* keep existing preview */
  } finally {
    loading.value = false;
  }
});

onMounted(async () => {
  await Promise.all([loadDirectory(), loadClientOptions()]);
  await nextTick();
  searchEl.value?.focus?.();
});

watch(
  () => props.agencyId,
  () => {
    loadDirectory();
    loadClientOptions();
  }
);
</script>

<style scoped>
.scm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2vh 16px 20px;
  overflow: auto;
}
.scm-card {
  width: min(820px, 100%);
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.22);
  display: flex;
  flex-direction: column;
  max-height: min(96vh, 980px);
  min-height: min(88vh, 720px);
}
.scm-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px 6px;
  flex-shrink: 0;
}
.scm-header h3 {
  margin: 0;
  font-size: 1.35rem;
  color: #0b1f3a;
}
.scm-sub {
  margin: 4px 0 0;
  color: #5b6b82;
  font-size: 0.92rem;
}
.scm-close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}
.scm-body {
  padding: 8px 22px 16px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.scm-search-wrap {
  position: relative;
}
.scm-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 1rem;
}
.scm-search {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d7dee8;
  border-radius: 10px;
  padding: 11px 12px 11px 34px;
  font-size: 0.95rem;
}
.scm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 8px;
}
.scm-chip {
  border: 1px solid #d7dee8;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;
  color: #334155;
}
.scm-chip.active {
  background: #e8f7ec;
  border-color: #2e9a43;
  color: #1e4d2b;
  font-weight: 600;
}
.scm-section {
  margin-top: 14px;
}
.scm-section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.scm-section-head h4,
.scm-external h4,
.scm-ext-title,
.scm-lookup h5,
.scm-create-block h5 {
  margin: 0;
  color: #0b1f3a;
  font-size: 0.98rem;
}
.scm-see-all {
  border: none;
  background: none;
  color: #2e9a43;
  font-size: 0.85rem;
  cursor: pointer;
  font-weight: 600;
}
.scm-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.scm-grid-full {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
@media (max-width: 720px) {
  .scm-grid,
  .scm-grid-full {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 520px) {
  .scm-grid,
  .scm-grid-full {
    grid-template-columns: 1fr;
  }
}
.scm-person {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 8px;
  background: #fff;
  cursor: pointer;
  min-width: 0;
}
.scm-person:hover {
  border-color: #9fd0a8;
  background: #f7fbf8;
}
.scm-person.selected {
  border-color: #2e9a43;
  background: #f0faf3;
  box-shadow: 0 0 0 1px #2e9a43;
}
.scm-new-group {
  border-style: dashed;
  border-color: #9fd0a8;
  background: #f7fbf8;
}
.scm-new-group-wide {
  width: 100%;
  margin-bottom: 10px;
}
.scm-groups-actions {
  margin-bottom: 4px;
}
.scm-avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #e8f0f7;
  color: #0b1f3a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  font-weight: 700;
  flex-shrink: 0;
}
.scm-avatar-plus {
  background: #e8f7ec;
  color: #1e7a32;
  font-size: 1rem;
  font-weight: 600;
}
.scm-person-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.scm-person-text strong {
  color: #0b1f3a;
  font-size: 0.8rem;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.scm-person-text small,
.scm-muted {
  color: #64748b;
  font-size: 0.7rem;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.scm-muted {
  display: block;
  -webkit-line-clamp: unset;
}
.scm-chev {
  color: #94a3b8;
  font-size: 1rem;
  flex-shrink: 0;
}
.scm-empty-sec {
  margin: 0;
}
.scm-external {
  margin-top: 22px;
  padding-top: 16px;
  padding-bottom: 8px;
  border-top: 1px solid #e8eef5;
}
.scm-external-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}
@media (max-width: 640px) {
  .scm-external-grid {
    grid-template-columns: 1fr;
  }
}
.scm-external-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  background: #fafbfc;
  cursor: pointer;
}
.scm-external-card:hover {
  border-color: #2e9a43;
}
.scm-ext-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #e8f7ec;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.scm-external-card strong {
  display: block;
  color: #0b1f3a;
  font-size: 0.88rem;
}
.scm-external-card em {
  display: block;
  font-style: normal;
  color: #475569;
  font-size: 0.84rem;
}
.scm-external-card small {
  display: block;
  color: #94a3b8;
  margin-top: 2px;
}
.scm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 22px 18px;
  border-top: 1px solid #eef2f7;
  flex-shrink: 0;
  background: #fff;
}
.scm-back {
  border: none;
  background: none;
  color: #2e9a43;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 8px;
  padding: 0;
}
.scm-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 10px 0;
  font-size: 0.85rem;
  color: #334155;
}
.scm-field input,
.scm-field select {
  border: 1px solid #d7dee8;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 0.92rem;
}
.scm-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: #334155;
  margin: 8px 0 12px;
  cursor: pointer;
}
.scm-lookup,
.scm-create-block {
  margin-top: 14px;
}
.scm-lookup .scm-person {
  margin-top: 8px;
  width: 100%;
}
.scm-error {
  color: #b91c1c;
  font-size: 0.88rem;
  margin-top: 10px;
}
</style>
