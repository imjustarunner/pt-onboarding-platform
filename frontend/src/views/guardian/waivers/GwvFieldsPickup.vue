<template>
  <div class="gwv-f">
    <div class="gwv-notice">
      <p>We cannot release your child to individuals who are not approved in writing and never to an individual under the age of 18.</p>
      <p>At any time you may update or submit additional individuals, though we request that you list any individuals whom you approve at the time of admission likely to be included to help our staff manage check out and release for these programs.</p>
    </div>
    <div v-for="(row, idx) in rows" :key="idx" class="gwv-grid">
      <input
        :value="row.name"
        class="input"
        type="text"
        placeholder="Full name"
        :disabled="disabled"
        @input="patchRow(idx, 'name', $event.target.value)"
      />
      <input
        :value="row.relationship"
        class="input"
        type="text"
        placeholder="Relationship"
        :disabled="disabled"
        @input="patchRow(idx, 'relationship', $event.target.value)"
      />
      <input
        :value="row.phone"
        class="input"
        type="tel"
        placeholder="Phone"
        :disabled="disabled"
        @input="patchRow(idx, 'phone', $event.target.value)"
      />
      <button
        v-if="rows.length > 1"
        type="button"
        class="btn btn-secondary btn-sm"
        :disabled="disabled"
        @click="removeRow(idx)"
      >
        Remove
      </button>
    </div>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="addRow">Add person</button>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  disabled: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);

const rows = computed(() =>
  (props.modelValue.authorizedPickups && props.modelValue.authorizedPickups.length
    ? props.modelValue.authorizedPickups
    : [{ name: '', relationship: '', phone: '' }])
);

function emitRows(next) {
  emit('update:modelValue', { ...props.modelValue, authorizedPickups: next });
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
.gwv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}
@media (max-width: 720px) {
  .gwv-grid {
    grid-template-columns: 1fr;
  }
}
</style>
