<template><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.dashboard" /></svg></template>
<script setup>
defineProps({ name: String });
const paths = {
  providers: 'M8 3v4a4 4 0 0 0 8 0V3M6 3h4m4 0h4m-6 8v4a5 5 0 0 0 10 0v-2m0-4a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-2a7 7 0 0 1 14 0v2m1-17a4 4 0 0 1 0 7m2 4a5 5 0 0 1 3 4v2',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-6h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1Z',
  notifications: 'M5 10a7 7 0 0 1 14 0v5l2 3H3l2-3v-5Zm4 11h6',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 8a3 3 0 0 1 6 1c0 2-3 2-3 4m0 3v1',
  upload: 'M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6',
  forms: 'M4 4h5v5H4ZM15 4h5v5h-5ZM4 15h5v5H4Zm11-1v3h-3m8-3v6h-5m0-3h5',
  events: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
  building: 'M4 21V3h16v18M2 21h20M8 7h2m4 0h2M8 11h2m4 0h2M9 21v-6h6v6',
  back: 'M20 12H4m6-6-6 6 6 6',
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
