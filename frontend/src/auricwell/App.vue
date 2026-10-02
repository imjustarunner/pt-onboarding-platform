<template>
  <div class="aw-app">
    <header class="aw-header"><a :href="websiteBase" aria-label="AuricWell website"><img src="/auricwell/logo.png" alt="AuricWell"></a><div v-if="context"><strong>{{ context.practice.name }}</strong><small>Practice workspace</small></div><a class="aw-exit" href="/admin">Return to full suite ↗</a></header>
    <main v-if="isLogin" class="aw-welcome aw-login"><p class="aw-eyebrow">AURICWELL · ADMINISTRATOR PREVIEW</p><h1>A clear place for your clinical work.</h1><p>Sign in with your authorized PlotTwist HQ superadmin account to open your practice workspace.</p><a class="aw-button" :href="loginUrl">Continue to secure sign-in →</a><p>Your identity remains visible, and edits affect real practice records.</p><a :href="websiteBase">← Back to the AuricWell website</a></main>
    <main v-else-if="error" class="aw-welcome"><h1>Practice access</h1><p role="alert">{{ error }}</p><a class="aw-button" :href="loginUrl">Sign in or unlock in PlotTwist HQ</a><p>Use your own superadmin account, then return here.</p></main>
    <main v-else-if="loading" class="aw-welcome" role="status">Opening AuricWell…</main>
    <main v-else-if="!context" class="aw-welcome"><p class="aw-eyebrow">AURICWELL · PRACTICE PREVIEW</p><h1>Your care workspace.</h1><p>Open an agency’s existing EHR records with your superadmin account.</p><p v-if="actor">Signed in as <strong>{{ actorName }}</strong></p><div class="aw-practices"><a v-for="p in practices" :key="p.id" :href="`${appBase}/${p.slug === 'tisi' ? 'innerstrength' : p.slug}`"><strong>{{ p.name }}</strong><span>Open practice →</span></a></div></main>
    <template v-else>
      <div class="aw-identity" role="status"><strong>Superadmin preview · {{ actorName }}</strong><span>Real {{ context.practice.name }} records. Saved drafts are live and attributed to you.</span><a :href="appBase">Switch practice</a></div>
      <nav class="aw-nav" aria-label="Practice navigation"><RouterLink v-for="item in navigation" :key="item.key" :to="`/${slug}/${item.key}`" :aria-current="section === item.key ? 'page' : undefined">{{ item.label }}</RouterLink></nav>
      <main class="aw-content">
        <section v-if="section === 'overview'" class="aw-welcome"><p class="aw-eyebrow">{{ context.practice.name }}</p><h1>Care, connected.</h1><p>Your existing charts, Practice Notes and billing records, together in AuricWell.</p><div class="aw-practices"><RouterLink v-for="item in navigation.filter(n => n.key !== 'overview')" :key="item.key" :to="`/${slug}/${item.key}`"><strong>{{ item.label }}</strong><span>Open →</span></RouterLink></div><div class="aw-status"><h2>Preview availability</h2><p>Review clients, appointments, providers and billing. Use Practice Notes to open and save your drafts. Signing, financial changes, patient access, imports and practice contracting are not enabled in this preview.</p><p>Existing practice features and clinical permissions still apply. A superadmin preview does not sign as a provider or change agency enrollment.</p></div></section>
        <section v-else-if="section === 'documentation'"><p class="aw-caption">Practice Notes · Draft changes update the existing agency records. Signing and audio uploads are not enabled in this preview.</p><ClinicalNoteGeneratorView :key="context.practice.id" /></section>
        <section v-else-if="section === 'billing'"><p class="aw-caption">Shared billing records · Financial changes and live transmission remain in the full-suite billing workspace during preview.</p><BillingWorkspaceView :key="context.practice.id" /></section>
        <Chart v-else-if="section === 'clients' && /^\d+$/.test(String(route.query.clientId || ''))" :key="`${context.practice.id}:${route.query.clientId}`" :client-id="String(route.query.clientId)" :agency="context.practice" :slug="slug" />
        <Records v-else-if="['clients','providers','appointments'].includes(section)" :key="`${context.practice.id}:${section}`" :section="section" :agency="context.practice" :slug="slug" />
        <section v-else class="aw-welcome"><h1>Page unavailable</h1><RouterLink :to="`/${slug}`">Return to practice</RouterLink></section>
      </main>
    </template>
  </div>
</template>
<script setup>
import { ref, computed, watch, onBeforeUnmount, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import Records from './Records.vue';
import Chart from './Chart.vue';
import { auricwellAppBase, auricwellWebsiteBase } from './paths';
const appBase = auricwellAppBase(), websiteBase = auricwellWebsiteBase();
const ClinicalNoteGeneratorView = defineAsyncComponent(() => import('../views/admin/ClinicalNoteGeneratorView.vue'));
const BillingWorkspaceView = defineAsyncComponent(() => import('../views/admin/BillingWorkspaceView.vue'));
const route = useRoute(), agencyStore = useAgencyStore(), authStore = useAuthStore();
const context = ref(null), actor = ref(null), practices = ref([]), loading = ref(true), error = ref('');
const slug = computed(() => String(route.params.organizationSlug || ''));
const section = computed(() => String(route.params.section || 'overview'));
const actorName = computed(() => [actor.value?.first_name, actor.value?.last_name].filter(Boolean).join(' ') || actor.value?.email || 'Superadmin');
const isLogin = computed(() => route.name === 'login');
const loginUrl = computed(() => `/login?redirect=${encodeURIComponent(isLogin.value ? appBase : window.location.pathname + window.location.search)}`);
const navigation = [{key:'overview',label:'Overview'},{key:'appointments',label:'Appointments'},{key:'clients',label:'Clients'},{key:'documentation',label:'Practice Notes'},{key:'billing',label:'Billing'},{key:'providers',label:'Providers'}];
let requestId = 0;
async function load() {
  if (isLogin.value) { loading.value = false; return; }
  const id = ++requestId;
  loading.value = true; context.value = null; error.value = ''; delete window.__auricwellPracticeId;
  try {
    const response = await fetch(`/api/auricwell-preview${slug.value ? `/context?slug=${encodeURIComponent(slug.value)}` : ''}`, { credentials:'same-origin', cache:'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Sign in with your active superadmin account.');
    if (id !== requestId) return;
    actor.value = result.actor;
    if (result.practice) {
      // In-memory only: do not overwrite the agency selected in a full-suite tab.
      authStore.user = result.actor;
      agencyStore.currentAgency = result.practice;
      agencyStore.agencies = [result.practice]; agencyStore.userAgencies = [result.practice]; agencyStore.platformMode = false;
      window.__auricwellPracticeId = result.practice.id;
      context.value = result;
    } else practices.value = result.practices;
  } catch (e) { if (id === requestId) error.value = e.message; }
  finally { if (id === requestId) loading.value = false; }
}
function endSession() { ++requestId; context.value = null; practices.value = []; error.value = 'Your session ended or is locked. Sign in or unlock before continuing.'; delete window.__auricwellPracticeId; }
window.addEventListener('auricwell-session-ended', endSession);
onBeforeUnmount(() => { ++requestId; window.removeEventListener('auricwell-session-ended', endSession); });
watch(slug, (current, previous) => { if (previous && current !== previous) window.location.assign(`${appBase}/${encodeURIComponent(current)}`); else load(); }, { immediate:true });
</script>
