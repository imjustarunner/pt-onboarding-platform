<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  conversationId: { type: [Number, String], required: true },
  senderEmail: { type: String, default: '' },
  senderName: { type: String, default: '' }
});

const emit = defineEmits(['close', 'resolved']);

const mode = ref('existing'); // existing | new
const busy = ref(false);
const error = ref('');

const contactQuery = ref('');
const contactResults = ref([]);
const contactLoading = ref(false);
const selectedContact = ref(null);
let contactTimer = null;

const attachEmail = ref(true);
const attachClient = ref(false);
const clientQuery = ref('');
const clientResults = ref([]);
const clientLoading = ref(false);
const selectedClient = ref(null);
let clientTimer = null;

const form = ref({
  fullName: props.senderName || '',
  email: props.senderEmail || '',
  phone: '',
  relationshipType: 'other'
});

const canSubmit = computed(() => {
  if (mode.value === 'existing') return !!selectedContact.value?.contactId;
  return !!(form.value.fullName?.trim() || form.value.email?.trim());
});

watch(
  () => props.senderName,
  (v) => {
    if (v && !form.value.fullName) form.value.fullName = v;
  }
);
watch(
  () => props.senderEmail,
  (v) => {
    if (v && !form.value.email) form.value.email = v;
  }
);

onMounted(() => {
  form.value.fullName = props.senderName || form.value.fullName;
  form.value.email = props.senderEmail || form.value.email;
});

