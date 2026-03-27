<template>
  <div class="gwv-f">
    <label class="gwv-optout">
      <input
        type="checkbox"
        :checked="declineEmergencyContacts"
        :disabled="disabled"
        @change="toggleDeclineEmergency($event.target.checked)"
      />
      <span>I do not want to list emergency contacts at this time.</span>
    </label>
    <div v-for="(row, idx) in rows" :key="idx" class="gwv-grid">
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
        type="tel"
        placeholder="Phone"
        :disabled="disabled || declineEmergencyContacts"
        @input="patchRow(idx, 'phone', $event.target.value)"
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
    <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled || declineEmergencyContacts" @click="addRow">Add contact</button>
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
  props.modelValue.contacts && props.modelValue.contacts.length
    ? props.modelValue.contacts
    : [{ name: '', phone: '', relationship: '' }]
);
const declineEmergencyContacts = computed(() => !!props.modelValue.declineEmergencyContacts);

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
