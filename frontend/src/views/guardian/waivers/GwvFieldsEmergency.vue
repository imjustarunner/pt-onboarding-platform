<template>
  <div class="gwv-f">
    <label class="gwv-optout" :class="{ 'gwv-optout--pulse': pulse }">
      <input
        type="checkbox"
        :checked="declineEmergencyContacts"
        :disabled="disabled"
        @change="toggleDeclineEmergency($event.target.checked)"
      />
      <span>I do not want to list emergency contacts at this time.</span>
    </label>
    <div v-for="(row, idx) in rows" :key="idx" class="gwv-row-block">
      <div class="gwv-grid">
        <input
          :value="row.name"
          class="input"
          type="text"
          placeholder="Name"
          :disabled="disabled || declineEmergencyContacts"
          @input="patchRow(idx, 'name', $event.target.value)"
        />
        <input
          :value="row.phone"
          class="input"
          :class="{ 'input-error': phoneInvalid(row, idx) }"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="Phone * (10 digits)"
          :disabled="disabled || declineEmergencyContacts"
          :aria-required="!declineEmergencyContacts"
          @input="patchRow(idx, 'phone', $event.target.value)"
          @blur="markTouched(idx)"
        />
        <input
          :value="row.relationship"
          class="input"
          type="text"
          placeholder="Relationship"
          :disabled="disabled || declineEmergencyContacts"
          @input="patchRow(idx, 'relationship', $event.target.value)"
        />
        <button
          v-if="rows.length > 1"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="disabled || declineEmergencyContacts"
          @click="removeRow(idx)"
        >
          Remove
        </button>
      </div>
      <div v-if="phoneInvalid(row, idx)" class="gwv-row-err">
        Please enter a real 10-digit phone number for {{ String(row.name || '').trim() || 'this contact' }}
        (we'll need to call them in an emergency).
      </div>
    </div>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled || declineEmergencyContacts" @click="addRow">Add contact</button>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  pulse: { type: Boolean, default: false },
  /**
   * Either a string (top-level error message) or an object whose presence
   * means "the parent already tried to advance and at least one row is bad".
   * When the parent step is in this state we surface phone errors on every
   * row that has ANY content, regardless of whether the user blurred it
   * yet — otherwise the phone field would silently pass when the parent
   * never blurred it (which is exactly the "78899902" bug).
   */
  validationError: { type: [String, Object], default: '' }
});
const emit = defineEmits(['update:modelValue']);

const rows = computed(() =>
  props.modelValue.contacts && props.modelValue.contacts.length
    ? props.modelValue.contacts
    : [{ name: '', phone: '', relationship: '' }]
);
const declineEmergencyContacts = computed(() => !!props.modelValue.declineEmergencyContacts);

// Track which rows the user has interacted with so we don't yell about
// missing phone digits the moment the form renders. Once the parent submits
// (validationError prop becomes truthy), we treat every row as touched so
// the phone field with content shows its error inline next to the value.
const touched = reactive(new Set());
function markTouched(idx) { touched.add(idx); }
watch(
  () => !!props.validationError,
  (errored) => { if (errored) rows.value.forEach((_, i) => touched.add(i)); }
);

function digitsOnly(v) {
  return String(v ?? '').replace(/\D+/g, '');
}

/**
 * A US-style number must be 10 digits (or 11 starting with 1).
 * "78899902" is 8 digits — that fails this check.
 */
function isValidPhone(v) {
  const d = digitsOnly(v);
  if (d.length === 10) return true;
  if (d.length === 11 && d.startsWith('1')) return true;
  return false;
}

function phoneInvalid(row, idx) {
  if (declineEmergencyContacts.value) return false;
  const phone = String(row?.phone ?? '');
  const hasAnyEntry = [row?.name, row?.phone, row?.relationship]
    .some((v) => String(v ?? '').trim().length > 0);
  if (!hasAnyEntry) return false;
  if (!touched.has(idx) && !props.validationError) return false;
  return !isValidPhone(phone);
}

function emitRows(next) {
  emit('update:modelValue', { ...props.modelValue, contacts: next });
}

function toggleDeclineEmergency(checked) {
  emit('update:modelValue', {
    ...props.modelValue,
    declineEmergencyContacts: !!checked,
    contacts: [{ name: '', phone: '', relationship: '' }]
  });
}

function patchRow(idx, field, value) {
  const base = rows.value.map((r) => ({ ...r }));
  base[idx] = { ...base[idx], [field]: value };
  emitRows(base);
}

function addRow() {
  emitRows([...rows.value.map((r) => ({ ...r })), { name: '', phone: '', relationship: '' }]);
}

function removeRow(i) {
  const next = rows.value.filter((_, j) => j !== i);
  emitRows(next.length ? next.map((r) => ({ ...r })) : [{ name: '', phone: '', relationship: '' }]);
}
</script>

<style scoped>
.gwv-f {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gwv-row-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gwv-row-err {
  font-size: 12.5px;
  color: #b91c1c;
  background: #fee2e2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 4px 8px;
}
.input-error {
  border-color: #dc2626 !important;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
}
.gwv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}
.gwv-optout {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  border-radius: 6px;
  padding: 4px 6px;
  transition: box-shadow 0.2s;
}
.gwv-optout--pulse {
  animation: emergencyOptOutPulse 0.55s ease-in-out 0s 4 alternate;
}
@keyframes emergencyOptOutPulse {
  0%   { box-shadow: 0 0 0 0px rgba(234, 137, 12, 0); background: transparent; }
  100% { box-shadow: 0 0 0 5px rgba(234, 137, 12, 0.45); background: rgba(234, 137, 12, 0.08); }
}
@media (max-width: 720px) {
  .gwv-grid {
    grid-template-columns: 1fr;
  }
}
</style>
