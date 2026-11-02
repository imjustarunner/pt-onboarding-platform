<template>
  <div v-if="missing.length" ref="panel" class="required-fields" role="alert">
    <strong>Complete these required fields:</strong>
    <ul>
      <li v-for="field in missing" :key="field.key">
        <button type="button" @click="focusField(field.key)">{{ field.label }}</button>
      </li>
    </ul>
    <p v-if="missing.some(field => field.key === 'times')">Choose a time option or add a specific time range. Scheduling notes alone do not set the client's availability.</p>
  </div>
</template>
<script setup>
import { ref } from 'vue';
const props = defineProps({ missing: { type: Array, default: () => [] } });
const panel = ref(null);
function focusField(key) {
  const field = panel.value?.closest('[data-exchange-form]')?.querySelector(`[data-exchange-field="${key}"]`);
  field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  const control = field?.matches('input,select,textarea') ? field : field?.querySelector('input,select,textarea');
  control?.focus({ preventScroll: true });
}
defineExpose({ focusFirst: () => focusField(props.missing[0]?.key) });
</script>
<style scoped>
.required-fields { border: 1px solid #dc2626; border-radius: 8px; background: #fff1f2; color: #991b1b; padding: 14px; }
ul { margin: 8px 0; padding-left: 22px; }
button { padding: 4px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; text-decoration: underline; cursor: pointer; }
p { margin: 8px 0 0; font-size: 14px; line-height: 1.5; }
</style>
