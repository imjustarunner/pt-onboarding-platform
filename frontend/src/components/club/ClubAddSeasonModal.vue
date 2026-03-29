<template>
  <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content modal-wide">
      <div class="modal-header">
        <h2>Add New Season</h2>
        <button type="button" class="btn-close" @click="$emit('close')" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="hint">Establish the terms of your next season (e.g., Winter Run '26, Winter Fit Club).</p>
        <form v-if="!success" @submit.prevent="submit" class="add-season-form">
          <div class="form-group">
            <label>Season name *</label>
            <input v-model="form.className" type="text" required placeholder="e.g., Winter Run '26, Winter Fit Club" class="form-input" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="form.description" rows="3" placeholder="Optional season description" class="form-input" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Status</label>
              <select v-model="form.status" class="form-input">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div class="form-group">
              <label>Start date</label>
              <input v-model="form.startsAt" type="datetime-local" class="form-input" />
            </div>
            <div class="form-group">
              <label>End date</label>
              <input v-model="form.endsAt" type="datetime-local" class="form-input" />
            </div>
          </div>
          <div class="form-group">
            <label>Activity types (comma-separated)</label>
            <input v-model="form.activityTypesText" type="text" placeholder="e.g., running, cycling, workout_session, steps" class="form-input" />
            <small>Leave blank for default options.</small>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Weekly goal minimum</label>
              <input v-model.number="form.weeklyGoalMinimum" type="number" min="0" placeholder="Optional" class="form-input" />
            </div>
            <div class="form-group">
              <label>Team min points/week</label>
              <input v-model.number="form.teamMinPointsPerWeek" type="number" min="0" placeholder="Optional" class="form-input" />
            </div>
            <div class="form-group">
              <label>Individual min points/week</label>
              <input v-model.number="form.individualMinPointsPerWeek" type="number" min="0" placeholder="Optional" class="form-input" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Master's age threshold (53+)</label>
              <input v-model.number="form.mastersAgeThreshold" type="number" min="40" max="99" placeholder="53" class="form-input" />
            </div>
            <div class="form-group form-group-wide">
              <label>Recognition categories</label>
              <div class="checkbox-group">
                <label><input v-model="form.recognitionCategories" type="checkbox" value="fastest_male" /> Fastest Male</label>
                <label><input v-model="form.recognitionCategories" type="checkbox" value="fastest_female" /> Fastest Female</label>
                <label><input v-model="form.recognitionCategories" type="checkbox" value="fastest_masters_male" /> Fastest Master's Male</label>
                <label><input v-model="form.recognitionCategories" type="checkbox" value="fastest_masters_female" /> Fastest Master's Female</label>
              </div>
            </div>
          </div>
          <div v-if="error" class="error-msg">{{ error }}</div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="$emit('close')">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving || !form.className.trim()">
              {{ saving ? 'Creating…' : 'Create Season' }}
            </button>
          </div>
        </form>
        <div v-else class="success-msg">
          <p>{{ successMessage }}</p>
          <button type="button" class="btn btn-primary" @click="handleDone">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  clubId: { type: [Number, String], default: null }
});

const emit = defineEmits(['close', 'created']);

const form = ref({
  className: '',
  description: '',
  status: 'draft',
  startsAt: '',
  endsAt: '',
  activityTypesText: '',
  weeklyGoalMinimum: null,
  teamMinPointsPerWeek: null,
  individualMinPointsPerWeek: null,
  mastersAgeThreshold: 53,
  recognitionCategories: []
});

const saving = ref(false);
const error = ref('');
const success = ref(false);
const successMessage = ref('');

watch(() => props.open, (open) => {
  if (!open) {
    form.value = {
      className: '',
      description: '',
      status: 'draft',
      startsAt: '',
      endsAt: '',
      activityTypesText: '',
      weeklyGoalMinimum: null,
      teamMinPointsPerWeek: null,
      individualMinPointsPerWeek: null,
      mastersAgeThreshold: 53,
      recognitionCategories: []
    };
    error.value = '';
    success.value = false;
    successMessage.value = '';
  }
});

const submit = async () => {
  if (!props.clubId) return;
  saving.value = true;
  error.value = '';
  try {
    const atText = String(form.value.activityTypesText || '').trim();
    let activityTypesJson = null;
    if (atText) {
      const arr = atText.split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length) activityTypesJson = arr;
    }
    const startsAt = form.value.startsAt ? new Date(form.value.startsAt).toISOString() : null;
    const endsAt = form.value.endsAt ? new Date(form.value.endsAt).toISOString() : null;
    const payload = {
      organizationId: Number(props.clubId),
      className: String(form.value.className || '').trim(),
      description: form.value.description || null,
      status: form.value.status,
      startsAt,
      endsAt,
      activityTypesJson,
      weeklyGoalMinimum: form.value.weeklyGoalMinimum ?? null,
      teamMinPointsPerWeek: form.value.teamMinPointsPerWeek ?? null,
      individualMinPointsPerWeek: form.value.individualMinPointsPerWeek ?? null,
      mastersAgeThreshold: form.value.mastersAgeThreshold ?? 53,
      recognitionCategoriesJson: form.value.recognitionCategories?.length ? form.value.recognitionCategories : null
    };
    const r = await api.post('/learning-program-classes', payload, { skipGlobalLoading: true });
    success.value = true;
    successMessage.value = `"${form.value.className}" has been created. You can add teams and participants from Season Management.`;
    emit('created');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to create season';
  } finally {
    saving.value = false;
  }
};

const handleDone = () => {
  emit('close');
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1400;
}

.modal-content {
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  width: 96%;
  max-width: 520px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-content.modal-wide {
  max-width: 640px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 20px;
  overflow: auto;
}

.hint {
  margin: 0 0 20px 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.add-season-form .form-group {
  margin-bottom: 16px;
}

.add-season-form .form-group-wide {
  flex: 1;
}

.add-season-form label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 14px;
}

.form-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.form-row .form-group {
  flex: 1;
  min-width: 140px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}

.add-season-form small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  cursor: pointer;
}

.error-msg {
  color: #b91c1c;
  font-size: 13px;
  margin-bottom: 12px;
}

.success-msg {
  text-align: center;
}

.success-msg p {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
</style>
