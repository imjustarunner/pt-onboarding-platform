<template>
  <div v-if="open" class="modal-overlay" @click.self>
    <div class="modal-card">
      <h2>Accept Season Participation Agreement</h2>
      <p class="modal-lead">
        {{ challengeName || 'This season' }} requires a recorded acceptance before you can log workouts or post in the season.
      </p>

      <div class="agreement-block">
        <strong>{{ agreement?.label || 'Season Guidelines' }}</strong>
        <p v-if="agreement?.introText" class="agreement-intro">{{ agreement.introText }}</p>
        <ul v-if="agreement?.items?.length" class="agreement-list">
          <li v-for="item in agreement.items" :key="item">{{ item }}</li>
        </ul>
      </div>

      <div class="form-group">
        <label>Typed full name</label>
        <input v-model="signatureName" type="text" placeholder="Type your full name" />
      </div>
      <label class="checkbox-row">
        <input v-model="accepted" type="checkbox" />
        <span>I have read this season agreement and agree to participate under these rules.</span>
      </label>

      <div v-if="error" class="error-inline">{{ error }}</div>

      <div class="form-actions">
        <button class="btn btn-primary" :disabled="submitting || !accepted || !signatureName.trim()" @click="submit">
          {{ submitting ? 'Saving…' : 'Agree & Continue' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  challengeName: { type: String, default: '' },
  agreement: { type: Object, default: null },
  defaultSignatureName: { type: String, default: '' },
  submitting: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const emit = defineEmits(['submit']);

const signatureName = ref('');
const accepted = ref(false);

watch(
  () => [props.open, props.defaultSignatureName],
  () => {
    signatureName.value = props.defaultSignatureName || '';
    accepted.value = false;
  },
  { immediate: true }
);

const submit = () => {
  emit('submit', {
    accepted: true,
    signatureName: signatureName.value.trim()
  });
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1600;
}

.modal-card {
  width: min(680px, 100%);
  max-height: 90vh;
  overflow: auto;
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-color, #dbe2ea);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
  padding: 22px;
}

.modal-card h2 {
  margin: 0 0 8px;
}

.modal-lead {
  margin: 0 0 16px;
  color: var(--text-muted, #64748b);
  line-height: 1.5;
}

.agreement-block {
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid var(--border-color, #dbe2ea);
  border-radius: 12px;
  background: #f8fafc;
}

.agreement-intro {
  margin: 8px 0 10px;
  line-height: 1.5;
  color: var(--text-primary, #1f2937);
}

.agreement-list {
  margin: 0 0 0 18px;
  padding: 0;
}

.agreement-list li {
  margin-bottom: 6px;
  line-height: 1.45;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 600;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #cbd5e1);
}

.checkbox-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.checkbox-row input {
  margin-top: 3px;
}

.error-inline {
  margin-bottom: 12px;
  color: #b91c1c;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
