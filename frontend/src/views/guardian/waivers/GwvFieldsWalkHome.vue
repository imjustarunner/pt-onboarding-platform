<template>
  <div class="gwv-f">
    <div class="gwv-notice">
      <p>
        We do not release children to walk home alone unless a parent or legal guardian has explicitly
        authorized it in writing for this program. By signing this section, you assume responsibility
        for your child's transportation home and agree that program staff are released from supervisory
        duty as soon as your child leaves the program at the time(s) below.
      </p>
      <p class="muted small">
        If you do <strong>not</strong> want your child to walk home alone, leave this section
        un-authorized and complete the Pickup authorization section instead.
      </p>
    </div>

    <label class="gwv-radio-row">
      <input
        type="radio"
        name="walk-home-allowed"
        :checked="allowedToWalkHome === false"
        :disabled="disabled"
        @change="setAllowed(false)"
      />
      <span><strong>I do NOT authorize</strong> my child to walk home alone from this program. (Use the Pickup authorization section.)</span>
    </label>
    <label class="gwv-radio-row">
      <input
        type="radio"
        name="walk-home-allowed"
        :checked="allowedToWalkHome === true"
        :disabled="disabled"
        @change="setAllowed(true)"
      />
      <span><strong>I authorize</strong> my child to walk home alone after this program ends.</span>
    </label>

    <div v-if="allowedToWalkHome === true" class="gwv-walk-details">
      <div v-if="validationError && typeof validationError === 'object'" class="gwv-walk-error-banner">
        Please complete the highlighted fields below.
      </div>
      <div v-else-if="validationError && typeof validationError === 'string'" class="gwv-walk-error-banner">
        {{ validationError }}
      </div>

      <label class="gwv-walk-lbl">Approved release window <span class="req">*</span></label>
      <input
        :value="modelValue.allowedWindow || ''"
        class="input"
        :class="{ 'input-error': fieldError('allowedWindow') }"
        type="text"
        placeholder="e.g. Monday–Friday after 3:30 pm"
        :disabled="disabled"
        @input="patch('allowedWindow', $event.target.value)"
      />
      <div v-if="fieldError('allowedWindow')" class="gwv-walk-field-err">{{ fieldError('allowedWindow') }}</div>

      <label class="gwv-walk-lbl">Route or destination <span class="muted small">(optional but recommended)</span></label>
      <input
        :value="modelValue.route || ''"
        class="input"
        type="text"
        placeholder="e.g. Walks west on Main St to home — about 4 blocks"
        :disabled="disabled"
        @input="patch('route', $event.target.value)"
      />

      <label class="gwv-walk-lbl">Conditions (weather, daylight, escort by older sibling, etc.)</label>
      <textarea
        :value="modelValue.conditions || ''"
        class="input gwv-walk-textarea"
        rows="2"
        placeholder="Optional — note any conditions under which your child should NOT walk home (we'll call you instead)."
        :disabled="disabled"
        @input="patch('conditions', $event.target.value)"
      />

      <label class="gwv-walk-attest" :class="{ 'gwv-walk-attest--err': fieldError('attestation') }">
        <input
          type="checkbox"
          :checked="!!modelValue.attestation"
          :disabled="disabled"
          @change="patch('attestation', !!$event.target.checked)"
        />
        <span>
          I confirm I am the parent or legal guardian and I assume responsibility for my child once
          they are released to walk home at the time(s) above. I understand program staff are
          released from supervisory duty at that point.
        </span>
      </label>
      <div v-if="fieldError('attestation')" class="gwv-walk-field-err">{{ fieldError('attestation') }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  /** Either a string error or { allowedWindow, attestation } per-field map */
  validationError: { type: [String, Object], default: '' }
});
const emit = defineEmits(['update:modelValue']);

const allowedToWalkHome = computed(() => {
  const v = props.modelValue?.allowedToWalkHome;
  if (v === true) return true;
  if (v === false) return false;
  return null;
});

function emitNext(next) {
  emit('update:modelValue', { ...(props.modelValue || {}), ...next });
}

function setAllowed(val) {
  if (props.disabled) return;
  if (val === false) {
    // Reset detail fields when explicitly declined so a stale window/route
    // doesn't surface in the PDF or kiosk if the parent flips back to "no".
    emitNext({
      allowedToWalkHome: false,
      allowedWindow: '',
      route: '',
      conditions: '',
      attestation: false
    });
  } else {
    emitNext({ allowedToWalkHome: true });
  }
}

function patch(field, value) {
  if (props.disabled) return;
  emitNext({ [field]: value });
}

function fieldError(name) {
  const v = props.validationError;
  if (!v) return '';
  if (typeof v === 'object') return v[name] || '';
  return '';
}
</script>

<style scoped>
.gwv-f {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gwv-notice {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.55;
  color: #7c2d12;
}
.gwv-notice p {
  margin: 0 0 8px;
}
.gwv-notice p:last-child {
  margin-bottom: 0;
}
.gwv-radio-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.gwv-radio-row input[type="radio"] {
  margin-top: 3px;
}
.gwv-walk-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px dashed #fbbf24;
  background: #fffbeb;
  border-radius: 10px;
}
.gwv-walk-lbl {
  font-size: 13px;
  font-weight: 600;
  margin-top: 4px;
}
.gwv-walk-textarea {
  resize: vertical;
}
.gwv-walk-attest {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 13.5px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(251, 191, 36, 0.12);
}
.gwv-walk-attest--err {
  outline: 2px solid #dc2626;
}
.gwv-walk-error-banner {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
}
.gwv-walk-field-err {
  font-size: 12.5px;
  color: #b91c1c;
  margin-top: -2px;
}
.input-error {
  border-color: #dc2626 !important;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
}
.muted { color: #64748b; }
.small { font-size: 12px; }
.req { color: #dc2626; font-weight: 600; }
</style>
