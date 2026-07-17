<template>
  <svg
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <g v-html="paths" />
  </svg>
</template>

<script setup>
import { computed } from 'vue';
import { indirectTimeIconPaths } from '../../utils/indirectTimeIcons';

const props = defineProps({
  name: { type: String, default: 'circle' },
  size: { type: [Number, String], default: 20 },
  strokeWidth: { type: [Number, String], default: 2 }
});

const paths = computed(() => indirectTimeIconPaths(props.name));
</script>
