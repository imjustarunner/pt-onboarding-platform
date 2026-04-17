<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="close">
    <div class="modal add-school-modal" role="dialog" aria-modal="true" aria-labelledby="add-school-title" @click.stop>
      <div class="modal-header">
        <h2 id="add-school-title">Add school</h2>
        <button type="button" class="close" aria-label="Close" @click="close">×</button>
      </div>
      <div class="modal-body">
        <p class="hint">
          Creates a new school organization under the selected agency, using the parent’s branding by default.
        </p>
        <div class="form-group">
          <label for="add-school-name">Name</label>
          <input
            id="add-school-name"
            v-model="name"
            type="text"
            class="control-input"
            autocomplete="organization"
            maxlength="255"
            placeholder="School display name"
          />
        </div>
        <div class="form-group">
          <label for="add-school-slug">URL slug</label>
          <input
            id="add-school-slug"
            v-model="slug"
            type="text"
            class="control-input"
            autocomplete="off"
            maxlength="120"
            placeholder="lowercase-with-hyphens"
            @input="slugTouched = true"
          />
          <div class="field-hint">Lowercase letters, numbers, and hyphens only.</div>
        </div>
        <div v-if="error" class="error">{{ error }}</div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" :disabled="saving" @click="close">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="saving || !canSubmit" @click="submit">
          {{ saving ? 'Creating…' : 'Create school' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  affiliatedAgencyId: { type: Number, default: null }
});

const emit = defineEmits(['update:modelValue', 'created']);

const name = ref('');
const slug = ref('');
const slugTouched = ref(false);
const saving = ref(false);
const error = ref('');

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const canSubmit = computed(() => {
  const n = String(name.value || '').trim();
  const s = String(slug.value || '').trim();
  const aid = Number(props.affiliatedAgencyId || 0);
  return n.length > 0 && s.length > 0 && slugPattern.test(s) && Number.isFinite(aid) && aid > 0;
});

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      name.value = '';
      slug.value = '';
      slugTouched.value = false;
      error.value = '';
      saving.value = false;
    }
  }
);

watch(name, (v) => {
  if (!props.modelValue || slugTouched.value) return;
  const raw = String(v || '').trim();
  if (!raw) {
    slug.value = '';
    return;
  }
  slug.value = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
});

const close = () => {
  if (saving.value) return;
  emit('update:modelValue', false);
};

const submit = async () => {
  error.value = '';
  const aid = Number(props.affiliatedAgencyId || 0);
  if (!Number.isFinite(aid) || aid <= 0) {
    error.value = 'No parent agency is selected.';
    return;
  }
  const n = String(name.value || '').trim();
  const s = String(slug.value || '').trim().toLowerCase();
  if (!n || !s || !slugPattern.test(s)) {
    error.value = 'Enter a valid name and slug.';
    return;
  }
  saving.value = true;
  try {
    const res = await api.post('/agencies', {
      organizationType: 'school',
      name: n,
      officialName: n,
      slug: s,
      affiliatedAgencyId: aid,
      isActive: true,
      themeSettings: { useAffiliatedAgencyBranding: true }
    });
    emit('created', res.data);
    emit('update:modelValue', false);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to create school';
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 28, 36, 0.45);
  padding: 1rem;
}

.add-school-modal {
  width: 100%;
  max-width: 440px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e6e9ef;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #5f6b7a;
}

.modal-body {
  padding: 1rem 1.25rem 0.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.25rem 1.25rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.35rem;
  font-size: 0.9rem;
}

.control-input {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid #cfd6e4;
  border-radius: 6px;
  font-size: 0.95rem;
}

.field-hint,
.hint {
  font-size: 0.8rem;
  color: #5f6b7a;
  margin-top: 0.35rem;
}

.hint {
  margin-bottom: 1rem;
}

.error {
  color: #b42318;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}
</style>
