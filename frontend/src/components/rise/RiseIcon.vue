<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.leaf" /></svg>
</template>
<script setup>
defineProps({ name: String });
const paths = {
  leaf: 'M4 20C0 7 11 2 22 2c0 12-5 20-15 17M2 22 17 7',
  people: 'M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-6a3 3 0 0 1 0 6M2 22v-5a6 6 0 0 1 12 0v5H2Zm14-9a5 5 0 0 1 6 5v4h-4',
  mountain: 'M1 21 9 8l4 6 3-10 7 17H1Zm6-10 2 4 2-3m3-3 2 4 2-3',
  heart: 'M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6l-9 9Z',
  chat: 'M21 11c0 5-4 8-9 8H7l-5 3 2-6a8 8 0 1 1 17-5ZM8 10h.01m4 0h.01m4 0h.01',
  target: 'M20 12a8 8 0 1 1-8-8m4 8a4 4 0 1 1-4-4m0 4 9-9m-4 0h4v4',
  chart: 'M3 21V12h4v9H3Zm7 0V7h4v14h-4Zm7 0V2h4v19h-4',
  calendar: 'M3 5h18v17H3V5Zm0 5h18M7 2v6m10-6v6M7 14h3m4 0h3m-10 4h3',
  screen: 'M3 3h18v14H3V3Zm-2 18h22M9 17v4m6-4v4',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  mail: 'M2 4h20v16H2V4Zm0 0 10 9L22 4',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-5 9 3 3 7-7'
};
</script>
