<template>
  <div class="work-email-picker">
    <label>Preferred address
      <select :value="selected" :disabled="disabled" required @change="choose($event.target.value)">
        <option disabled value="">Select an address</option>
        <option v-for="choice in choices" :key="choice.email" :value="choice.email">{{ choice.email }}</option>
        <option value="__custom__">Use a custom address…</option>
      </select>
    </label>
    <label v-if="selected === '__custom__'">Custom work email
      <input :value="customEmail" type="email" :placeholder="domain ? `name@${domain}` : 'Your work email'" :disabled="disabled" required autocomplete="off" maxlength="254" @input="updateCustom($event.target.value)" />
    </label>
    <p v-if="selected === '__custom__'">{{ domain ? `Use @${domain}. ` : '' }}We check availability when you save.</p>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
const props = defineProps({ modelValue: { type: String, default: '' }, choices: { type: Array, default: () => [] }, domain: String, disabled: Boolean });
const emit = defineEmits(['update:modelValue']);
const customMode = ref(false), customEmail = ref('');
const suggested = computed(() => props.choices.some(choice => choice.email === props.modelValue));
const selected = computed(() => customMode.value || (props.modelValue && !suggested.value) ? '__custom__' : props.modelValue);
watch(() => props.modelValue, value => { if (value && !suggested.value) customEmail.value = value; }, { immediate: true });
function choose(value) {
  customMode.value = value === '__custom__';
  emit('update:modelValue', customMode.value ? customEmail.value : value);
}
function updateCustom(value) { customEmail.value = value; emit('update:modelValue', value); }
</script>
<style scoped>
.work-email-picker{display:grid;gap:12px}.work-email-picker label{display:grid;gap:6px}.work-email-picker select,.work-email-picker input{font:inherit;width:100%;padding:12px;border:1px solid #bdccc6;border-radius:6px;box-sizing:border-box}.work-email-picker p{font-size:13px;margin:0;color:#536b64}
</style>
