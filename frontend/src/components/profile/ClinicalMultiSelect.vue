<template>
  <fieldset class="clinical-choices" :disabled="disabled">
    <legend>{{ label }}</legend>
    <p v-if="description" class="description">{{ description }}</p>
    <p class="selection-count" aria-live="polite">{{ modelValue.length }} selected<span v-if="!readonly"> · Select all that apply.</span></p>
    <ul v-if="modelValue.length" class="selected-values" :aria-label="`Selected ${label}`">
      <li v-for="value in modelValue" :key="value">
        <span>{{ value }}</span><button v-if="!readonly" type="button" :aria-label="`Remove ${value}`" @click="toggle(value)">×</button>
      </li>
    </ul>
    <p v-else-if="readonly">No selections.</p>
    <template v-if="!readonly">
      <label class="search">Search {{ label.toLowerCase() }}<input v-model="query" type="search" :placeholder="`Search ${label.toLowerCase()}…`" /></label>
      <div class="options">
        <label v-for="option in filteredOptions" :key="option" class="choice" :class="{ checked: modelValue.includes(option) }">
          <input type="checkbox" :checked="modelValue.includes(option)" @change="toggle(option)" /><span>{{ option }}</span>
        </label>
      </div>
      <p v-if="!filteredOptions.length" role="status">No matches. Try another search; your selections are still saved in this form.</p>
    </template>
  </fieldset>
</template>
<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ modelValue: { type: Array, default: () => [] }, options: { type: Array, default: () => [] }, label: { type: String, required: true }, description: String, disabled: Boolean, readonly: Boolean });
const emit = defineEmits(['update:modelValue']);
const query = ref('');
const filteredOptions = computed(() => [...new Set(props.options)].filter(option => option.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())));
function toggle(value) {
  if (props.disabled || props.readonly) return;
  emit('update:modelValue', props.modelValue.includes(value) ? props.modelValue.filter(v => v !== value) : [...props.modelValue, value]);
}
</script>
<style scoped>
.clinical-choices { min-width:0; margin:0; padding:20px; border:1px solid #d3dfdc; border-radius:12px; background:#fff; color:#233b42; }
legend { padding:0 6px; font-size:1.15rem; font-weight:700; }
.description { margin:0 0 8px; color:#526577; }
.selection-count { margin:8px 0; font-size:.9rem; color:#526577; }
.selected-values { display:flex; flex-wrap:wrap; gap:6px; list-style:none; margin:10px 0 16px; padding:0; }
.selected-values li { display:flex; align-items:center; gap:6px; max-width:100%; overflow-wrap:anywhere; background:#eaf4f0; color:#164f40; border-radius:8px; padding:4px 8px; font-size:.88rem; }
.selected-values button { flex-shrink:0; border:0; background:transparent; color:inherit; min-width:30px; min-height:32px; font-size:1.3rem; cursor:pointer; }
.search { display:grid; gap:6px; font-size:.9rem; margin:12px 0; }
.search input { width:100%; min-width:0; box-sizing:border-box; border:1px solid #adbfc1; border-radius:8px; padding:11px 12px; font:inherit; background:#fff; color:#233b42; }
.options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; max-height:300px; overflow:auto; padding:4px; scrollbar-gutter:stable; }
.choice { display:flex; align-items:flex-start; gap:10px; margin:0; padding:10px; border:1px solid #e3e9e7; border-radius:8px; cursor:pointer; overflow-wrap:anywhere; font-size:.92rem; line-height:1.4; }
.choice.checked { background:#f0f8f4; border-color:#96bbae; }
.choice input { width:18px; height:18px; flex:0 0 18px; margin:1px 0; accent-color:var(--hire-brand,#17624b); }
input:focus-visible, button:focus-visible { outline:3px solid #478775; outline-offset:2px; }
@media(max-width:650px) { .options { grid-template-columns:1fr; } .clinical-choices { padding:14px; } }
</style>
