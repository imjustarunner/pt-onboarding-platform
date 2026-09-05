<template>
  <div class="cca-panel">
    <header class="cca-head">
      <div>
        <h3 class="cca-title">{{ title }}</h3>
        <p class="cca-sub">
          Add people who can receive appointment reminders for this client without portal access.
          They can later be converted to a guardian account if needed.
        </p>
      </div>
      <button type="button" class="btn btn-primary btn-sm" @click="showForm = !showForm">
        {{ showForm ? 'Cancel' : 'Add contact' }}
      </button>
    </header>

    <p v-if="error" class="cca-error">{{ error }}</p>
    <p v-if="success" class="cca-success">{{ success }}</p>

    <form v-if="showForm" class="cca-form" @submit.prevent="submit">
      <div class="cca-grid">
        <label>
          Full name
          <input v-model="form.fullName" type="text" required placeholder="Alex Johnson" />
        </label>
        <label>
          Relationship
          <select v-model="form.relationshipType">
            <option value="parent">Parent / guardian</option>
            <option value="school_staff">School staff</option>
            <option value="case_manager">Case manager</option>
            <option value="referral_source">Referral source</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Email
          <input v-model="form.email" type="email" placeholder="name@example.com" />
        </label>
        <label>
          Phone
          <input v-model="form.phone" type="tel" placeholder="+1…" />
        </label>
      </div>
      <div class="cca-toggles">
        <label class="cca-check">
          <input v-model="form.emailRemindersEnabled" type="checkbox" />
          Email appointment reminders
        </label>
        <label class="cca-check">
          <input v-model="form.smsRemindersEnabled" type="checkbox" />
          Text appointment reminders
        </label>
      </div>
      <label v-if="needsAck" class="cca-ack">
        <input v-model="form.acknowledgeNotify" type="checkbox" />
        <span>
          I approve an email sent on my behalf notifying this person they were added as a contact for
          <strong>{{ clientInitialsLabel }}</strong>
          and subscribed to the selected appointment reminders.
        </span>
      </label>
      <div class="cca-actions">
        <button type="submit" class="btn btn-primary" :disabled="saving || (needsAck && !form.acknowledgeNotify)">
          {{ saving ? 'Saving…' : 'Save contact' }}
        </button>
      </div>
    </form>

    <div v-if="loading" class="cca-muted">Loading contacts…</div>
    <ul v-else-if="items.length" class="cca-list">
      <li v-for="item in items" :key="item.id" class="cca-item">
        <div class="cca-item-main">
          <strong>{{ item.contact?.fullName || 'Contact' }}</strong>
          <span class="cca-meta">{{ item.relationshipType || 'contact' }}</span>
          <p class="cca-lines">
            <span v-if="item.contact?.email">{{ item.contact.email }}</span>
            <span v-if="item.contact?.phone">{{ item.contact.phone }}</span>
          </p>
          <p class="cca-prefs">
            Email reminders:
            <strong :class="item.emailRemindersEnabled ? 'on' : 'off'">
              {{ item.emailRemindersEnabled ? 'ON' : 'OFF' }}
            </strong>
            · Text reminders:
            <strong :class="item.smsRemindersEnabled ? 'on' : 'off'">
              {{ item.smsRemindersEnabled ? 'ON' : 'OFF' }}
            </strong>
          </p>
          <p v-if="item.contactLastChoice" class="cca-choice">
            Contact chose:
            <strong>{{ choiceLabel(item.contactLastChoice) }}</strong>
            <span v-if="item.contactChoiceAt"> · {{ formatWhen(item.contactChoiceAt) }}</span>
          </p>
        </div>
        <div class="cca-item-actions">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            :disabled="saving"
            @click="togglePrefs(item)"
          >
            Edit reminders
          </button>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="remove(item)">
            Remove
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="cca-muted">No affiliated contacts yet.</p>

    <div v-if="editing" class="cca-modal" @click.self="editing = null">
      <div class="cca-modal-card" role="dialog">
        <header>
          <h4>Reminder settings — {{ editing.contact?.fullName }}</h4>
          <button type="button" class="cca-close" @click="editing = null">×</button>
        </header>
        <label class="cca-check">
          <input v-model="editForm.emailRemindersEnabled" type="checkbox" />
          Email appointment reminders
        </label>
        <label class="cca-check">
          <input v-model="editForm.smsRemindersEnabled" type="checkbox" />
          Text appointment reminders
        </label>
        <label v-if="editNeedsAck" class="cca-ack">
          <input v-model="editForm.acknowledgeNotify" type="checkbox" />
          <span>
            I approve an email sent on my behalf notifying this person of their reminder subscription for
            <strong>{{ clientInitialsLabel }}</strong>.
          </span>
        </label>
        <div class="cca-actions">
          <button type="button" class="btn btn-secondary" @click="editing = null">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="saving || (editNeedsAck && !editForm.acknowledgeNotify)"
            @click="saveEdit"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  /** 'staff' uses /api/clients/:id/contacts; 'guardian' uses guardian-portal path */
  mode: { type: String, default: 'staff' },
  title: { type: String, default: 'Appointment reminder contacts' },
  clientInitials: { type: String, default: '' }
});

