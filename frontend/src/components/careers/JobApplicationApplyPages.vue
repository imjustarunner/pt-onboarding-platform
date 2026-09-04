<template>
  <div class="jap" :style="{ '--jap-accent': accentColor }">
    <div v-if="page === 'personal'" class="jap-page">
      <article class="jap-job-card">
        <div class="jap-job-kicker">{{ agencyName }}</div>
        <h1 class="jap-job-title">{{ jobTitle }}</h1>
        <div class="jap-job-meta">
          <span v-if="location">{{ location }}</span>
          <span v-if="schedule">{{ schedule }}</span>
        </div>
        <p v-if="introSummary" class="jap-job-summary">{{ introSummary }}</p>
        <div v-if="summaryHighlightBullets.length" class="jap-resp">
          <ul>
            <li v-for="(item, i) in summaryHighlightBullets" :key="`sum-${i}`">{{ item }}</li>
          </ul>
        </div>
        <div v-if="keyResponsibilities.length" class="jap-resp">
          <h2>Key responsibilities</h2>
          <template v-for="(set, si) in keyResponsibilities" :key="`kr-${si}`">
            <h3 v-if="set.title">{{ set.title }}</h3>
            <ul>
              <li v-for="(item, i) in set.items" :key="`kri-${si}-${i}`">{{ item }}</li>
            </ul>
          </template>
        </div>
        <button type="button" class="jap-link" @click="detailsOpen = !detailsOpen">
          {{ detailsOpen ? 'Hide full job details' : 'View full job details' }}
        </button>
        <div v-if="detailsOpen" class="jap-full">
          <JobDescriptionSections
            v-if="sections"
            :sections="sections"
            :title="jobTitle"
            :summary="roleSummary"
            :location="location"
            :schedule="schedule"
            :accent-color="accentColor"
            :pdf-url="pdfUrl"
            :pdf-label="pdfLabel"
            show-header
          />
          <p v-else-if="pdfUrl">
            <a :href="pdfUrl" target="_blank" rel="noopener noreferrer">{{ pdfLabel || 'Download full PDF' }}</a>
          </p>
        </div>
      </article>

      <section class="jap-card">
        <h2>Your information</h2>
        <div class="jap-grid">
          <label>
            First name <span class="req">*</span>
            <input :value="firstName" type="text" autocomplete="given-name" @input="$emit('update:firstName', $event.target.value)" />
          </label>
          <label>
            Last name <span class="req">*</span>
            <input :value="lastName" type="text" autocomplete="family-name" @input="$emit('update:lastName', $event.target.value)" />
          </label>
          <label>
            Email <span class="req">*</span>
            <input :value="email" type="email" autocomplete="email" @input="$emit('update:email', $event.target.value)" />
          </label>
          <label>
            Phone <span class="req">*</span>
            <input :value="phone" type="tel" autocomplete="tel" @input="$emit('update:phone', $event.target.value)" />
          </label>
          <label>
            Best time to contact
            <input :value="bestTimeToContact" type="text" placeholder="Weekday mornings, after 4pm…" @input="$emit('update:bestTimeToContact', $event.target.value)" />
          </label>
          <label>
            Languages spoken fluently
            <input :value="fluentLanguages" type="text" placeholder="e.g., English, Spanish, ASL" @input="$emit('update:fluentLanguages', $event.target.value)" />
          </label>
          <label class="jap-span">
            General virtual interview availability
            <textarea :value="interviewAvailability" rows="3" placeholder="Days, times, or notice you need for a virtual interview…" @input="$emit('update:interviewAvailability', $event.target.value)" />
          </label>
        </div>

        <div v-if="collectCredential" class="jap-cred">
          <h3>Licensure</h3>
          <p class="jap-hint">
            {{ credentialMode === 'mandatory' ? 'Required for this role.' : 'Please share your credential if you have one.' }}
          </p>
          <div class="jap-grid">
            <label>
              Credential / licensure <span v-if="credentialMode === 'mandatory'" class="req">*</span>
              <input :value="credential" type="text" placeholder="LPC, LCSW, MFT…" @input="$emit('update:credential', $event.target.value)" />
            </label>
            <label>
              License number <span v-if="credentialMode === 'mandatory'" class="req">*</span>
              <input :value="licenseNumber" type="text" placeholder="LPC.002383" @input="$emit('update:licenseNumber', $event.target.value)" />
            </label>
          </div>
          <div v-if="showLicensedFollowUps" class="jap-follow">
            <p class="jap-follow-label">Are you independently credentialed, or with a group practice?</p>
            <label class="jap-radio">
              <input type="radio" :checked="independentlyCredentialed === true" @change="$emit('update:independentlyCredentialed', true)" />
              Independently credentialed
            </label>
            <label class="jap-radio">
              <input type="radio" :checked="independentlyCredentialed === false" @change="$emit('update:independentlyCredentialed', false)" />
              Group practice
            </label>
            <label v-if="independentlyCredentialed === false" class="jap-span" style="margin-top:8px;">
              Which insurances are you credentialed with?
              <textarea :value="groupPracticeInsurances" rows="2" @input="$emit('update:groupPracticeInsurances', $event.target.value)" />
            </label>
            <label class="jap-check" style="margin-top:12px;">
              <input type="checkbox" :checked="!!willingToSupervise" @change="$emit('update:willingToSupervise', $event.target.checked)" />
              I am eligible and willing to supervise unlicensed or prelicensed staff
            </label>
          </div>
        </div>
      </section>

      <section class="jap-card">
        <h2>Documents</h2>
        <div class="jap-upload">
          <div>
            <strong>Resume <span class="req">*</span></strong>
            <p class="jap-hint">PDF or Word. You can replace this file if you pick the wrong one.</p>
            <input type="file" accept=".pdf,.doc,.docx,application/pdf" @change="$emit('resume-file', $event)" />
            <p v-if="resumeFileName" class="jap-file-ok">{{ resumeFileName }} <button type="button" class="jap-replace" @click="$emit('replace-resume')">Replace</button></p>
          </div>
          <div>
            <strong>Cover letter</strong>
            <p class="jap-hint">Optional. Upload a file or paste text below.</p>
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,.txt" @change="$emit('cover-file', $event)" />
            <p v-if="coverFileName" class="jap-file-ok">{{ coverFileName }} <button type="button" class="jap-replace" @click="$emit('replace-cover')">Replace</button></p>
            <textarea :value="coverLetterText" rows="5" placeholder="Or paste your cover letter…" @input="$emit('update:coverLetterText', $event.target.value)" />
          </div>
        </div>
      </section>

      <p v-if="error" class="jap-error">{{ error }}</p>
      <div class="jap-actions">
        <button type="button" class="jap-btn jap-btn--ghost" :disabled="busy" @click="$emit('back')">Back</button>
        <button type="button" class="jap-btn" :disabled="busy" @click="$emit('continue')">
          {{ busy ? 'Saving…' : 'Continue to references' }}
        </button>
      </div>
    </div>

    <div v-else class="jap-page">
      <section class="jap-card">
        <h1>Professional references</h1>
        <p class="jap-hint">Three people. Name and email are required for each.</p>
        <div v-for="(ref, idx) in references" :key="`ref-${idx}`" class="jap-ref">
          <h3>Reference {{ idx + 1 }}</h3>
          <div class="jap-grid">
            <label>
              Name <span class="req">*</span>
              <input :value="ref.name" type="text" @input="patchRef(idx, 'name', $event.target.value)" />
            </label>
            <label>
              Email <span class="req">*</span>
              <input :value="ref.email" type="email" @input="patchRef(idx, 'email', $event.target.value)" />
            </label>
            <label>
              Relationship
              <input :value="ref.relationship" type="text" @input="patchRef(idx, 'relationship', $event.target.value)" />
            </label>
            <label>
              Organization
              <input :value="ref.organization" type="text" @input="patchRef(idx, 'organization', $event.target.value)" />
            </label>
            <label>
              Phone
              <input :value="ref.phone" type="tel" @input="patchRef(idx, 'phone', $event.target.value)" />
            </label>
          </div>
        </div>
      </section>

      <section class="jap-card jap-release">
        <h2>Reference Release</h2>
        <p>I authorize {{ agencyName }} to contact the professional references I have provided and to obtain information about my employment history, qualifications, and character. I release {{ agencyName }}, its employees, and those references from any liability arising from this inquiry. I understand this signed release will be stored with my application.</p>
        <label class="jap-check">
          <input type="checkbox" :checked="jobAcknowledged" @change="$emit('update:jobAcknowledged', $event.target.checked)" />
          I have read and understand the job description for {{ jobTitle }}.
        </label>
        <label class="jap-check">
          <input type="checkbox" :checked="releaseAcknowledged" @change="$emit('update:releaseAcknowledged', $event.target.checked)" />
          I agree to this Reference Release.
        </label>
        <AdaptiveSignatureCapture
          title="Sign the Reference Release"
          :signer-name="signerName"
          :model-value="signatureData"
          @update:model-value="$emit('update:signatureData', $event)"
          @signed="(payload) => $emit('update:signatureData', payload?.dataUrl || payload)"
        />
      </section>

      <p v-if="error" class="jap-error">{{ error }}</p>
      <div class="jap-actions">
        <button type="button" class="jap-btn jap-btn--ghost" :disabled="busy" @click="$emit('back')">Back</button>
        <button type="button" class="jap-btn" :disabled="busy" @click="$emit('submit')">
          {{ busy ? 'Submitting…' : 'Submit application' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import JobDescriptionSections from './JobDescriptionSections.vue';
import { AdaptiveSignatureCapture } from '../adaptive-intake';
import { isFullyLicensedCredentialText } from '../../utils/credentialNormalization.js';

const props = defineProps({
  page: { type: String, default: 'personal' },
  accentColor: { type: String, default: '#1a8c54' },
  agencyName: { type: String, default: '' },
  jobTitle: { type: String, default: '' },
  location: { type: String, default: '' },
  schedule: { type: String, default: '' },
  roleSummary: { type: String, default: '' },
  sections: { type: Object, default: null },
  pdfUrl: { type: String, default: '' },
  pdfLabel: { type: String, default: '' },
  credentialMode: { type: String, default: 'none' },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  fluentLanguages: { type: String, default: '' },
  bestTimeToContact: { type: String, default: '' },
  interviewAvailability: { type: String, default: '' },
  credential: { type: String, default: '' },
  licenseNumber: { type: String, default: '' },
  independentlyCredentialed: { type: [Boolean, null], default: null },
  groupPracticeInsurances: { type: String, default: '' },
  willingToSupervise: { type: Boolean, default: false },
  resumeFileName: { type: String, default: '' },
  coverFileName: { type: String, default: '' },
  coverLetterText: { type: String, default: '' },
  references: { type: Array, default: () => [] },
  jobAcknowledged: { type: Boolean, default: false },
  releaseAcknowledged: { type: Boolean, default: false },
  signatureData: { type: String, default: '' },
  error: { type: String, default: '' },
  busy: { type: Boolean, default: false }
});

defineEmits([
  'update:firstName',
  'update:lastName',
  'update:email',
  'update:phone',
  'update:fluentLanguages',
  'update:bestTimeToContact',
  'update:interviewAvailability',
  'update:credential',
  'update:licenseNumber',
  'update:independentlyCredentialed',
  'update:groupPracticeInsurances',
  'update:willingToSupervise',
  'update:coverLetterText',
  'update:references',
  'update:jobAcknowledged',
  'update:releaseAcknowledged',
  'update:signatureData',
  'resume-file',
  'cover-file',
  'replace-resume',
  'replace-cover',
  'continue',
  'submit',
  'back'
]);

const detailsOpen = ref(false);

const collectCredential = computed(() => ['expected', 'mandatory'].includes(String(props.credentialMode || '').toLowerCase()));
const showLicensedFollowUps = computed(() =>
  collectCredential.value && isFullyLicensedCredentialText(props.credential)
);
const signerName = computed(() => `${props.firstName || ''} ${props.lastName || ''}`.trim());

/** Prefer structured about-the-role over a flat description dump on the apply card. */
const aboutParagraphs = computed(() => {
  const about = String(props.sections?.aboutTheRole || '').replace(/\r\n/g, '\n').trim();
  if (!about) return [];
  const byBlank = about.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return about.split(/\n/).map((p) => p.trim()).filter(Boolean);
});

const introSummary = computed(() => {
  if (aboutParagraphs.value.length) return aboutParagraphs.value[0];
  const raw = String(props.roleSummary || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';
  // Avoid dumping a huge flat JD blob as one paragraph.
  if (raw.length > 420) {
    const first = raw.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean)[0] || raw;
    return first.length > 420 ? `${first.slice(0, 417).trim()}…` : first;
  }
  return raw;
});

const summaryHighlightBullets = computed(() => {
  if (aboutParagraphs.value.length > 1) {
    return aboutParagraphs.value.slice(1, 5);
  }
  const benefits = Array.isArray(props.sections?.benefits)
    ? props.sections.benefits.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  return benefits;
});

const keyResponsibilities = computed(() => {
  const src = props.sections || {};
  const sets = Array.isArray(src.responsibilitySets) ? src.responsibilitySets : [];
  const mapped = sets
    .map((s) => ({
      title: String(s?.title || '').trim(),
      items: Array.isArray(s?.items) ? s.items.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4) : []
    }))
    .filter((s) => s.items.length)
    .slice(0, 3);
  if (mapped.length) return mapped;
  const flat = Array.isArray(src.responsibilities)
    ? src.responsibilities.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 6)
    : [];
  return flat.length ? [{ title: '', items: flat }] : [];
});

