<template>
  <div class="ogi">
    <strong>{{ copy.title }}</strong>
    <p>{{ copy.lead }}</p>
    <p class="ogi-note">{{ copy.ageOfConsentNote }}</p>
    <ul v-if="copy.resources?.length" class="ogi-links">
      <li v-for="r in copy.resources" :key="r.url">
        <a :href="r.url" target="_blank" rel="noopener noreferrer">{{ r.label }}</a>
      </li>
    </ul>
    <div v-if="canEdit" class="ogi-edit">
      <p class="ogi-edit-label">Edit this text and resource links (saved to the tenant)</p>
      <textarea v-model="draft.otherGuardianLead" rows="2" />
      <textarea v-model="draft.ageOfConsentNote" rows="3" />
      <textarea v-model="draft.noEmailWarning" rows="2" />
      <div v-for="(r, idx) in draft.resources" :key="idx" class="ogi-res">
        <input v-model.trim="r.label" placeholder="Link label" />
        <input v-model.trim="r.url" placeholder="https://" />
      </div>
      <button type="button" class="ogi-save" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save consent copy' }}
      </button>
      <p v-if="saveError" class="ogi-err">{{ saveError }}</p>
    </div>
    <label>
      {{ copy.rightsLabel }}
      <select v-model="model.hasLegalRights">
        <option value="">{{ copy.selectOption }}</option>
        <option value="yes">{{ copy.yes }}</option>
        <option value="shared">{{ copy.shared }}</option>
        <option value="no">{{ copy.no }}</option>
      </select>
    </label>
    <template v-if="needsOtherGuardian">
      <div class="field-row field-row--compact">
        <label>{{ copy.firstName }}<input v-model="model.firstName" /></label>
        <label>{{ copy.lastName }}<input v-model="model.lastName" /></label>
      </div>
      <div class="field-row field-row--compact">
        <label>{{ copy.email }}<input v-model="model.email" type="email" /></label>
        <label>{{ copy.phone }}<input v-model="model.phone" type="tel" /></label>
        <label>{{ copy.relationship }}<input v-model="model.relationship" /></label>
      </div>
      <p v-if="phoneOnly" class="ogi-warn">{{ copy.noEmailWarning }}</p>
      <label class="ai-consent-check">
        <input type="checkbox" v-model="model.sendInvite" :disabled="phoneOnly" />
        <span>{{ copy.sendLink }}</span>
      </label>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  model: { type: Object, required: true },
  copy: { type: Object, required: true },
  canEdit: { type: Boolean, default: false },
  agencySlug: { type: String, default: '' },
  locale: { type: String, default: 'en' }
});
const emit = defineEmits(['saved']);

const needsOtherGuardian = computed(() =>
  props.model.hasLegalRights === 'yes' || props.model.hasLegalRights === 'shared'
);
const phoneOnly = computed(() =>
  needsOtherGuardian.value
  && !String(props.model.email || '').includes('@')
  && String(props.model.phone || '').replace(/\D/g, '').length >= 7
);

const draft = reactive({
  otherGuardianLead: '',
  ageOfConsentNote: '',
  noEmailWarning: '',
  resources: [{ label: '', url: '' }, { label: '', url: '' }]
});
const saving = ref(false);
const saveError = ref('');

watch(
  () => props.copy,
  (next) => {
    if (!next) return;
    draft.otherGuardianLead = next.lead || '';
    draft.ageOfConsentNote = next.ageOfConsentNote || '';
    draft.noEmailWarning = next.noEmailWarning || '';
    const list = Array.isArray(next.resources) && next.resources.length
      ? next.resources.map((r) => ({ label: r.label || '', url: r.url || '' }))
      : [{ label: '', url: '' }, { label: '', url: '' }];
    while (list.length < 2) list.push({ label: '', url: '' });
    draft.resources = list.slice(0, 4);
  },
  { immediate: true, deep: true }
);

async function save() {
  if (!props.agencySlug) return;
  saving.value = true;
  saveError.value = '';
  try {
    const { data } = await api.patch(
      `/public/agency-support/${encodeURIComponent(props.agencySlug)}/settings`,
      {
        locale: props.locale,
        intakeLegal: {
          otherGuardianLead: draft.otherGuardianLead,
          ageOfConsentNote: draft.ageOfConsentNote,
          noEmailWarning: draft.noEmailWarning,
          resources: draft.resources
        }
      }
    );
    emit('saved', data?.intakeLegal || null);
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || 'Unable to save.';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.ogi { display: grid; gap: 0.45rem; }
.ogi p, .ogi-note { margin: 0; font-size: 0.86rem; line-height: 1.4; color: #334155; }
.ogi-links { margin: 0; padding-left: 1.1rem; font-size: 0.84rem; }
.ogi-edit { display: grid; gap: 0.4rem; background: #f8fafc; border-radius: 10px; padding: 0.65rem; }
.ogi-edit-label { font-weight: 700; font-size: 0.8rem; }
.ogi-res { display: grid; grid-template-columns: 1fr 1.4fr; gap: 0.35rem; }
.ogi textarea, .ogi input, .ogi select {
  width: 100%;
  border: 1px solid #d7e3dc;
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  font: inherit;
}
.ogi-save {
  justify-self: start;
  border: 0;
  border-radius: 8px;
  padding: 0.35rem 0.7rem;
  background: #1b3d2f;
  color: #fff;
  font-weight: 700;
}
.ogi-warn { color: #9a3412; font-weight: 650; }
.ogi-err { color: #b42318; margin: 0; }
</style>
