<template>
  <main class="plotline-application">
    <header class="application-brand">
      <a href="https://plotlinepo.com" aria-label="Plotline home"><img src="/assets/plotline/website/brand/logos/plotline-primary-transparent.png" alt="Plotline"><span>A People Operations Platform</span></a>
      <RouterLink :to="careersPath">Back to careers</RouterLink>
    </header>
    <p v-if="loading" role="status" class="application-state">Loading your job application…</p>
    <section v-else-if="error" class="application-state" role="alert"><h1>Application unavailable</h1><p>{{ error }}</p><RouterLink :to="careersPath">View available jobs</RouterLink></section>
    <PublicIntakeSigningView v-else-if="applicationKey" :key="applicationKey" :application-public-key="applicationKey" :hiring-context="context" />
  </main>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import PublicIntakeSigningView from '../PublicIntakeSigningView.vue';
const route = useRoute();
const loading = ref(true), error = ref(''), applicationKey = ref(''), context = ref(null);
const careersPath = computed(() => `/careers/${encodeURIComponent(String(route.params.agencySlug || ''))}`);
let request = 0;
watch(() => [route.params.agencySlug, route.params.jobId], async ([slug, jobId]) => {
  const current = ++request; loading.value = true; error.value = ''; applicationKey.value = ''; context.value = null;
  try {
    const { data } = await api.get(`/public-intake/careers/${encodeURIComponent(String(slug || ''))}`);
    if (current !== request) return;
    const job = data?.jobs?.find(job => Number(job.jobId) === Number(jobId));
    if (!job?.applicationPublicKey || !Number(data?.agency?.id)) throw new Error('This job is no longer accepting applications.');
    context.value = { agencyId: Number(data.agency.id), jobId: Number(jobId) };
    applicationKey.value = job.applicationPublicKey;
    document.title = `${job.title} · Apply · ${data.agency.name} · Plotline`;
  } catch (e) { if (current === request) error.value = e.response?.data?.error?.message || e.message || 'Please return to careers and choose an available job.'; }
  finally { if (current === request) loading.value = false; }
}, { immediate: true });
</script>
<style scoped>
.plotline-application{min-height:100vh;background:#f5f2ec;color:#173d32}.application-brand{padding:18px 24px;background:white;border-bottom:1px solid #dedfd8;display:flex;align-items:center;justify-content:space-between;gap:20px}.application-brand a{color:#173d32;text-decoration:none}.application-brand img{display:block;width:150px;max-width:100%;height:auto}.application-brand span{display:block;font:12px/1.5 Arial,sans-serif;margin-top:4px}.application-state{max-width:660px;margin:40px auto;padding:24px}.application-brand :deep(a):focus-visible{outline:3px solid #cc987b;outline-offset:4px}@media(max-width:480px){.application-brand{padding:14px 16px;gap:12px}.application-brand img{width:130px}.application-brand>a:last-child{font-size:13px}}
</style>
