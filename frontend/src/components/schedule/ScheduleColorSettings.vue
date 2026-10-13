<template>
  <div class="schedule-color-settings">
    <p class="color-help">Your personal colors. Card fills always stay transparent.</p>
    <input v-model="search" class="color-search" type="search" placeholder="Find an appointment type…" aria-label="Find an appointment color" />
    <div class="color-options">
      <label v-for="option in filteredOptions" :key="option.key" class="color-option">
        <input type="color" :value="modelValue[option.key] || option.color" :disabled="disabled"
          :aria-label="`${option.label} color`" @input="setColor(option.key, $event.target.value)" />
        <span>{{ option.label }}</span>
      </label>
    </div>
    <p v-if="!filteredOptions.length" class="color-help">No matching appointment types.</p>
    <button type="button" class="btn btn-secondary" :disabled="disabled" @click="$emit('update:modelValue', defaultScheduleColors())">Reset colors</button>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
import { SCHEDULE_COLOR_OPTIONS, defaultScheduleColors } from '../../utils/scheduleAppearance.js';
const props = defineProps({ modelValue:{type:Object,required:true}, disabled:Boolean });
const emit = defineEmits(['update:modelValue']);
const search = ref('');
const filteredOptions = computed(() => SCHEDULE_COLOR_OPTIONS.filter(o => o.label.toLowerCase().includes(search.value.trim().toLowerCase())));
const setColor = (key, value) => emit('update:modelValue', {...props.modelValue, [key]:value});
</script>
<style scoped>
.color-help { font-size:13px; color:var(--text-secondary, #475569); margin:8px 0; }
.color-search { width:100%; max-width:360px; box-sizing:border-box; margin-bottom:10px; padding:8px; border:1px solid var(--border,#cbd5e1); border-radius:8px; }
.color-options { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr)); gap:10px; max-height:300px; overflow:auto; padding:2px; margin-bottom:12px; }
.color-option { display:flex; align-items:center; gap:8px; min-width:0; font-size:13px; }
.color-option input { flex:0 0 36px; width:36px; height:28px; padding:2px; cursor:pointer; }
</style>
