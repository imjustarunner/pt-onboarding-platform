<template>
  <fieldset v-if="choices.length > 1" class="artwork-picker">
    <legend>Choose a picture</legend>
    <div class="artwork-options">
      <button v-for="choice in choices" :key="choice.id" type="button" :aria-pressed="selected === choice.id" @click="$emit('update:modelValue', choice.id); $emit('change', choice)">
        <img :src="choice.artwork" alt="" loading="lazy" width="180" height="120" />
        <span>{{ choice.label }}</span>
      </button>
    </div>
  </fieldset>
</template>
<script setup>
import { computed } from 'vue';
import { eventArtworkChoices } from '../../utils/familyCommandCenter';
const props = defineProps({ eventType: { type: String, default: 'family' }, modelValue: { type: String, default: '' } });
defineEmits(['update:modelValue', 'change']);
const choices = computed(() => eventArtworkChoices(props.eventType));
const selected = computed(() => choices.value.some(a => a.id === props.modelValue) ? props.modelValue : choices.value[0]?.id);
</script>
<style scoped>
.artwork-picker{border:0;padding:0;margin:14px 0;min-width:0}.artwork-picker legend{font-size:13px;color:#766b85;margin-bottom:10px}.artwork-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.artwork-options button{min-width:0;padding:4px;border:2px solid #e4dfeb;border-radius:12px;background:#fff;color:#655d76;cursor:pointer;font:inherit;overflow:hidden}.artwork-options button[aria-pressed=true]{border-color:#7765be;background:#f0ebfa}.artwork-options button:focus-visible{outline:3px solid #7765be;outline-offset:2px}.artwork-options img{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;border-radius:7px}.artwork-options span{display:block;padding:8px 3px;font-size:12px;line-height:1.4}
</style>
