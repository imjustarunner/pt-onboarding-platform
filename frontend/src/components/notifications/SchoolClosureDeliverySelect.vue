<template>
  <label class="closure-delivery">
    <span>Send school closure reminders via</span>
    <select :value="delivery.mode" :disabled="disabled" aria-label="School closure reminder delivery" @change="$emit('change', $event.target.value)">
      <option v-for="option in delivery.options" :key="option.value" :value="option.value" :disabled="!option.available">{{ option.label }}{{ option.available ? '' : ' — setup required' }}</option>
    </select>
    <small>3 PM the previous weekday and 6 AM that morning, in calendar local time. Texts require notification consent and the text master switch.</small>
  </label>
</template>
<script setup>
defineProps({ delivery: { type: Object, required: true }, disabled: Boolean });
defineEmits(['change']);
</script>
<style scoped>
.closure-delivery { grid-column:2/-1; display:grid; gap:5px; min-width:0; padding:8px 0; }
.closure-delivery span,.closure-delivery small { font-size:12px; line-height:1.4; }
.closure-delivery select { width:100%; min-width:0; padding:8px; border:1px solid var(--border,#cbd5e1); border-radius:6px; background:var(--bg,#fff); color:inherit; }
@media(max-width:650px) { .closure-delivery { grid-column:1/-1; } }
</style>
