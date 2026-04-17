<template>
  <div v-if="modelValue" class="sbcp-overlay" role="dialog" aria-modal="true" :aria-labelledby="titleId" @click.self="requestClose">
    <div class="sbcp-card" @click.stop>
      <header class="sbcp-head">
        <div>
          <h2 :id="titleId" class="sbcp-title">Add a program</h2>
          <p class="sbcp-intro muted">
            Creates a <strong>program</strong> organization under <strong>{{ parentAgencyLabel }}</strong> so you can attach Skill Builders
            events and public <code>/programs/…</code> links. This is not a new top-level agency — only agency admins use this path.
            You can adjust full branding and advanced settings later in Organization management.
          </p>
        </div>
        <button type="button" class="sbcp-close" aria-label="Close" @click="requestClose">×</button>
      </header>

      <form class="sbcp-form" @submit.prevent="submit">
        <label class="sbcp-field">
          <span class="sbcp-label">Program name <span class="sbcp-req">*</span></span>
          <input
            v-model.trim="name"
            class="input"
            type="text"
            maxlength="180"
            autocomplete="organization"
            placeholder="e.g. D11 Summer ITSCO"
            required
            @input="onNameInput"
          />
        </label>

        <label class="sbcp-field">
          <span class="sbcp-label">Portal slug <span class="sbcp-req">*</span></span>
          <input
            v-model.trim="slug"
            class="input sbcp-mono"
            type="text"
            maxlength="80"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            autocomplete="off"
            placeholder="lowercase-with-hyphens"
            required
            @focus="slugTouched = true"
          />
          <span class="sbcp-hint muted small">
            Used in URLs such as <code>/{{ slug || 'your-slug' }}/programs/…</code>. Letters, numbers, and hyphens only.
          </span>
        </label>

        <p v-if="error" class="sbcp-error">{{ error }}</p>

        <div class="sbcp-actions">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="submitting" @click="requestClose">Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm" :disabled="submitting || !canSubmit">
            {{ submitting ? 'Creating…' : 'Create program' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  agencyId: { type: Number, required: true },
  parentAgencyName: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue', 'created']);

const titleId = 'sbcp-add-program-title';
const name = ref('');
const slug = ref('');
const slugTouched = ref(false);
const error = ref('');
const submitting = ref(false);

const parentAgencyLabel = computed(() => String(props.parentAgencyName || 'this agency').trim() || 'this agency');

const canSubmit = computed(() => {
  const n = String(name.value || '').trim();
  const s = String(slug.value || '').trim();
  return n.length >= 2 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 2;
});

function suggestSlugFromName(raw) {
  let s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  if (s.length > 80) s = s.slice(0, 80).replace(/-+$/g, '');
  return s;
}

function onNameInput() {
  if (slugTouched.value) return;
  const next = suggestSlugFromName(name.value);
  slug.value = next;
}

function resetForm() {
  name.value = '';
  slug.value = '';
  slugTouched.value = false;
  error.value = '';
  submitting.value = false;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      resetForm();
    }
  }
);

function requestClose() {
  if (submitting.value) return;
  emit('update:modelValue', false);
}

async function submit() {
  error.value = '';
  const n = String(name.value || '').trim();
  const s = String(slug.value || '').trim().toLowerCase();
  if (!props.agencyId || n.length < 2) {
    error.value = 'Enter a program name (at least 2 characters).';
    return;
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) || s.length < 2) {
    error.value = 'Slug must be lowercase letters, numbers, and hyphens only (e.g. summer-itsco).';
    return;
  }
  submitting.value = true;
  try {
    const res = await api.post(
      '/agencies',
      {
        name: n,
        officialName: n,
        slug: s,
        organizationType: 'program',
        affiliatedAgencyId: props.agencyId,
        isActive: true,
        themeSettings: { useAffiliatedAgencyBranding: true }
      },
      { skipGlobalLoading: true }
    );
    const created = res.data;
    const id = Number(created?.id ?? created?.agency_id ?? 0);
    if (!Number.isFinite(id) || id < 1) {
      error.value = 'Program was created but the response did not include an id. Refresh the page.';
      emit('update:modelValue', false);
      emit('created', { id: null });
      return;
    }
    emit('created', {
      id,
      name: String(created?.name || n).trim(),
      slug: String(created?.slug || s).trim(),
      portal_url: String(created?.portal_url || created?.portalUrl || '').trim()
    });
    emit('update:modelValue', false);
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e.message || 'Failed to create program';
    error.value = msg;
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.sbcp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  z-index: 95;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.sbcp-card {
  width: min(520px, 100%);
  max-height: min(92vh, 720px);
  overflow: auto;
  background: var(--panel, #fff);
  border-radius: 14px;
  border: 1px solid var(--border, #e2e8f0);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.2);
}
.sbcp-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 18px 0;
}
.sbcp-title {
  margin: 0;
  font-size: 1.25rem;
  color: var(--primary, #15803d);
}
.sbcp-intro {
  margin: 8px 0 0;
  font-size: 0.875rem;
  line-height: 1.45;
}
.sbcp-close {
  border: none;
  background: transparent;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  padding: 0 4px;
}
.sbcp-form {
  padding: 16px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sbcp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sbcp-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}
.sbcp-req {
  color: #b91c1c;
}
.sbcp-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.sbcp-hint {
  line-height: 1.35;
}
.sbcp-error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.9rem;
}
.sbcp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 4px;
}
</style>