const patchRef = (idx, key, value) => {
  const next = (props.references || []).map((r, i) => (i === idx ? { ...r, [key]: value } : r));
  // emit via parent v-model isn't set up for nested; parent owns the array so mutate in place
  const row = props.references?.[idx];
  if (row) row[key] = value;
};
</script>

<style scoped>
.jap { color: #0f172a; }
.jap-page { display: flex; flex-direction: column; gap: 18px; }
.jap-job-card, .jap-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 22px;
}
.jap-job-kicker {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--jap-accent);
}
.jap-job-title {
  margin: 6px 0 8px;
  font-size: 1.55rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.jap-job-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 10px;
}
.jap-job-summary { margin: 0 0 12px; line-height: 1.6; color: #334155; }
.jap-resp h2, .jap-card h1, .jap-card h2 {
  margin: 0 0 10px;
  font-size: 1.05rem;
  color: var(--jap-accent);
}
.jap-resp h3 { margin: 10px 0 6px; font-size: 0.92rem; }
.jap-resp ul { margin: 0; padding-left: 1.15rem; display: flex; flex-direction: column; gap: 6px; }
.jap-link {
  margin-top: 12px;
  background: none;
  border: 0;
  color: var(--jap-accent);
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.jap-full { margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
.jap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
}
.jap-span { grid-column: 1 / -1; }
.jap-grid label, .jap-cred label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.82rem;
  font-weight: 650;
  color: #334155;
}
.jap-grid input, .jap-grid textarea, .jap-upload textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 10px;
  font: inherit;
  font-weight: 400;
}
.req { color: #b91c1c; }
.jap-hint { margin: 0 0 10px; font-size: 0.82rem; color: #64748b; font-weight: 400; }
.jap-cred { margin-top: 18px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
.jap-cred h3 { margin: 0 0 6px; font-size: 0.95rem; }
.jap-follow { margin-top: 14px; }
.jap-follow-label { font-size: 0.85rem; font-weight: 650; margin: 0 0 8px; }
.jap-radio, .jap-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 500;
  margin: 6px 0;
}
.jap-upload { display: grid; gap: 18px; }
.jap-file-ok { margin: 6px 0 0; font-size: 0.85rem; color: var(--jap-accent); font-weight: 650; }
.jap-replace {
  margin-left: 8px;
  background: none;
  border: 0;
  color: #64748b;
  cursor: pointer;
  font-weight: 650;
}
.jap-ref { padding: 14px 0; border-top: 1px solid #e2e8f0; }
.jap-ref:first-of-type { border-top: 0; }
.jap-ref h3 { margin: 0 0 10px; font-size: 0.92rem; }
.jap-release p { line-height: 1.6; color: #334155; }
.jap-error { color: #b91c1c; font-weight: 650; margin: 0; }
.jap-actions { display: flex; justify-content: flex-end; gap: 10px; }
.jap-btn {
  background: var(--jap-accent);
  color: #fff;
  border: 0;
  border-radius: 10px;
  padding: 11px 18px;
  font-weight: 700;
  cursor: pointer;
}
.jap-btn--ghost { background: #fff; color: #334155; border: 1px solid #cbd5e1; }
.jap-btn:disabled { opacity: 0.6; cursor: not-allowed; }
@media (max-width: 720px) {
  .jap-grid { grid-template-columns: 1fr; }
}
</style>