function initials(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function onContactSearch() {
  clearTimeout(contactTimer);
  selectedContact.value = null;
  const q = contactQuery.value.trim();
  if (q.length < 2) {
    contactResults.value = [];
    return;
  }
  contactTimer = setTimeout(() => searchContacts(q), 280);
}

async function searchContacts(q) {
  if (!props.agencyId) return;
  contactLoading.value = true;
  try {
    const { data } = await api.get('/messages/hub/people', {
      params: { agencyId: props.agencyId, q, limit: 20 },
      skipGlobalLoading: true
    });
    const rows = Array.isArray(data?.results) ? data.results : [];
    contactResults.value = rows.filter((p) => p.contactId || (p.kinds || []).includes('contact'));
  } catch {
    contactResults.value = [];
  } finally {
    contactLoading.value = false;
  }
}

function pickContact(c) {
  selectedContact.value = c;
  contactQuery.value = c.displayName || c.email || '';
  if (c.clientId) {
    attachClient.value = true;
    selectedClient.value = {
      clientId: c.clientId,
      displayName: c.relationshipMeta || `Client #${c.clientId}`
    };
  }
}

function onClientSearch() {
  clearTimeout(clientTimer);
  selectedClient.value = null;
  const q = clientQuery.value.trim();
  if (q.length < 2) {
    clientResults.value = [];
    return;
  }
  clientTimer = setTimeout(() => searchClients(q), 280);
}

async function searchClients(q) {
  if (!props.agencyId) return;
  clientLoading.value = true;
  try {
    const { data } = await api.get('/messages/hub/people', {
      params: { agencyId: props.agencyId, browse: 'caseload', q, limit: 20 },
      skipGlobalLoading: true
    });
    const rows = Array.isArray(data?.results) ? data.results : [];
    clientResults.value = rows.filter((p) => p.clientId);
  } catch {
    clientResults.value = [];
  } finally {
    clientLoading.value = false;
  }
}

function pickClient(c) {
  selectedClient.value = c;
  clientQuery.value = c.displayName || '';
}

async function submit() {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const clientId =
      attachClient.value && selectedClient.value?.clientId
        ? Number(selectedClient.value.clientId)
        : null;
    const body =
      mode.value === 'existing'
        ? {
            mode: 'existing_contact',
            existingContactId: selectedContact.value.contactId,
            attachEmailToContact: attachEmail.value,
            clientId,
            relationshipType: clientId ? form.value.relationshipType : null,
            fullName: form.value.fullName || props.senderName || null,
            email: props.senderEmail || form.value.email || null,
            phone: form.value.phone || null
          }
        : {
            mode: 'new_contact',
            fullName: form.value.fullName || props.senderName || null,
            email: form.value.email || props.senderEmail || null,
            phone: form.value.phone || null,
            clientId,
            relationshipType: clientId ? form.value.relationshipType : null
          };
    const { data } = await api.post(
      `/communications/conversations/${props.conversationId}/resolve-unknown`,
      body,
      {
        params: { agencyId: props.agencyId },
        skipGlobalLoading: true
      }
    );
    emit('resolved', data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not resolve sender';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="rus-modal" @click.self="emit('close')">
    <div class="rus-card" role="dialog" aria-labelledby="rus-title">
      <header class="rus-head">
        <div>
          <h3 id="rus-title">Mark known &amp; add to contacts</h3>
          <p class="rus-sub">
            {{ senderEmail || 'Unknown email' }}
            <template v-if="senderName"> · {{ senderName }}</template>
          </p>
          <p class="rus-hint">
            Saves as your personal contact unless shared agency-wide. You can only attach to clients you can access.
            Admins can link duplicate personal copies later without changing access.
          </p>
        </div>
        <button type="button" class="rus-close" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <div class="rus-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'existing'"
          :class="{ active: mode === 'existing' }"
          @click="mode = 'existing'"
        >
          Add to existing contact
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'new'"
          :class="{ active: mode === 'new' }"
          @click="mode = 'new'"
        >
          Create new contact
        </button>
      </div>

      <div class="rus-body">
        <template v-if="mode === 'existing'">
          <label class="rus-field">
            <span>Search contacts</span>
            <input
              v-model="contactQuery"
              type="search"
              placeholder="Name or email…"
              @input="onContactSearch"
            />
          </label>
          <div v-if="contactLoading" class="rus-muted">Searching…</div>
          <ul v-else-if="contactResults.length" class="rus-list">
            <li v-for="c in contactResults" :key="c.personKey || c.contactId">
              <button
                type="button"
                class="rus-person"
                :class="{ selected: selectedContact?.contactId === c.contactId }"
                @click="pickContact(c)"
              >
                <span class="rus-avatar">{{ initials(c.displayName) }}</span>
                <span class="rus-person-text">
                  <strong>{{ c.displayName }}</strong>
                  <small>{{ c.email || 'No email' }}</small>
                </span>
              </button>
            </li>
          </ul>
          <p v-else-if="contactQuery.trim().length >= 2" class="rus-muted">No contacts matched.</p>

          <label class="rus-check">
            <input v-model="attachEmail" type="checkbox" />
            Add this email address to the selected contact
          </label>
        </template>

        <template v-else>
          <label class="rus-field">
            <span>Full name</span>
            <input v-model="form.fullName" type="text" autocomplete="name" />
          </label>
          <label class="rus-field">
            <span>Email</span>
            <input v-model="form.email" type="email" autocomplete="email" />
          </label>
          <label class="rus-field">
            <span>Phone (optional)</span>
            <input v-model="form.phone" type="tel" autocomplete="tel" />
          </label>
        </template>

        <label class="rus-check">
          <input v-model="attachClient" type="checkbox" />
          Attach to a client
        </label>

        <template v-if="attachClient">
          <label class="rus-field">
            <span>Search clients</span>
            <input
              v-model="clientQuery"
              type="search"
              placeholder="Client name…"
              @input="onClientSearch"
            />
          </label>
          <div v-if="clientLoading" class="rus-muted">Searching…</div>
          <ul v-else-if="clientResults.length" class="rus-list">
            <li v-for="c in clientResults" :key="c.personKey || c.clientId">
              <button
                type="button"
                class="rus-person"
                :class="{ selected: selectedClient?.clientId === c.clientId }"
                @click="pickClient(c)"
              >
                <span class="rus-avatar">{{ initials(c.displayName) }}</span>
                <span class="rus-person-text">
                  <strong>{{ c.displayName }}</strong>
                  <small>{{ c.agencyName || 'Client' }}</small>
                </span>
              </button>
            </li>
          </ul>
          <label v-if="selectedClient" class="rus-field">
            <span>Relationship</span>
            <select v-model="form.relationshipType">
              <option value="parent">Parent / guardian</option>
              <option value="school_staff">School staff</option>
              <option value="case_manager">Case manager</option>
              <option value="referral_source">Referral source</option>
              <option value="other">Other contact</option>
            </select>
          </label>
        </template>

        <p v-if="error" class="rus-error">{{ error }}</p>
      </div>

      <footer class="rus-foot">
        <button type="button" class="btn btn-secondary" @click="emit('close')">Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!canSubmit || busy"
          @click="submit"
        >
          {{ busy ? 'Saving…' : 'Mark known &amp; save' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.rus-modal {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.45);
}
.rus-card {
  width: min(480px, 100%);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}
.rus-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.1rem 0.75rem;
  border-bottom: 1px solid #e8edf3;
}
.rus-head h3 {
  margin: 0;
  font-size: 1.05rem;
}
.rus-sub {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: #64748b;
}
.rus-hint {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.35;
}
.rus-close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}
.rus-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.65rem 1rem 0;
}
.rus-tabs button {
  flex: 1;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 8px;
  padding: 0.45rem 0.5rem;
  font-size: 0.82rem;
  cursor: pointer;
  color: #475569;
}
.rus-tabs button.active {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.rus-body {
  padding: 0.85rem 1.1rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.rus-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: #475569;
}
.rus-field input,
.rus-field select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  font-size: 0.92rem;
}
.rus-check {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  font-size: 0.88rem;
  color: #334155;
}
.rus-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 160px;
  overflow: auto;
}
.rus-person {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  padding: 0.4rem 0.5rem;
  text-align: left;
  cursor: pointer;
}
.rus-person.selected {
  border-color: #0f766e;
  background: #f0fdfa;
}
.rus-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #e2e8f0;
  display: grid;
  place-items: center;
  font-size: 0.72rem;
  font-weight: 600;
  flex-shrink: 0;
}
.rus-person-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.rus-person-text strong {
  font-size: 0.9rem;
  color: #0f172a;
}
.rus-person-text small {
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rus-muted {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}
.rus-error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.88rem;
}
.rus-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.1rem 1rem;
  border-top: 1px solid #e8edf3;
}
</style>