const items = ref([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const success = ref('');
const showForm = ref(false);
const editing = ref(null);

const form = reactive({
  fullName: '',
  email: '',
  phone: '',
  relationshipType: 'parent',
  emailRemindersEnabled: true,
  smsRemindersEnabled: false,
  acknowledgeNotify: false
});

const editForm = reactive({
  emailRemindersEnabled: false,
  smsRemindersEnabled: false,
  acknowledgeNotify: false
});

const basePath = computed(() => {
  const id = props.clientId;
  return props.mode === 'guardian'
    ? `/guardian-portal/clients/${id}/contacts`
    : `/clients/${id}/contacts`;
});

const needsAck = computed(
  () => !!(form.emailRemindersEnabled || form.smsRemindersEnabled)
);

const editNeedsAck = computed(() => {
  if (!editing.value) return false;
  const enablingEmail =
    editForm.emailRemindersEnabled && !editing.value.emailRemindersEnabled;
  const enablingSms = editForm.smsRemindersEnabled && !editing.value.smsRemindersEnabled;
  return enablingEmail || enablingSms;
});

const clientInitialsLabel = computed(() => props.clientInitials || 'this client');

function choiceLabel(c) {
  const map = {
    email_only: 'Email only',
    sms_only: 'Text only',
    both: 'Email & text',
    off: 'Turned off reminders',
    unchanged: 'No change'
  };
  return map[c] || c;
}

function formatWhen(v) {
  try {
    return new Date(v).toLocaleString();
  } catch {
    return '';
  }
}

async function load() {
  if (!props.clientId) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(basePath.value, { skipGlobalLoading: true });
    items.value = Array.isArray(data?.items) ? data.items : [];
  } catch (e) {
    items.value = [];
    error.value = e?.response?.data?.error?.message || 'Could not load contacts';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  saving.value = true;
  error.value = '';
  success.value = '';
  try {
    await api.post(basePath.value, {
      fullName: form.fullName,
      email: form.email || undefined,
      phone: form.phone || undefined,
      relationshipType: form.relationshipType,
      emailRemindersEnabled: form.emailRemindersEnabled,
      smsRemindersEnabled: form.smsRemindersEnabled,
      acknowledgeNotify: form.acknowledgeNotify
    });
    success.value = 'Contact saved. If reminders were enabled, a notification email was sent.';
    showForm.value = false;
    form.fullName = '';
    form.email = '';
    form.phone = '';
    form.acknowledgeNotify = false;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not save contact';
  } finally {
    saving.value = false;
  }
}

function togglePrefs(item) {
  editing.value = item;
  editForm.emailRemindersEnabled = !!item.emailRemindersEnabled;
  editForm.smsRemindersEnabled = !!item.smsRemindersEnabled;
  editForm.acknowledgeNotify = false;
}

async function saveEdit() {
  if (!editing.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.patch(`${basePath.value}/${editing.value.id}`, {
      emailRemindersEnabled: editForm.emailRemindersEnabled,
      smsRemindersEnabled: editForm.smsRemindersEnabled,
      acknowledgeNotify: editForm.acknowledgeNotify
    });
    success.value = 'Reminder settings updated.';
    editing.value = null;
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not update';
  } finally {
    saving.value = false;
  }
}

async function remove(item) {
  if (!confirm(`Remove ${item.contact?.fullName || 'this contact'} from reminder contacts?`)) return;
  saving.value = true;
  try {
    await api.delete(`${basePath.value}/${item.id}`);
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not remove';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.clientId,
  () => load()
);

onMounted(load);
</script>

<style scoped>
.cca-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cca-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.cca-title {
  margin: 0 0 4px;
  font-size: 1.05rem;
  font-weight: 750;
}
.cca-sub {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  max-width: 52ch;
  line-height: 1.45;
}
.cca-form,
.cca-item,
.cca-modal-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 14px;
}
.cca-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.cca-grid label,
.cca-form > label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  font-weight: 650;
  color: #334155;
}
.cca-grid input,
.cca-grid select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  font-weight: 500;
}
.cca-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0;
}
.cca-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  font-weight: 550;
  color: #0f172a;
}
.cca-ack {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 10px 0;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.45;
  color: #334155;
}
.cca-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
}
.cca-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.cca-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.cca-meta {
  margin-left: 8px;
  font-size: 12px;
  color: #64748b;
  text-transform: capitalize;
}
.cca-lines {
  margin: 4px 0;
  font-size: 13px;
  color: #475569;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.cca-prefs {
  margin: 0;
  font-size: 13px;
  color: #334155;
}
.cca-prefs .on {
  color: #15803d;
}
.cca-prefs .off {
  color: #94a3b8;
}
.cca-choice {
  margin: 6px 0 0;
  font-size: 12px;
  color: #0369a1;
}
.cca-item-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cca-muted {
  color: #64748b;
  font-size: 13px;
}
.cca-error {
  color: #b91c1c;
  font-size: 13px;
  margin: 0;
}
.cca-success {
  color: #15803d;
  font-size: 13px;
  margin: 0;
}
.cca-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 16px;
}
.cca-modal-card {
  width: min(420px, 100%);
  display: grid;
  gap: 10px;
}
.cca-modal-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cca-modal-card h4 {
  margin: 0;
  font-size: 15px;
}
.cca-close {
  border: 0;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  color: #64748b;
}
@media (max-width: 640px) {
  .cca-grid {
    grid-template-columns: 1fr;
  }
  .cca-item {
    flex-direction: column;
  }
}
</style>
