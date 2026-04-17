<template>
  <div class="ref-root">
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="loadError" class="error-banner">{{ loadError }}</div>
    <form v-else-if="meta" class="ref-card" @submit.prevent="submit">
      <p v-if="meta.agencyName" class="eyebrow">{{ meta.agencyName }}</p>
      <h1>Professional reference</h1>
      <p class="muted">Regarding: <strong>{{ meta.candidateLabel }}</strong></p>
      <p v-if="meta.referenceName" class="muted">Your name on file: <strong>{{ meta.referenceName }}</strong></p>
      <p class="disclaimer">{{ meta.disclaimer }}</p>
      <p v-if="meta.expiresAt" class="muted small">Link expires: {{ formatExp(meta.expiresAt) }}</p>

      <div class="form-group">
        <label>Your name (confirm or edit)</label>
        <input v-model="form.referenceName" type="text" required maxlength="255" class="input" />
      </div>

      <div class="form-group">
        <label>Relationship to candidate</label>
        <select v-model="form.relationshipType" class="input" required>
          <option value="manager">Manager</option>
          <option value="coworker">Coworker</option>
          <option value="direct_report">Direct report</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div v-if="form.relationshipType === 'other'" class="form-group">
        <label>Describe relationship</label>
        <input v-model="form.relationshipOther" type="text" class="input" maxlength="500" />
      </div>

      <div class="form-group">
        <label>Did {{ meta.candidateLabel }} work with you in this capacity?</label>
        <select v-model="form.workedTogether" class="input" required>
          <option value="" disabled>Select…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>

      <div class="form-group">
        <label>Overall rating</label>
        <select v-model="form.overallRating" class="input" required>
          <option value="" disabled>Select…</option>
          <option value="excellent">Excellent</option>
          <option value="good">Good</option>
          <option value="average">Average</option>
          <option value="below_average">Below average</option>
          <option value="would_not_recommend">Would not recommend</option>
        </select>
      </div>

      <fieldset class="traits">
        <legend>Traits</legend>
        <div v-for="t in traitDefs" :key="t.key" class="form-group trait-row">
          <span class="trait-label">{{ t.label }}</span>
          <select v-model="form.traits[t.key]" class="input" required>
            <option value="" disabled>—</option>
            <option value="strong">Strong</option>
            <option value="average">Average</option>
            <option value="weak">Weak</option>
          </select>
        </div>
      </fieldset>

      <div class="form-group">
        <label>Anything else we should know? (optional)</label>
        <textarea v-model="form.additionalComments" class="textarea" rows="3" maxlength="8000" />
      </div>

      <div class="form-group">
        <label>Concerns</label>
        <select v-model="form.concernsLevel" class="input" required>
          <option value="" disabled>Select…</option>
          <option value="no">No concerns</option>
          <option value="minor">Minor concerns</option>
          <option value="yes">Yes — concerns</option>
        </select>
      </div>
      <div v-if="form.concernsLevel === 'yes' || form.concernsLevel === 'minor'" class="form-group">
        <label>Comment (optional)</label>
        <textarea v-model="form.concernsComment" class="textarea" rows="2" maxlength="4000" />
      </div>

      <div v-if="submitError" class="error-banner">{{ submitError }}</div>
      <button type="submit" class="btn btn-primary" :disabled="submitting">
        {{ submitting ? 'Submitting…' : 'Submit reference' }}
      </button>
    </form>

    <div v-if="done" class="ref-card success">
      <h2>Thank you</h2>
      <p>Your reference has been submitted.</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const token = computed(() => String(route.params.token || '').trim());

const loading = ref(true);
const loadError = ref('');
const meta = ref(null);
const submitError = ref('');
const submitting = ref(false);
const done = ref(false);

const traitDefs = [
  { key: 'reliability', label: 'Reliability' },
  { key: 'communication', label: 'Communication' },
  { key: 'workQuality', label: 'Work quality' },
  { key: 'teamwork', label: 'Teamwork' },
  { key: 'initiative', label: 'Initiative' }
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
.ref-root {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.ref-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px 20px 24px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}
.ref-card.success {
  text-align: center;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 12px;
  color: #6b7280;
  margin: 0 0 8px;
}
h1 {
  font-size: 1.35rem;
  margin: 0 0 12px;
}
.muted {
  color: #4b5563;
  margin: 6px 0;
}
.muted.small {
  font-size: 13px;
}
.disclaimer {
  font-size: 13px;
  color: #374151;
  background: #f9fafb;
  border-left: 3px solid #9ca3af;
  padding: 10px 12px;
  margin: 16px 0;
}
.form-group {
  margin-bottom: 14px;
}
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.input,
.textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 15px;
}
.traits {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 14px 4px;
  margin: 16px 0;
}
.trait-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.trait-label {
  flex: 1;
  font-size: 14px;
}
.trait-row .input {
  max-width: 160px;
}
.btn {
  margin-top: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 15px;
}
.btn-primary {
  background: #2563eb;
  color: #fff;
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error-banner {
  background: #fef2f2;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 8px 0;
}
</style>
