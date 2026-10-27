<template>
  <label class="travel-location">{{ label }}
    <select :aria-label="label" :value="modelValue.kind" @change="emit('update:modelValue', { kind: $event.target.value })">
      <option value="home">Home</option><option value="office">Assigned office</option>
      <option value="school">School / client worksite</option><option value="other">Another location</option>
    </select>
    <select v-if="modelValue.kind === 'school'" aria-label="School" required :value="modelValue.id || ''" @change="emit('update:modelValue', { kind: 'school', id: Number($event.target.value) })">
      <option value="" disabled>Choose your school</option><option v-for="school in schools" :key="school.id" :value="school.id">{{ school.name }}</option>
    </select>
    <input v-if="modelValue.kind === 'other'" aria-label="Other location address" required maxlength="500" placeholder="Street address, city, state, ZIP" :value="modelValue.address || ''" @input="emit('update:modelValue', { kind: 'other', address: $event.target.value })" />
    <span v-else class="saved-address">{{ savedAddress || (modelValue.kind === 'home' ? 'Add your home address in your payroll profile before submitting.' : 'Select a location with a saved address.') }}</span>
  </label>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ modelValue: { type: Object, required: true }, label: { type: String, required: true }, schools: { type: Array, default: () => [] }, homeAddress: { type: String, default: '' }, officeAddress: { type: String, default: '' } });
const savedAddress = computed(() => props.modelValue.kind === 'home' ? props.homeAddress : props.modelValue.kind === 'office' ? props.officeAddress : props.schools.find(s => s.id === props.modelValue.id)?.address);
const emit = defineEmits(['update:modelValue']);
</script>
<style scoped>
.travel-location { display: grid; gap: 8px; font-weight: 600; }
.saved-address { font-weight: 400; font-size: 14px; line-height: 1.5; color: var(--text-secondary, #475569); overflow-wrap: anywhere; }
select, input { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 7px; background: var(--bg-primary, white); color: inherit; font: inherit; font-weight: 400; box-sizing: border-box; }
</style>
