<template>
  <DigitalFormShell
    class="ref-root"
    :branding="formBranding"
    :program-title-override="meta?.agencyName || 'Professional Reference'"
    form-subtitle="Hiring reference"
    :progress-steps="progressSteps"
    :progress-index="progressIndex"
    :cover-mode="loading || !!loadError || done"
  >
    <div v-if="loading" class="df-loading">Loading…</div>
    <div v-else-if="loadError" class="df-banner df-banner--warn">{{ loadError }}</div>

    <DigitalFormSuccess
      v-else-if="done"
      title="Thank you"
      body="Your reference has been submitted."
    />

    <form v-else-if="meta" class="ref-form" @submit.prevent="submit">
      <p v-if="meta.agencyName" class="eyebrow">{{ meta.agencyName }}</p>
      <h1 class="df-title">Professional reference</h1>
      <p class="df-subtitle">
        Regarding: <strong>{{ meta.candidateLabel }}</strong>
      </p>
      <p v-if="meta.referenceName" class="muted">
        Your name on file: <strong>{{ meta.referenceName }}</strong>
      </p>
      <div class="df-notice">
        <p class="df-notice-body">{{ meta.disclaimer }}</p>
      </div>
      <p v-if="meta.expiresAt" class="muted small">Link expires: {{ formatExp(meta.expiresAt) }}</p>

      <DigitalFormField
        v-model="form.referenceName"
        type="text"
        label="Your name (confirm or edit)"
        required
      />

      <DigitalFormField
        v-model="form.relationshipType"
        type="select"
        label="Relationship to candidate"
        required
        :options="relationshipOptions"
      />
      <DigitalFormField
        v-if="form.relationshipType === 'other'"
        v-model="form.relationshipOther"
        type="text"
        label="Describe relationship"
      />

      <DigitalFormField
        v-model="form.workedTogether"
        type="select"
        :label="`Did ${meta.candidateLabel} work with you in this capacity?`"
        required
        :options="yesNoOptions"
      />

      <DigitalFormField
        v-model="form.overallRating"
        type="select"
        label="Overall rating"
        required
        :options="ratingOptions"
      />

      <fieldset class="traits">
        <legend>Traits</legend>
        <div v-for="t in traitDefs" :key="t.key" class="trait-row">
          <span class="trait-label">{{ t.label }}</span>
          <select v-model="form.traits[t.key]" class="df-select" required>
            <option value="" disabled>—</option>
            <option value="strong">Strong</option>
            <option value="average">Average</option>
            <option value="weak">Weak</option>
          </select>
        </div>
      </fieldset>

      <DigitalFormField
        v-model="form.additionalComments"
        type="textarea"
        label="Anything else we should know? (optional)"
        :rows="3"
      />

      <DigitalFormField
        v-model="form.concernsLevel"
        type="select"
        label="Concerns"
        required
        :options="concernsOptions"
      />
      <DigitalFormField
        v-if="form.concernsLevel === 'yes' || form.concernsLevel === 'minor'"
        v-model="form.concernsComment"
        type="textarea"
        label="Comment (optional)"
        :rows="2"
      />

      <div v-if="submitError" class="df-banner df-banner--warn">{{ submitError }}</div>
      <div class="df-actions df-actions--end">
        <button type="submit" class="df-btn df-btn-primary" :disabled="submitting">
          {{ submitting ? 'Submitting…' : 'Submit reference' }}
        </button>
      </div>
    </form>
  </DigitalFormShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import {
  DigitalFormShell,
  DigitalFormField,
  DigitalFormSuccess
} from '../../components/digital-form';

const route = useRoute();
const token = computed(() => String(route.params.token || '').trim());

const loading = ref(true);
const loadError = ref('');
const meta = ref(null);
const formBranding = ref(null);
const submitError = ref('');
const submitting = ref(false);
const done = ref(false);

const progressSteps = [
  { id: 'form', label: 'Reference' },
  { id: 'done', label: 'Done' }
];
const progressIndex = computed(() => (done.value ? 1 : 0));

const traitDefs = [
  { key: 'reliability', label: 'Reliability' },
  { key: 'communication', label: 'Communication' },
  { key: 'workQuality', label: 'Work quality' },
  { key: 'teamwork', label: 'Teamwork' },
  { key: 'initiative', label: 'Initiative' }
];

const relationshipOptions = [
  { value: 'manager', label: 'Manager' },
  { value: 'coworker', label: 'Coworker' },
  { value: 'direct_report', label: 'Direct report' },
  { value: 'other', label: 'Other' }
];

const yesNoOptions = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' }
];

const ratingOptions = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'average', label: 'Average' },
  { value: 'below_average', label: 'Below average' },
  { value: 'would_not_recommend', label: 'Would not recommend' }
];

const concernsOptions = [
  { value: 'no', label: 'No concerns' },
  { value: 'minor', label: 'Minor concerns' },
  { value: 'yes', label: 'Yes — concerns' }
];

const form = reactive({
  referenceName: '',
  relationshipType: 'manager',
  relationshipOther: '',
  workedTogether: '',
  overallRating: '',
  traits: {
    reliability: '',
    communication: '',
    workQuality: '',
    teamwork: '',
    initiative: ''
  },
  additionalComments: '',
  concernsLevel: '',
  concernsComment: ''
});

const formatExp = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
};

onMounted(async () => {
  if (!token.value) {
    loadError.value = 'Invalid link.';
    loading.value = false;
    return;
  }
  try {
    const r = await api.get(`/public/hiring/reference/${encodeURIComponent(token.value)}`);
    meta.value = r.data;
    formBranding.value = r.data?.branding || null;
    form.referenceName = String(r.data?.referenceName || '').trim();
  } catch (e) {
    loadError.value = e.response?.data?.error?.message || 'Unable to load this reference form.';
  } finally {
    loading.value = false;
  }
});

const submit = async () => {
  submitError.value = '';
  if (form.relationshipType === 'other' && !String(form.relationshipOther || '').trim()) {
    submitError.value = 'Please describe the relationship when you select “Other”.';
    return;
  }
  submitting.value = true;
  try {
    await api.post(`/public/hiring/reference/${encodeURIComponent(token.value)}/submit`, {
      referenceName: String(form.referenceName || '').trim(),
      relationshipType: form.relationshipType,
      relationshipOther: form.relationshipType === 'other' ? String(form.relationshipOther || '').trim() : null,
      workedTogether: form.workedTogether,
      overallRating: form.overallRating,
      traits: { ...form.traits },
      additionalComments: String(form.additionalComments || '').trim() || null,
      concernsLevel: form.concernsLevel,
      concernsComment: String(form.concernsComment || '').trim() || null
    });
    done.value = true;
    meta.value = null;
  } catch (e) {
    submitError.value = e.response?.data?.error?.message || 'Submit failed.';
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.df-loading {
  padding: 2rem 0;
  color: var(--df-muted);
  text-align: center;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 12px;
  color: var(--df-muted);
  margin: 0 0 8px;
}
.muted {
  color: var(--df-muted);
  margin: 6px 0;
}
.muted.small {
  font-size: 13px;
}
.traits {
  border: 1px solid var(--df-border, #e5e7eb);
  border-radius: 8px;
  padding: 12px 14px 4px;
  margin: 16px 0;
}
.trait-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.trait-label {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
}
.trait-row .df-select {
  max-width: 160px;
}
</style>
