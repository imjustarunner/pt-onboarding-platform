<template><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.dashboard" /></svg></template>
<script setup>
defineProps({ name: String });
const paths = {
  dashboard: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  child: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 6 0 0 1 16 0v3Z',
  sessions: 'M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2ZM7 3v5m10-5v5M3 11h18m-14 4h3m4 0h3',
  plan: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8m-5 0h5v5',
  tasks: 'M9 4H4v17h16V4h-5M9 3h6v4H9ZM8 14l3 3 5-6',
  messages: 'M4 3h16v14H9l-5 4V3Zm4 5h8m-8 4h5',
  billing: 'M3 5h18v15H3ZM3 10h18M7 15h3',
  documents: 'M5 3h9l5 5v13H5ZM14 3v6h5M8 13h8m-8 4h6',
  support: 'M4 13v-2a8 8 0 0 1 16 0v2M4 12H2v6h4v-6Zm16 0h2v6h-4v-6Zm0 6v3h-7',
  account: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6'
};
</script>
