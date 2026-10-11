<template><main><header><p>LOCAL PREVIEW · Reference only · No onboarding assignment or quiz</p><label>Company <select v-model="company"><option value="itsco">ITSCO</option><option value="nlu">Next Level Up</option><option value="tisi">Inner Strength Institute</option></select></label></header><Book :key="company" :handbook="books[company]" /></main></template>
<script setup>
import { ref } from 'vue';
import books from 'caseload-sop-books';
import Book from '../src/components/handbook/WorkplaceHandbookBook.vue';
const company = ref('itsco');
</script>
<style scoped>
:global(body){margin:0;background:#edf2ec;color:#213c31;font-family:var(--font-ptco)}:global(*){box-sizing:border-box}main{max-width:1280px;margin:24px auto;padding:0 20px}header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:22px}header p{font-size:12px}select{font:inherit;padding:9px;border:1px solid #b8cbbc;border-radius:8px;background:white}
</style>
