<template><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.document" /></svg></template>
<script setup>
defineProps({ name: { type: String, default: 'document' } });
const paths = {
  home: 'm3 10 9-7 9 7 M5 9v12h5v-7h4v7h5V9',
  document: 'M14 2H5v20h14V7l-5-5v5h5 M8 12h8 M8 16h8',
  check: 'm5 12 4 4L19 6',
  people: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M16 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-4 M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  message: 'M21 3H3v15h5l4 4v-4h9V3 M7 8h10 M7 12h7',
  help: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  arrow: 'M4 12h16 m-6-6 6 6-6 6',
  back: 'M20 12H4 m6-6-6 6 6 6',
  lock: 'M5 10h14v12H5z M8 10V6a4 4 0 0 1 8 0v4 M12 15v3',
  clock: 'M12 6v6l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  link: 'M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-3 3 M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l3-3',
  book: 'M12 4v17 M12 4C8 1 4 2 2 3v17c4-2 7-1 10 1 3-2 6-3 10-1V3c-4-2-7-1-10 1',
  upload: 'M12 16V2 m-5 5 5-5 5 5 M3 16v6h18v-6',
  video: 'm9 6 9 6-9 6V6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  calendar: 'M3 5h18v17H3V5 M7 2v6 M17 2v6 M3 11h18 M7 15h2 M13 15h2 M7 18h2',
  mail: 'M2 4h20v16H2V4 m0 0 10 9L22 4',
  copy: 'M8 8h13v13H8V8 M16 8V2H2v14h6',
  camera: 'M8 5 10 2h4l2 3h6v16H2V5h6 M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0'
};
</script>
<style scoped>svg{width:22px;height:22px;flex:none;vertical-align:middle}</style>
