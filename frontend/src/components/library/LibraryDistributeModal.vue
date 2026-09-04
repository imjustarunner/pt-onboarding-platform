<template>
  <div class="lib-modal-backdrop" @click.self="$emit('close')">
    <div class="lib-dist-modal" role="dialog" aria-modal="true" aria-labelledby="lib-dist-title">
      <header class="lib-dist-modal__head">
        <h2 id="lib-dist-title">Distribute “{{ resource?.name }}”</h2>
        <button type="button" class="lib-modal__x" aria-label="Close" @click="$emit('close')">×</button>
      </header>

      <p class="lib-dist-modal__lead">
        Choose how people receive this Library item. The master stays in the Library unless you give personal copies.
      </p>

      <div class="lib-dist-modes">
        <button
          type="button"
          class="lib-dist-mode"
          :class="{ 'is-active': mode === 'view_only' }"
          @click="mode = 'view_only'"
        >
          <strong>Share View-Only</strong>
          <small>Same document — they can see it, but cannot edit the master.</small>
        </button>
        <button
          type="button"
          class="lib-dist-mode"
          :class="{ 'is-active': mode === 'collaborate' }"
          @click="mode = 'collaborate'"
        >
          <strong>Collaborate</strong>
          <small>Same document — permitted users edit the shared master together.</small>
        </button>
        <button
          type="button"
          class="lib-dist-mode lib-dist-mode--personal"
          :class="{ 'is-active': mode === 'personal_copy' }"
          @click="mode = 'personal_copy'"
        >
          <strong>Give Personal Copy</strong>
          <small>
            Creates a private copy for each person. They can edit and save their copy without changing the
            original or anyone else’s copy.
          </small>
        </button>
      </div>

      <div class="lib-dist-audience">
        <span class="lib-dist-audience__label">Who should receive this?</span>
        <div class="lib-dist-audience__opts">
          <label class="lib-dist-aud" :class="{ 'is-active': audience === 'providers' }">
            <input v-model="audience" type="radio" value="providers" />
            <span>All Providers</span>
          </label>
          <label class="lib-dist-aud" :class="{ 'is-active': audience === 'staff' }">
            <input v-model="audience" type="radio" value="staff" />
            <span>All Staff</span>
          </label>
          <label class="lib-dist-aud" :class="{ 'is-active': audience === 'custom' }">
            <input v-model="audience" type="radio" value="custom" />
            <span>Custom emails</span>
          </label>
        </div>
      </div>

      <label v-if="audience === 'custom'" class="lib-field">
        <span>Emails (comma-separated)</span>
        <textarea v-model="emails" rows="3" placeholder="alex@agency.org, jordan@agency.org" />
      </label>

      <p v-if="error" class="lib-error">{{ error }}</p>
      <p v-if="success" class="lib-success">{{ success }}</p>

      <footer class="lib-dist-modal__foot">
        <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="submit">
          {{ saving ? 'Working…' : ctaLabel }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { distributeLibraryResource } from '../../services/library.js';

const props = defineProps({
  resource: { type: Object, required: true },
  agencyId: { type: [Number, String], default: null },
  initialMode: {
    type: String,
    default: 'personal_copy',
    validator: (v) => ['view_only', 'collaborate', 'personal_copy'].includes(String(v || ''))
  }
});

const emit = defineEmits(['close', 'done']);

const mode = ref(
  ['view_only', 'collaborate', 'personal_copy'].includes(props.initialMode)
    ? props.initialMode
    : 'personal_copy'
);
const audience = ref('providers');
const emails = ref('');
const saving = ref(false);
const error = ref('');
const success = ref('');

const ctaLabel = computed(() => {
  if (mode.value === 'view_only') return 'Share View-Only';
  if (mode.value === 'collaborate') return 'Allow Collaborate';
  return 'Give Personal Copy';
});

async function submit() {
  error.value = '';
  success.value = '';
  if (audience.value === 'custom' && !String(emails.value || '').trim()) {
    error.value = 'Enter at least one email, or choose All Providers / All Staff.';
    return;
  }
  saving.value = true;
  try {
    const payload = {
      mode: mode.value,
      agencyId: props.agencyId || undefined
    };
    if (audience.value === 'custom') {
      payload.emails = emails.value;
      payload.audience = 'custom';
    } else {
      payload.audience = audience.value;
    }
    const result = await distributeLibraryResource(props.resource.id, payload);
    const count = result.count ?? result.results?.length ?? 0;
    if (mode.value === 'personal_copy') {
      success.value = `Gave ${count} personal ${count === 1 ? 'copy' : 'copies'}${
        result.skipped ? ` (${result.skipped} already had a copy)` : ''
      }.`;
    } else if (mode.value === 'collaborate') {
      success.value = `Collaborate access granted for ${count} ${count === 1 ? 'person' : 'people'}.`;
    } else {
      success.value = `View-only access granted for ${count} ${count === 1 ? 'person' : 'people'}.`;
    }
    emit('done', result);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Distribute failed';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.lib-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 95;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.lib-dist-modal {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
  padding: 1.15rem 1.25rem 1.2rem;
}

.lib-dist-modal__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

.lib-dist-modal__head h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #0f172a;
}

.lib-modal__x {
  border: 0;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}

.lib-dist-modal__lead {
  margin: 0 0 0.9rem;
  font-size: 0.88rem;
  color: #64748b;
  line-height: 1.4;
}

.lib-dist-modes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.lib-dist-mode {
  text-align: left;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 10px;
  padding: 0.75rem 0.85rem;
  cursor: pointer;
  font: inherit;
}

.lib-dist-mode strong {
  display: block;
  color: #0f172a;
  font-size: 0.92rem;
  margin-bottom: 0.2rem;
}

.lib-dist-mode small {
  display: block;
  color: #64748b;
  font-size: 0.8rem;
  line-height: 1.35;
}

.lib-dist-mode.is-active {
  border-color: #166534;
  background: #f0fdf4;
  box-shadow: 0 0 0 1px #166534;
}

.lib-dist-mode--personal.is-active {
  border-color: #d97706;
  background: #fffbeb;
  box-shadow: 0 0 0 1px #d97706;
}

.lib-dist-audience {
  margin-bottom: 0.85rem;
}

.lib-dist-audience__label {
  display: block;
  font-size: 0.85rem;
  font-weight: 650;
  color: #334155;
  margin-bottom: 0.4rem;
}

.lib-dist-audience__opts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.lib-dist-aud {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.82rem;
  cursor: pointer;
  background: #fff;
}

.lib-dist-aud input {
  margin: 0;
}

.lib-dist-aud.is-active {
  border-color: #166534;
  background: #ecfdf5;
  color: #166534;
  font-weight: 650;
}

.lib-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}

.lib-field textarea {
  font: inherit;
  font-weight: 400;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  resize: vertical;
}

.lib-error {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0 0 0.5rem;
}

.lib-success {
  color: #166534;
  font-size: 0.85rem;
  margin: 0 0 0.5rem;
}

.lib-dist-modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
