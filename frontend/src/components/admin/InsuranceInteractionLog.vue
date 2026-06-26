<template>
  <div class="interaction-log">
    <div class="log-header">
      <h4>{{ title || 'Contact history' }}</h4>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="fetchInteractions">
        Refresh
      </button>
    </div>
    <p v-if="hint" class="hint log-hint">{{ hint }}</p>

    <form class="log-form" @submit.prevent="submitInteraction">
      <div class="form-grid">
        <div class="form-group">
          <label>Date &amp; time</label>
          <input v-model="form.interactionAt" type="datetime-local" :disabled="saving" required />
        </div>
        <div v-if="allowEmployeeScope" class="form-group">
          <label>About</label>
          <select v-model="form.scopeKind" :disabled="saving">
            <option value="employee">This provider</option>
            <option value="agency">Agency-wide (not tied to a provider)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Our caller</label>
          <input v-model.trim="form.callerName" type="text" :disabled="saving" placeholder="Who placed the call" />
        </div>
        <div class="form-group">
          <label>Number called</label>
          <input v-model.trim="form.phoneNumberCalled" type="text" :disabled="saving" />
        </div>
        <div class="form-group">
          <label>Spoke with</label>
          <input v-model.trim="form.contactPersonName" type="text" :disabled="saving" placeholder="Contact at payer" />
        </div>
        <div v-if="effectiveContacts.length" class="form-group">
          <label>From contact list</label>
          <select v-model="form.contactId" :disabled="saving" @change="applySelectedContact">
            <option value="">— Optional —</option>
            <option v-for="c in effectiveContacts" :key="c.id" :value="String(c.id)">
              {{ contactOptionLabel(c) }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>Outcome</label>
          <input v-model.trim="form.outcome" type="text" :disabled="saving" placeholder="e.g. Approved, Pending docs" />
        </div>
        <div class="form-group">
          <label>Reference / call ID</label>
          <input v-model.trim="form.referenceId" type="text" :disabled="saving" placeholder="Ticket #, job ID, etc." />
        </div>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea v-model.trim="form.notes" rows="2" :disabled="saving"></textarea>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-sm" :disabled="saving">
          {{ saving ? 'Saving…' : 'Log contact' }}
        </button>
      </div>
      <div v-if="formError" class="error">{{ formError }}</div>
    </form>

    <div v-if="loading" class="loading" style="margin-top: 10px;">Loading history…</div>
    <div v-else-if="loadError" class="error">{{ loadError }}</div>
    <div v-else-if="interactions.length === 0" class="muted empty-history">No contacts logged yet.</div>
    <ul v-else class="history-list">
      <li v-for="item in interactions" :key="item.id" class="history-item">
        <div class="history-top">
          <strong>{{ formatWhen(item.interaction_at) }}</strong>
          <span v-if="item.user_id" class="scope-tag">Provider</span>
          <span v-else class="scope-tag scope-tag--agency">Agency</span>
        </div>
        <div class="history-meta">
          <span v-if="callerLabel(item)">Caller: {{ callerLabel(item) }}</span>
          <span v-if="item.phone_number_called"> · Called {{ item.phone_number_called }}</span>
          <span v-if="item.contact_person_name"> · Spoke with {{ item.contact_person_name }}</span>
        </div>
        <div v-if="item.outcome" class="history-outcome"><strong>Outcome:</strong> {{ item.outcome }}</div>
        <div v-if="item.reference_id" class="history-ref"><strong>Ref:</strong> {{ item.reference_id }}</div>
        <div v-if="item.notes" class="history-notes">{{ item.notes }}</div>
        <div v-if="providerLabel(item)" class="history-provider muted">Re: {{ providerLabel(item) }}</div>
        <button type="button" class="btn btn-danger btn-sm history-delete" :disabled="deletingId === item.id" @click="removeInteraction(item)">
          {{ deletingId === item.id ? 'Removing…' : 'Remove' }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  agencyId: { type: Number, required: true },
  insuranceDefinitionId: { type: Number, required: true },
  userId: { type: Number, default: null },
  contacts: { type: Array, default: () => [] },
  scope: { type: String, default: 'all' },
  title: { type: String, default: '' },
  hint: { type: String, default: '' },
  allowEmployeeScope: { type: Boolean, default: false }
});

const authStore = useAuthStore();
const interactions = ref([]);
const localContacts = ref([]);
const loading = ref(false);
const loadError = ref('');
const saving = ref(false);
const formError = ref('');
const deletingId = ref(null);

const defaultCallerName = computed(() => {
  const u = authStore.user;
  if (!u) return '';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim();
});

const newForm = () => ({
  interactionAt: new Date().toISOString().slice(0, 16),
  scopeKind: props.userId ? 'employee' : 'agency',
  callerName: defaultCallerName.value,
  phoneNumberCalled: '',
  contactPersonName: '',
  contactId: '',
  outcome: '',
  referenceId: '',
  notes: ''
});
const form = ref(newForm());

