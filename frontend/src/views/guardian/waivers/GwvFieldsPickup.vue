<template>
  <div class="gwv-f">
    <div class="gwv-notice">
      <p>{{ tx('We cannot release your child to individuals who are not approved in writing and never to an individual under the age of 18.') }}</p>
      <p>{{ tx('At any time you may update or submit additional individuals, though we request that you list any individuals whom you approve at the time of admission likely to be included to help our staff manage check out and release for these programs.') }}</p>
    </div>
    <label class="gwv-optout">
      <input
        type="checkbox"
        :checked="declinePickupAuthorization"
        :disabled="disabled"
        @change="toggleDeclinePickup($event.target.checked)"
      />
      <span>{{ tx('I do not want to list additional pickup contacts at this time.') }}</span>
    </label>
    <div v-for="(row, idx) in rows" :key="idx" class="gwv-row-block">
      <div class="gwv-grid">
        <input
          :value="row.name"
          class="input"
          type="text"
          :placeholder="tx('Full name')"
          :disabled="disabled || declinePickupAuthorization"
          @input="patchRow(idx, 'name', $event.target.value)"
        />
        <input
          :value="row.relationship"
          class="input"
          type="text"
          :placeholder="tx('Relationship')"
          :disabled="disabled || declinePickupAuthorization"
          @input="patchRow(idx, 'relationship', $event.target.value)"
        />
        <input
          :value="row.phone"
          class="input"
          :class="{ 'input-error': phoneInvalid(row, idx) }"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          :placeholder="tx('Phone (10 digits)')"
          :disabled="disabled || declinePickupAuthorization"
          @input="patchRow(idx, 'phone', $event.target.value)"
          @blur="markTouched(idx)"
        />
        <button
          v-if="rows.length > 1"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="disabled || declinePickupAuthorization"
          @click="removeRow(idx)"
        >
          {{ tx('Remove') }}
        </button>
      </div>
      <div v-if="phoneInvalid(row, idx)" class="gwv-row-err">
        {{ txFmt('Please enter a real 10-digit phone number for {contact} (we\'ll need to call them at check-out time).', {
          contact: String(row.name || '').trim() || tx('this pickup contact')
        }) }}
      </div>
    </div>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled || declinePickupAuthorization" @click="addRow">{{ tx('Add person') }}</button>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';
import { useIntakeStepTx } from '../../../composables/useIntakeStepTx.js';

const { tx, txFmt } = useIntakeStepTx();

const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  validationError: { type: [String, Object], default: '' }
});
const emit = defineEmits(['update:modelValue']);

const rows = computed(() =>
  (props.modelValue.authorizedPickups && props.modelValue.authorizedPickups.length
    ? props.modelValue.authorizedPickups
    : [{ name: '', relationship: '', phone: '' }])
);
const declinePickupAuthorization = computed(() => !!props.modelValue.declinePickupAuthorization);

const touched = reactive(new Set());
function markTouched(idx) { touched.add(idx); }
watch(
  () => !!props.validationError,
  (errored) => { if (errored) rows.value.forEach((_, i) => touched.add(i)); }
);

function digitsOnly(v) { return String(v ?? '').replace(/\D+/g, ''); }
function isValidPhone(v) {
  const d = digitsOnly(v);
  return d.length === 10 || (d.length === 11 && d.startsWith('1'));
}
function phoneInvalid(row, idx) {
  if (declinePickupAuthorization.value) return false;
  const hasAnyEntry = [row?.name, row?.phone, row?.relationship]
    .some((v) => String(v ?? '').trim().length > 0);
  if (!hasAnyEntry) return false;
  if (!touched.has(idx) && !props.validationError) return false;
  return !isValidPhone(row?.phone);
}

function emitRows(next) {
  emit('update:modelValue', { ...props.modelValue, authorizedPickups: next });
}

function toggleDeclinePickup(checked) {
  emit('update:modelValue', {
    ...props.modelValue,
    declinePickupAuthorization: !!checked,
    authorizedPickups: [{ name: '', relationship: '', phone: '' }]
  });
}

function patchRow(idx, field, value) {
  const base = rows.value.map((r) => ({ ...r }));
  base[idx] = { ...base[idx], [field]: value };
  emitRows(base);
}

function addRow() {
  emitRows([...rows.value.map((r) => ({ ...r })), { name: '', relationship: '', phone: '' }]);
}

function removeRow(i) {
  const next = rows.value.filter((_, j) => j !== i);
  emitRows(next.length ? next.map((r) => ({ ...r })) : [{ name: '', relationship: '', phone: '' }]);
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
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary, #475569);
}
.gwv-notice p {
  margin: 0 0 8px;
}
.gwv-notice p:last-child {
  margin-bottom: 0;
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
}
@media (max-width: 720px) {
  .gwv-grid {
    grid-template-columns: 1fr;
  }
}
</style>
