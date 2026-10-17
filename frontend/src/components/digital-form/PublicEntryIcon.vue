<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path :d="paths[name] || paths.shield" />
  </svg>
</template>
<script setup>
defineProps({ name: { type: String, default: 'shield' } });
const paths = {
  leaf: 'M12 21v-8 M12 16C5 16 3 10 3 6c6 0 9 3 9 10Z M12 13C12 6 16 3 22 3c0 7-4 10-10 10Z M7 10l5 6 M17 8l-5 5',
  person: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z M4 21v-2a8 8 0 0 1 16 0v2Z',
  headset: 'M4 13v-2a8 8 0 0 1 16 0v2 M4 11H2v7h4v-7H4 M20 11h2v7h-4v-7h2 M20 18v1a3 3 0 0 1-3 3h-3',
  phone: 'M5 3H2v4c0 8 7 15 15 15h4v-3l-5-3-2 2c-4-2-6-4-8-8l2-2Z',
  mail: 'M3 5h18v14H3Z M3 6l9 7 9-7',
  message: 'M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-6 3 2-6a9 9 0 1 1 17-5Z',
  'arrow-left': 'M20 12H4 M10 6l-6 6 6 6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z M8 12l3 3 5-6',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5Z M12 15v2',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M12 7v5l3 2',
  check: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z M8 12l3 3 5-6',
  people: 'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M5 21v-2a7 7 0 0 1 14 0v2 M18 4a3 3 0 0 1 0 6 M21 21v-3a5 5 0 0 0-3-4 M6 4a3 3 0 0 0 0 6 M3 21v-3a5 5 0 0 1 3-4',
  bolt: 'm13 2-9 12h7l-1 8 10-13h-7Z',
  document: 'M6 2h9l4 4v16H6Z M14 2v5h5 M9 11h7 M9 15h7 M9 19h5'
};
</script>
<style scoped>svg { width: 1.3em; height: 1.3em; flex-shrink: 0; vertical-align: middle; }</style>