const effectiveContacts = computed(() =>
  (props.contacts && props.contacts.length) ? props.contacts : localContacts.value
);

const contactOptionLabel = (c) => {
  const parts = [c.label, c.contact_name, c.phone].filter(Boolean);
  return parts.join(' · ') || `Contact #${c.id}`;
};

const applySelectedContact = () => {
  const id = parseInt(form.value.contactId, 10);
  const c = (effectiveContacts.value || []).find((x) => Number(x.id) === id);
  if (!c) return;
  if (c.phone && !form.value.phoneNumberCalled) form.value.phoneNumberCalled = c.phone;
  if (c.contact_name && !form.value.contactPersonName) form.value.contactPersonName = c.contact_name;
};

const formatWhen = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
};

const callerLabel = (item) => {
  const n = `${item.caller_first_name || ''} ${item.caller_last_name || ''}`.trim();
  return n || form.value.callerName || '';
};

const providerLabel = (item) => {
  if (!item.user_id) return '';
  return `${item.provider_first_name || ''} ${item.provider_last_name || ''}`.trim();
};

const fetchContacts = async () => {
  if ((props.contacts || []).length || !props.agencyId || !props.insuranceDefinitionId) return;
  try {
    const res = await api.get(
      `/agencies/${props.agencyId}/credentialing/insurances/${props.insuranceDefinitionId}/contacts`
    );
    localContacts.value = res.data?.contacts || [];
  } catch {
    localContacts.value = [];
  }
};

const fetchInteractions = async () => {
  if (!props.agencyId || !props.insuranceDefinitionId) return;
  loading.value = true;
  loadError.value = '';
  try {
    const params = { scope: props.scope };
    if (props.userId) params.userId = props.userId;
    const res = await api.get(
      `/agencies/${props.agencyId}/credentialing/insurances/${props.insuranceDefinitionId}/interactions`,
      { params }
    );
    interactions.value = res.data?.interactions || [];
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Failed to load contact history';
    interactions.value = [];
  } finally {
    loading.value = false;
  }
};

const submitInteraction = async () => {
  if (!props.agencyId || !props.insuranceDefinitionId) return;
  saving.value = true;
  formError.value = '';
  try {
    const userIdForLog = props.allowEmployeeScope
      ? (form.value.scopeKind === 'employee' && props.userId ? props.userId : null)
      : (props.userId || null);
    await api.post(
      `/agencies/${props.agencyId}/credentialing/insurances/${props.insuranceDefinitionId}/interactions`,
      {
        interactionAt: form.value.interactionAt,
        callerUserId: authStore.user?.id,
        userId: userIdForLog,
        contactId: form.value.contactId ? parseInt(form.value.contactId, 10) : null,
        phoneNumberCalled: form.value.phoneNumberCalled || null,
        contactPersonName: form.value.contactPersonName || null,
        outcome: form.value.outcome || null,
        referenceId: form.value.referenceId || null,
        notes: [
          form.value.callerName && form.value.callerName !== defaultCallerName.value
            ? `Caller (entered): ${form.value.callerName}`
            : null,
          form.value.notes || null
        ].filter(Boolean).join('\n') || null
      }
    );
    form.value = { ...newForm(), scopeKind: form.value.scopeKind };
    await fetchInteractions();
  } catch (e) {
    formError.value = e.response?.data?.error?.message || 'Failed to log contact';
  } finally {
    saving.value = false;
  }
};

const removeInteraction = async (item) => {
  if (!item?.id || !confirm('Remove this contact log entry?')) return;
  deletingId.value = item.id;
  try {
    await api.delete(
      `/agencies/${props.agencyId}/credentialing/insurances/${props.insuranceDefinitionId}/interactions/${item.id}`
    );
    await fetchInteractions();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to remove entry');
  } finally {
    deletingId.value = null;
  }
};

watch(
  () => [props.agencyId, props.insuranceDefinitionId, props.userId, props.scope],
  () => {
    form.value = newForm();
    fetchContacts();
    fetchInteractions();
  },
  { immediate: true }
);
</script>

<style scoped>
.interaction-log {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.log-header h4 {
  margin: 0;
  font-size: 0.95rem;
}
.log-hint {
  margin: 6px 0 10px;
  font-size: 12px;
}
.log-form {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  margin-bottom: 12px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.form-actions {
  margin-top: 8px;
}
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.history-item {
  position: relative;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-alt, #fafafa);
}
.history-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.scope-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
}
.scope-tag--agency {
  background: #f3f4f6;
  color: #4b5563;
}
.history-meta, .history-outcome, .history-ref, .history-notes, .history-provider {
  font-size: 13px;
  margin-top: 4px;
}
.history-delete {
  margin-top: 8px;
}
.empty-history {
  font-size: 13px;
  margin-top: 8px;
}
</style>
