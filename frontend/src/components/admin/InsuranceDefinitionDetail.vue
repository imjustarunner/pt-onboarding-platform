<template>
  <div class="insurance-detail">
    <div class="detail-top">
      <div class="logo-block">
        <img v-if="logoUrl" :src="logoUrl" :alt="`${definition.name} logo`" class="insurance-logo" />
        <div v-else class="logo-placeholder">{{ initials }}</div>
        <label class="btn btn-secondary btn-sm logo-upload-btn">
          {{ uploadingLogo ? 'Uploading…' : (logoUrl ? 'Change logo' : 'Upload insurance logo') }}
          <input type="file" accept="image/*" hidden :disabled="uploadingLogo" @change="onLogoSelected" />
        </label>
        <div v-if="logoError" class="error">{{ logoError }}</div>
      </div>
      <div class="detail-title">
        <strong>{{ definition.name }}</strong>
        <p class="hint" style="margin: 4px 0 0; font-size: 12px;">Logo appears on provider profiles when they are credentialed with this payer.</p>
      </div>
    </div>

    <div class="contacts-section">
      <div class="section-head">
        <h4>Contacts</h4>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="contactsLoading" @click="fetchContacts">
          Refresh
        </button>
      </div>
      <p class="hint">Add phone numbers and people at this payer. Use them when logging calls.</p>

      <form class="contact-form" @submit.prevent="addContact">
        <div class="form-grid">
          <div class="form-group">
            <label>Label / department</label>
            <input v-model.trim="newContact.label" type="text" placeholder="Credentialing dept" :disabled="addingContact" />
          </div>
          <div class="form-group">
            <label>Contact name</label>
            <input v-model.trim="newContact.contactName" type="text" :disabled="addingContact" />
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input v-model.trim="newContact.phone" type="text" :disabled="addingContact" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input v-model.trim="newContact.email" type="email" :disabled="addingContact" />
          </div>
        </div>
        <div class="form-group">
          <label>Notes</label>
          <input v-model.trim="newContact.notes" type="text" :disabled="addingContact" />
        </div>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="addingContact || !hasNewContactInfo">
          {{ addingContact ? 'Adding…' : 'Add contact' }}
        </button>
        <div v-if="contactFormError" class="error">{{ contactFormError }}</div>
      </form>

      <div v-if="contactsLoading" class="loading">Loading contacts…</div>
      <ul v-else-if="contacts.length" class="contact-list">
        <li v-for="c in contacts" :key="c.id" class="contact-item">
          <div>
            <strong>{{ c.label || 'Contact' }}</strong>
            <span v-if="c.contact_name"> · {{ c.contact_name }}</span>
            <div class="muted contact-lines">
              <span v-if="c.phone">{{ c.phone }}</span>
              <span v-if="c.email">{{ c.phone ? ' · ' : '' }}{{ c.email }}</span>
            </div>
            <div v-if="c.notes" class="muted" style="font-size:12px;">{{ c.notes }}</div>
          </div>
          <button type="button" class="btn btn-danger btn-sm" :disabled="deletingContactId === c.id" @click="removeContact(c)">
            Remove
          </button>
        </li>
      </ul>
      <div v-else class="muted">No contacts yet.</div>
    </div>

    <InsuranceInteractionLog
      :agency-id="agencyId"
      :insurance-definition-id="definition.id"
      :contacts="contacts"
      scope="agency"
      title="Agency-wide contact history"
      hint="Calls about this payer that are not tied to a specific provider."
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import InsuranceInteractionLog from './InsuranceInteractionLog.vue';

const props = defineProps({
  agencyId: { type: Number, required: true },
  definition: { type: Object, required: true }
});

const emit = defineEmits(['updated']);

const contacts = ref([]);
const contactsLoading = ref(false);
const addingContact = ref(false);
const contactFormError = ref('');
const deletingContactId = ref(null);
const uploadingLogo = ref(false);
const logoError = ref('');
const localLogoPath = ref('');

const newContact = ref({
  label: '',
  contactName: '',
  phone: '',
  email: '',
  notes: ''
});

const logoUrl = computed(() => {
  const path = localLogoPath.value || props.definition.logo_path;
  return path ? toUploadsUrl(path) : '';
});

const initials = computed(() => String(props.definition.name || '?').slice(0, 2).toUpperCase());

const hasNewContactInfo = computed(() =>
  !!(newContact.value.label || newContact.value.contactName || newContact.value.phone || newContact.value.email)
);

const fetchContacts = async () => {
  if (!props.agencyId || !props.definition?.id) return;
  contactsLoading.value = true;
  try {
    const res = await api.get(
      `/agencies/${props.agencyId}/credentialing/insurances/${props.definition.id}/contacts`
    );
    contacts.value = res.data?.contacts || [];
  } catch {
    contacts.value = [];
  } finally {
    contactsLoading.value = false;
  }
};

const addContact = async () => {
  if (!hasNewContactInfo.value) return;
  addingContact.value = true;
  contactFormError.value = '';
  try {
    await api.post(
      `/agencies/${props.agencyId}/credentialing/insurances/${props.definition.id}/contacts`,
      { ...newContact.value }
    );
    newContact.value = { label: '', contactName: '', phone: '', email: '', notes: '' };
    await fetchContacts();
  } catch (e) {
    contactFormError.value = e.response?.data?.error?.message || 'Failed to add contact';
  } finally {
    addingContact.value = false;
  }
};

const removeContact = async (c) => {
  if (!c?.id || !confirm('Remove this contact?')) return;
  deletingContactId.value = c.id;
  try {
    await api.delete(
      `/agencies/${props.agencyId}/credentialing/insurances/${props.definition.id}/contacts/${c.id}`
    );
    await fetchContacts();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to remove contact');
  } finally {
    deletingContactId.value = null;
  }
};

const onLogoSelected = async (event) => {
  const file = event?.target?.files?.[0];
  if (!file || !props.agencyId || !props.definition?.id) return;
  logoError.value = '';
  uploadingLogo.value = true;
  try {
    const formData = new FormData();
    formData.append('logo', file);
    const res = await api.post(
      `/agencies/${props.agencyId}/credentialing/insurances/${props.definition.id}/logo`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    localLogoPath.value = res.data?.logo_path || '';
    emit('updated');
  } catch (e) {
    logoError.value = e.response?.data?.error?.message || 'Failed to upload logo';
  } finally {
    uploadingLogo.value = false;
    try { event.target.value = ''; } catch { /* ignore */ }
  }
};

watch(
  () => [props.agencyId, props.definition?.id],
  () => {
    localLogoPath.value = props.definition?.logo_path || '';
    fetchContacts();
  },
  { immediate: true }
);
</script>

<style scoped>
.insurance-detail {
  padding: 12px 0 0;
}
.detail-top {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}
.logo-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.insurance-logo, .logo-placeholder {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: contain;
  border: 1px solid var(--border);
  background: #fff;
}
.logo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: var(--text-secondary);
  background: var(--bg-alt);
}
.logo-upload-btn {
  cursor: pointer;
}
.contacts-section {
  margin-bottom: 8px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.section-head h4 {
  margin: 0;
  font-size: 0.95rem;
}
.contact-form {
  margin: 10px 0;
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 8px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.contact-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.contact-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
}
.contact-lines {
  font-size: 13px;
}
</style>
