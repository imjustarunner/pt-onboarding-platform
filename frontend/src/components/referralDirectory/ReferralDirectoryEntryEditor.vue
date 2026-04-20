<template>
  <div v-if="open" class="rdm-modal-overlay" @click.self="cancel">
    <div class="rdm-modal">
      <header class="rdm-modal-head">
        <h3>{{ mode === 'edit' ? 'Edit referral' : 'Add referral' }}</h3>
        <button type="button" class="rdm-icon-btn" @click="cancel" aria-label="Close">✕</button>
      </header>

      <div v-if="!isAdmin" class="rdm-banner">
        Edits submitted here require admin approval before they show up in the directory.
      </div>

      <form class="rdm-form" @submit.prevent="submit">
        <label class="rdm-field">
          <span class="rdm-label">Name<span class="req">*</span></span>
          <input v-model="form.name" type="text" required maxlength="200" placeholder="Dr. Jane Smith" />
        </label>

        <label class="rdm-field">
          <span class="rdm-label">Category</span>
          <div class="rdm-category-row">
            <select v-model="form.category_id">
              <option :value="null">— Uncategorized —</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <button
              v-if="isAdmin"
              type="button"
              class="rdm-link-btn"
              :disabled="categoryAddBusy"
              @click="promptAddCategory"
            >+ Add category</button>
          </div>
        </label>

        <label class="rdm-field">
          <span class="rdm-label">Organization</span>
          <input v-model="form.organization_name" type="text" maxlength="200" placeholder="Intermountain Primary Children's Hospital" />
        </label>

        <div class="rdm-row">
          <label class="rdm-field">
            <span class="rdm-label">Phone</span>
            <input v-model="form.phone" type="text" maxlength="40" placeholder="(555) 555-0100" />
          </label>
          <label class="rdm-field">
            <span class="rdm-label">Email</span>
            <input v-model="form.email" type="email" maxlength="200" placeholder="intake@example.com" />
          </label>
        </div>

        <label class="rdm-field">
          <span class="rdm-label">Website</span>
          <input v-model="form.website" type="url" maxlength="300" placeholder="https://…" />
        </label>

        <label class="rdm-field">
          <span class="rdm-label">Address</span>
          <input v-model="form.address" type="text" maxlength="400" placeholder="123 Main St, City, ST ZIP" />
        </label>

        <label class="rdm-field">
          <span class="rdm-label">Specialties</span>
          <textarea v-model="form.specialties" rows="2" placeholder="Pediatric psychiatry, ADHD, autism evaluation"></textarea>
        </label>

        <label class="rdm-field">
          <span class="rdm-label">Insurances accepted</span>
          <textarea v-model="form.insurances_accepted" rows="2" placeholder="Medicaid, BCBS, Aetna, SelectHealth"></textarea>
        </label>

        <label class="rdm-field">
          <span class="rdm-label">Internal notes</span>
          <textarea v-model="form.notes" rows="3" placeholder="Wait time ~2 weeks; prefers fax referrals."></textarea>
        </label>

        <div v-if="error" class="rdm-error">{{ error }}</div>

        <footer class="rdm-modal-foot">
          <button type="button" class="btn btn-secondary" @click="cancel" :disabled="saving">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="saving || !form.name?.trim()">
            {{ submitLabel }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, watch, computed } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  entry: { type: Object, default: null },
  categories: { type: Array, default: () => [] },
  agencyId: { type: [Number, String], default: null },
  isAdmin: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'saved', 'categoriesChanged']);

const makeEmpty = () => ({
  name: '',
  category_id: null,
  organization_name: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  specialties: '',
  insurances_accepted: '',
  notes: ''
});

const form = reactive(makeEmpty());
const saving = ref(false);
const error = ref('');
const categoryAddBusy = ref(false);

const submitLabel = computed(() => {
  if (saving.value) return props.isAdmin ? 'Saving…' : 'Submitting…';
  if (props.isAdmin) return props.mode === 'edit' ? 'Save changes' : 'Add to directory';
  return props.mode === 'edit' ? 'Submit for approval' : 'Submit proposal';
});

