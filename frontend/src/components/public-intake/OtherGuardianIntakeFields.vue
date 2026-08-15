<template>
  <div id="other-guardian-fields" class="ogi">
    <strong class="ogi-title">{{ copy.title }}</strong>

    <label class="ogi-rights">
      {{ copy.rightsLabel }}
      <select v-model="model.hasLegalRights">
        <option value="">{{ copy.selectOption }}</option>
        <option value="yes">{{ copy.yes }}</option>
        <option value="shared">{{ copy.shared }}</option>
        <option value="no">{{ copy.no }}</option>
      </select>
    </label>

    <p v-if="localError" class="ogi-err">{{ localError }}</p>

    <template v-if="needsOtherGuardian">
      <div class="ogi-grid">
        <label>{{ copy.firstName }}<input v-model="model.firstName" /></label>
        <label>{{ copy.lastName }}<input v-model="model.lastName" /></label>
        <label>{{ copy.email }}<input v-model="model.email" type="email" autocomplete="off" /></label>
        <label>
          {{ copy.phone }}
          <input :value="model.phone" type="tel" inputmode="tel" autocomplete="tel" @input="onPhone" />
        </label>
        <label>{{ copy.relationship }}<input v-model="model.relationship" /></label>
      </div>
      <p v-if="phoneOnly" class="ogi-warn">{{ copy.phoneOnlyNote }}</p>
      <p v-if="missingContact" class="ogi-warn">{{ copy.missingContactNote }}</p>
      <label v-if="hasEmail" class="ai-consent-check">
        <input type="checkbox" v-model="model.sendInvite" />
        <span>{{ copy.sendLink }}</span>
      </label>
      <label class="ai-consent-check">
        <input type="checkbox" v-model="model.sendLater" />
        <span>{{ copy.sendLater }}</span>
      </label>
      <p v-if="model.sendLater" class="ogi-note">{{ copy.sendLaterDelay }}</p>
      <button type="button" class="ogi-why" @click="infoOpen = true">
        {{ copy.viewConsentDetails }}
      </button>
    </template>

    <div v-if="intakeForDependent" class="ogi-upload">
      <p class="ogi-upload-label">{{ copy.courtDocsLabel }}</p>
      <p class="ogi-note">{{ copy.courtDocsHelp }}</p>
      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx" multiple @change="onFiles" />
      <ul v-if="fileNames.length" class="ogi-files">
        <li v-for="(name, i) in fileNames" :key="`${name}-${i}`">{{ name }}</li>
      </ul>
    </div>

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

    <Teleport to="body">
      <div
        v-if="infoOpen && needsOtherGuardian"
        class="ogi-backdrop"
        @click.self="infoOpen = false"
      >
        <aside class="ogi-side" role="dialog" aria-modal="true" :aria-label="copy.title">
          <div class="ogi-side-head">
            <strong>{{ copy.title }}</strong>
            <button type="button" class="ogi-close" @click="infoOpen = false">{{ copy.close }}</button>
          </div>
          <p>{{ copy.lead }}</p>
          <p class="ogi-note">{{ copy.ageOfConsentNote }}</p>
          <ul v-if="copy.resources?.length" class="ogi-links">
            <li v-for="r in copy.resources" :key="r.url">
              <a :href="r.url" target="_blank" rel="noopener noreferrer">{{ r.label }}</a>
            </li>
          </ul>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { formatUsPhoneInput } from '../../utils/contactInput.js';

const props = defineProps({
  model: { type: Object, required: true },
  copy: { type: Object, required: true },
  canEdit: { type: Boolean, default: false },
  agencySlug: { type: String, default: '' },
  locale: { type: String, default: 'en' },
  error: { type: String, default: '' },
  intakeForDependent: { type: Boolean, default: true }
});
const emit = defineEmits(['saved']);

const infoOpen = ref(false);
const needsOtherGuardian = computed(() =>
  props.model.hasLegalRights === 'yes' || props.model.hasLegalRights === 'shared'
);
const hasEmail = computed(() => String(props.model.email || '').includes('@'));
const hasPhone = computed(() => String(props.model.phone || '').replace(/\D/g, '').length >= 7);
const phoneOnly = computed(() => needsOtherGuardian.value && hasPhone.value && !hasEmail.value);
const missingContact = computed(() =>
  needsOtherGuardian.value && !hasEmail.value && !hasPhone.value && !props.model.sendLater
);
const localError = computed(() => String(props.error || '').trim());
const fileNames = computed(() =>
  (Array.isArray(props.model.courtFiles) ? props.model.courtFiles : []).map((f) => f.name)
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

watch(needsOtherGuardian, (open) => {
  infoOpen.value = !!open;
});

watch(hasEmail, (ok) => {
  if (!ok) props.model.sendInvite = false;
});

function onPhone(event) {
  props.model.phone = formatUsPhoneInput(event.target.value);
}

function onFiles(event) {
  const picked = Array.from(event.target.files || []);
  props.model.courtFiles = [...(props.model.courtFiles || []), ...picked];
  event.target.value = '';
}

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
.ogi { display: grid; gap: 0.55rem; }
.ogi-title { font-size: 0.95rem; }
.ogi-why {
  justify-self: start;
  border: 0;
  background: none;
  color: #1d4ed8;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: underline;
}
.ogi p, .ogi-note { margin: 0; font-size: 0.86rem; line-height: 1.4; color: #334155; }
.ogi-edit { display: grid; gap: 0.4rem; background: #f8fafc; border-radius: 10px; padding: 0.65rem; }
.ogi-edit-label { font-weight: 700; font-size: 0.8rem; }
.ogi-res { display: grid; grid-template-columns: 1fr 1.4fr; gap: 0.35rem; }
.ogi-rights,
.ogi-grid label {
  display: grid;
  gap: 0.2rem;
  font-size: 0.84rem;
  font-weight: 650;
  text-align: left;
}
.ogi-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem 0.75rem;
}
.ogi textarea, .ogi input, .ogi select {
  width: 100%;
  border: 1px solid #d7e3dc;
  border-radius: 8px;
  padding: 0.4rem 0.55rem;
  font: inherit;
  text-align: left;
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
.ogi-err { color: #b42318; margin: 0; font-weight: 700; }
.ogi-upload {
  border: 1px dashed #c5d5cc;
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  background: #f7faf8;
}
.ogi-upload-label { margin: 0 0 0.2rem; font-weight: 800; font-size: 0.84rem; }
.ogi-files { margin: 0.35rem 0 0; padding-left: 1.1rem; font-size: 0.8rem; }
@media (max-width: 640px) {
  .ogi-grid { grid-template-columns: 1fr; }
}
</style>

<style>
.ogi-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(15, 23, 42, 0.28);
  display: flex;
  justify-content: flex-end;
}
.ogi-side {
  width: min(420px, 92vw);
  height: 100%;
  background: #fff;
  box-shadow: -12px 0 32px rgba(15, 23, 42, 0.18);
  padding: 1.1rem 1.15rem;
  display: grid;
  align-content: start;
  gap: 0.75rem;
  overflow: auto;
}
.ogi-side-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}
.ogi-close {
  border: 0;
  background: #eef2f7;
  border-radius: 8px;
  padding: 0.3rem 0.65rem;
  font-weight: 700;
  cursor: pointer;
}
.ogi-side p,
.ogi-side .ogi-note {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: #334155;
}
.ogi-side .ogi-links {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.88rem;
}
</style>
