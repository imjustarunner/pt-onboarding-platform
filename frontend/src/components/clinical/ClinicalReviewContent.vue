<template>
  <div class="review-content">
    <dl v-if="isObject">
      <div v-for="(item, key) in parsed" :key="key">
        <dt>{{ label(key) }}</dt>
        <dd><ClinicalReviewContent :value="item" /></dd>
      </div>
    </dl>
    <ol v-else-if="Array.isArray(parsed)">
      <li v-for="(item, index) in parsed" :key="index"><ClinicalReviewContent :value="item" /></li>
      <li v-if="!parsed.length">None recorded</li>
    </ol>
    <p v-else>{{ display }}</p>
  </div>
</template>
<script setup>
import { computed } from 'vue';
defineOptions({ name: 'ClinicalReviewContent' });
const props = defineProps({ content: { type: String, default: undefined }, value: { default: null } });
// Only decode the review envelope. Nested narrative strings stay literal text.
const parsed = computed(() => {
  if (props.content === undefined) return props.value;
  try { return JSON.parse(props.content); } catch { return props.content; }
});
const isObject = computed(() => parsed.value !== null && typeof parsed.value === 'object' && !Array.isArray(parsed.value));
const display = computed(() => parsed.value === null || parsed.value === '' ? 'Not recorded' : typeof parsed.value === 'boolean' ? (parsed.value ? 'Yes' : 'No') : String(parsed.value));
const label = key => String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
</script>
<style scoped>
.review-content{min-width:0;overflow-wrap:anywhere}dl{margin:.5rem 0}dl>div{margin:.6rem 0;padding:.65rem;border:1px solid var(--border-color,#dce3eb);border-radius:6px}dt{font-weight:600}dd{margin:.35rem 0 0}p{margin:.3rem 0;white-space:pre-wrap;line-height:1.6}ol{padding-left:1.5rem}li{padding:.2rem 0}
</style>