watch(() => [props.open, props.entry, props.mode], () => {
  if (!props.open) return;
  Object.assign(form, makeEmpty());
  if (props.entry && props.mode === 'edit') {
    Object.assign(form, {
      name: props.entry.name || '',
      category_id: props.entry.category_id || null,
      organization_name: props.entry.organization_name || '',
      phone: props.entry.phone || '',
      email: props.entry.email || '',
      website: props.entry.website || '',
      address: props.entry.address || '',
      specialties: props.entry.specialties || '',
      insurances_accepted: props.entry.insurances_accepted || '',
      notes: props.entry.notes || ''
    });
  }
  error.value = '';
}, { immediate: true });

function cancel() {
  if (saving.value) return;
  emit('close');
}

async function submit() {
  if (saving.value) return;
  error.value = '';
  saving.value = true;
  try {
    const payload = {
      name: form.name?.trim() || '',
      category_id: form.category_id || null,
      organization_name: form.organization_name?.trim() || null,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      website: form.website?.trim() || null,
      address: form.address?.trim() || null,
      specialties: form.specialties?.trim() || null,
      insurances_accepted: form.insurances_accepted?.trim() || null,
      notes: form.notes?.trim() || null
    };
    const params = props.agencyId ? { agencyId: props.agencyId } : {};
    let resp;
    if (props.mode === 'edit' && props.entry?.id) {
      resp = await api.put(`/referral-directory/entries/${props.entry.id}`, payload, { params });
    } else {
      resp = await api.post('/referral-directory/entries', payload, { params });
    }
    emit('saved', { result: resp.data, pendingReview: Boolean(resp.data?.pendingReview) });
    emit('close');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Unable to save';
  } finally {
    saving.value = false;
  }
}

async function promptAddCategory() {
  const name = (window.prompt('New category name') || '').trim();
  if (!name) return;
  categoryAddBusy.value = true;
  try {
    const params = props.agencyId ? { agencyId: props.agencyId } : {};
    const resp = await api.post('/referral-directory/categories', { name }, { params });
    const created = resp.data?.category;
    if (created?.id) {
      emit('categoriesChanged');
      form.category_id = created.id;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to add category';
  } finally {
    categoryAddBusy.value = false;
  }
}
</script>

<style scoped>
.rdm-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  padding: 16px;
}
.rdm-modal {
  background: var(--card-bg, #fff);
  color: var(--text, #111);
  max-width: 600px;
  width: 100%;
  max-height: 92vh;
  overflow: auto;
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border, #e5e7eb);
}
.rdm-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.rdm-modal-head h3 { margin: 0; font-size: 16px; }
.rdm-icon-btn {
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: var(--muted, #6b7280);
}
.rdm-banner {
  margin: 12px 18px 0;
  padding: 10px 12px;
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  font-size: 13px;
}
.rdm-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
}
.rdm-field { display: flex; flex-direction: column; gap: 4px; }
.rdm-label { font-size: 12px; font-weight: 600; color: var(--muted, #6b7280); }
.req { color: #dc2626; margin-left: 2px; }
.rdm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.rdm-category-row { display: flex; gap: 8px; align-items: center; }
.rdm-category-row select { flex: 1; }
.rdm-link-btn {
  background: transparent;
  border: none;
  color: var(--primary, #2563eb);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
}
.rdm-form input,
.rdm-form select,
.rdm-form textarea {
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
  background: var(--input-bg, #fff);
  color: inherit;
}
.rdm-form textarea { resize: vertical; }
.rdm-error { color: #dc2626; font-size: 13px; }
.rdm-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
  border-top: 1px solid var(--border, #e5e7eb);
  margin-top: 6px;
  padding: 12px 0 0;
}
@media (max-width: 520px) {
  .rdm-row { grid-template-columns: 1fr; }
}
</style>
