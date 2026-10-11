<template><main :style="fontStyle"><p class="preview-notice">{{ company.name }} · LOCAL TRAINING PREVIEW · Synthetic learner · No live AI or payroll</p><h1>From reference to practice.</h1><p class="intro">Read your company guides. Ask questions. Put the essentials into practice.</p><nav aria-label="Preview company"><router-link v-for="entry in companies" :key="entry.slug" :to="`/${entry.slug}/my-learning`">{{ entry.name }}</router-link></nav><nav aria-label="Preview learning locations"><button v-for="entry in modes" :key="entry.value" :aria-pressed="mode === entry.value" @click="mode = entry.value">{{ entry.label }}</button></nav><Catalog :key="`${company.id}:${mode}`" :agency-id="company.id" :mode="mode" :http="http" api-base="/document-learning" /></main></template>
<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
const companies = [{ id: 2, slug: 'itsco', name: 'ITSCO' }, { id: 12, slug: 'nlu', name: 'Next Level Up' }, { id: 22, slug: 'tisi', name: 'Inner Strength Institute' }];
const company = computed(() => companies.find(c => c.slug === route.params.organizationSlug) || companies[0]);
const fontStyle = computed(() => ({ '--preview-font': company.value.slug === 'itsco' ? 'var(--font-itsco)' : 'var(--font-ptco)' }));
import axios from 'axios';
import Catalog from '../src/components/training/DocumentLearningCatalog.vue';
const http = axios.create({ baseURL: '/preview-api' });
const mode = ref('all');
const modes = [{ value: 'all', label: 'Library / My Learning' }, { value: 'assigned', label: 'Required onboarding' }, { value: 'on-demand', label: 'On-demand · Your own time' }];
</script>
<style scoped>
:global(*){box-sizing:border-box}:global(body){margin:0;background:#e8eee3;color:#203f2d;font-family:var(--preview-font,var(--font-ptco))}main{max-width:1320px;margin:36px auto;padding:0 24px}h1{font-family:var(--preview-font,var(--font-ptco));font-size:clamp(28px,4vw,48px);line-height:1.4}.preview-notice{font:11px/1.8 var(--font-ptco);letter-spacing:.08em}.intro{line-height:1.8;font-size:15px}main>nav{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}main>nav>a,main>nav>button{font:12px/1.7 var(--preview-font,var(--font-ptco));padding:12px 18px;background:#fffef8;border:1px solid #c8d6bf;border-radius:8px;color:#1e4934;cursor:pointer}main>nav>button[aria-pressed=true]{background:#164d38;color:white}@media(max-width:600px){main{padding:0 12px;margin:20px auto}}
</style>
