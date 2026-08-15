<template>
  <div id="other-guardian-fields" class="ogi">
    <strong class="ogi-title">{{ copy.title }}</strong>

    <label class="ogi-rights">
      {{ copy.rightsLabel }}
      <select v-model="model.hasLegalRights">
        <option value="">{{ copy.selectOption }}</option>
        <option value="yes">{{ copy.yes }}</option>
        <option value="no">{{ copy.no }}</option>
      </select>
    </label>

    <p v-if="localError" class="ogi-err">{{ localError }}</p>

    <template v-if="needsOtherGuardian">
      <div class="ogi-row ogi-row--3">
        <label>
          {{ copy.firstName }}
          <input v-model="model.firstName" :placeholder="copy.firstPlaceholder || 'First'" autocomplete="off" />
        </label>
        <label>
          {{ copy.lastName }}
          <input v-model="model.lastName" :placeholder="copy.lastPlaceholder || 'Last'" autocomplete="off" />
        </label>
        <label>
          {{ copy.relationship }}
          <input v-model="model.relationship" :placeholder="copy.relationshipPlaceholder || 'e.g., Co-parent, Guardian'" autocomplete="off" />
        </label>
      </div>
      <div class="ogi-row ogi-row--2">
        <label>
          {{ copy.email }}
          <span class="ogi-icon-field">
            <svg class="ogi-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m0 4-8 5L4 8V6l8 5 8-5z"/></svg>
            <input v-model="model.email" type="email" autocomplete="off" :placeholder="copy.emailPlaceholder || 'name@email.com'" />
          </span>
        </label>
        <label>
          {{ copy.phone }}
          <span class="ogi-icon-field">
            <svg class="ogi-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.2 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1z"/></svg>
            <input
              :value="model.phone"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              :placeholder="copy.phonePlaceholder || '(555) 123-4567'"
              @input="onPhone"
            />
          </span>
        </label>
      </div>
      <p class="ogi-info">
        <span aria-hidden="true">ⓘ</span>
        {{ copy.reachOutNote }}
      </p>

      <button type="button" class="ogi-acc" :aria-expanded="infoOpen ? 'true' : 'false'" @click="infoOpen = !infoOpen">
        <span class="ogi-chev" :class="{ 'is-open': infoOpen }" aria-hidden="true">▾</span>
        {{ copy.viewConsentDetails }}
      </button>
      <div v-if="infoOpen" class="ogi-details">
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
      </div>

      <div class="ogi-upload">
        <svg class="ogi-upload-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8zm-1 13v3h-2v-3H8l4-4 4 4zm0-10V3.5L18.5 9H13z"/>
        </svg>
        <div class="ogi-upload-copy">
          <strong>{{ copy.courtDocsLabel }}</strong>
          <span>{{ copy.courtDocsHelp }}</span>
        </div>
        <label class="ogi-choose">
          {{ copy.chooseFiles || 'Choose Files' }}
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx" multiple hidden @change="onFiles" />
        </label>
        <span class="ogi-nofile">{{ fileNames.length ? fileNames.join(', ') : (copy.noFileChosen || 'No file chosen') }}</span>
      </div>
    </template>
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
  if (!open) infoOpen.value = false;
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
.ogi { display: grid; gap: 0.4rem; }
.ogi-title { font-size: 0.95rem; color: var(--df-primary, #1b3d2f); }
.ogi p, .ogi-note { margin: 0; font-size: 0.8rem; line-height: 1.35; color: #334155; }
.ogi-rights,
.ogi-row label {
  display: grid;
  gap: 0.15rem;
  font-size: 0.78rem;
  font-weight: 650;
  text-align: left;
}
.ogi-row {
  display: grid;
  gap: 0.45rem 0.55rem;
}
.ogi-row--3 { grid-template-columns: 1fr 1fr 1.15fr; }
.ogi-row--2 { grid-template-columns: 1.35fr 1fr; }
.ogi textarea, .ogi input, .ogi select {
  width: 100%;
  border: 1px solid #d7e3dc;
  border-radius: 8px;
  padding: 0.32rem 0.5rem;
  font: inherit;
  text-align: left;
  min-height: 2.15rem;
  box-sizing: border-box;
}
.ogi-icon-field {
  position: relative;
  display: block;
}
.ogi-ico {
  position: absolute;
  left: 0.5rem;
  top: 50%;
  width: 1rem;
  height: 1rem;
  transform: translateY(-50%);
  color: #64748b;
  pointer-events: none;
}
.ogi-icon-field input { padding-left: 1.85rem; }
.ogi-info {
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.35;
  color: #475569;
}
.ogi-acc {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 0;
  background: none;
  color: #1d4ed8;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}
.ogi-chev { display: inline-block; transition: transform 0.15s ease; }
.ogi-chev.is-open { transform: rotate(-180deg); }
.ogi-details {
  display: grid;
  gap: 0.4rem;
  padding: 0.5rem 0.6rem;
  background: #f8fafc;
  border-radius: 8px;
}
.ogi-links { margin: 0; padding-left: 1.1rem; font-size: 0.8rem; }
.ogi-err { color: #b42318; margin: 0; font-weight: 700; }
.ogi-upload {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.65rem;
  border: 1px solid #d7e3dc;
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  background: #f7faf8;
}
.ogi-upload-ico { width: 1.35rem; height: 1.35rem; color: #64748b; flex: 0 0 auto; }
.ogi-upload-copy {
  display: grid;
  gap: 0.05rem;
  min-width: 10rem;
  flex: 1 1 10rem;
  font-size: 0.78rem;
  color: #64748b;
}
.ogi-upload-copy strong { color: #0f172a; font-size: 0.82rem; }
.ogi-choose {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--df-primary, #1b3d2f);
  color: var(--df-primary, #1b3d2f);
  border-radius: 8px;
  padding: 0.28rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  background: #fff;
}
.ogi-nofile { font-size: 0.78rem; color: #64748b; }
.ogi-edit { display: grid; gap: 0.35rem; background: #fff; border-radius: 8px; padding: 0.5rem; }
.ogi-edit-label { font-weight: 700; font-size: 0.78rem; }
.ogi-res { display: grid; grid-template-columns: 1fr 1.4fr; gap: 0.35rem; }
.ogi-save {
  justify-self: start;
  border: 0;
  border-radius: 8px;
  padding: 0.3rem 0.65rem;
  background: #1b3d2f;
  color: #fff;
  font-weight: 700;
}
@media (max-width: 640px) {
  .ogi-row--3,
  .ogi-row--2 { grid-template-columns: 1fr; }
}
</style>
