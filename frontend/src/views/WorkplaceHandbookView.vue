<template>
  <main class="company-handbook-page">
    <header><div><p>Company resources</p><h1>Workplace handbook</h1></div><label v-if="companies.length > 1">Company <select v-model="selectedId"><option v-for="company in companies" :key="company.id" :value="Number(company.id)">{{ company.name }}</option></select></label></header>
    <p v-if="loading" role="status">Loading your company…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <WorkplaceHandbookReader v-else-if="selectedId" :key="selectedId" :agency-id="selectedId" />
    <p v-else>Select your company to read its published handbook.</p>
  </main>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import WorkplaceHandbookReader from '../components/handbook/WorkplaceHandbookReader.vue';
const agencyStore = useAgencyStore(); const route = useRoute();
const selectedId = ref(null); const loading = ref(true); const error = ref('');
const companies = computed(() => agencyStore.userAgencies || []);
onMounted(async () => {
  try {
    await agencyStore.fetchUserAgencies();
    const scoped = companies.value.find(c => c.slug === route.params.organizationSlug);
    const selected = scoped || companies.value.find(c => Number(c.id) === Number(agencyStore.currentAgency?.id)) || companies.value[0];
    selectedId.value = selected?.id ? Number(selected.id) : null;
  } catch { error.value = 'Your company could not be loaded. Please reload to try again.'; }
  finally { loading.value = false; }
});
</script>
<style scoped>
.company-handbook-page{max-width:1320px;margin:auto;padding:clamp(12px,3vw,36px)}header{display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:24px}header p{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#66766b;margin:0 0 10px}h1{font-size:28px;margin:0;color:#22372f}label{font-size:13px;display:grid;gap:7px}select{font:inherit;padding:10px;border:1px solid #cdd8cd;border-radius:6px;max-width:100%}
</style>
