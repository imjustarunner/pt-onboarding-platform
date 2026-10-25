<template>
  <div class="aw-app">
    <header v-if="!context" class="aw-header"><a class="aw-brand" :href="websiteBase" aria-label="AuricWell website"><img :src="AURICWELL_MARK_URL" alt="" width="48" height="48"><span>AuricWell</span></a><div v-if="context"><strong>{{ context.practice.name }}</strong><small>Practice workspace</small></div><a class="aw-exit" :href="demoContext ? websiteBase : '/admin'">{{ demoContext ? 'AuricWell website ↗' : 'Return to full suite ↗' }}</a></header>
    <main v-if="isLogin" class="aw-welcome aw-login"><p class="aw-eyebrow">AURICWELL · PRACTICE ACCESS</p><h1>A clear place for your clinical work.</h1><p>Sign in with the account assigned to your practice workspace.</p><a class="aw-button" :href="loginUrl">Continue to secure sign-in →</a><p>Your account's practice access and permissions apply.</p><a :href="websiteBase">← Back to the AuricWell website</a></main>
    <main v-else-if="error" class="aw-welcome"><h1>Practice access</h1><p role="alert">{{ error }}</p><a class="aw-button" :href="loginUrl">Sign in or unlock your account</a><p>Use your own practice account, then return here.</p></main>
    <main v-else-if="loading" class="aw-welcome" role="status">Opening AuricWell…</main>
    <main v-else-if="!context" class="aw-welcome"><p class="aw-eyebrow">AURICWELL · PRACTICE ACCESS</p><h1>Your care workspace.</h1><p>Choose a practice available to your account.</p><p v-if="actor">Signed in as <strong>{{ actorName }}</strong></p><div class="aw-practices"><a v-for="p in practices" :key="p.id" :href="`${appBase}/${p.slug === 'tisi' ? 'innerstrength' : p.slug}`"><strong>{{ p.name }}</strong><span>Open practice →</span></a></div></main>
    <main v-else-if="context.qaWorkspace && !qaSectionAllowed" class="aw-welcome"><h1>Access restricted</h1><p role="alert">This section is not available to your practice role.</p><RouterLink :to="`/${slug}/overview`">Return to the QA workspace</RouterLink></main>
    <WorkspaceShell v-else :actor="actor" :slug="slug" :section="section" :navigation="navigation" :website-base="websiteBase" :unread="unread" :demo="!!demoContext">
      <template #notice>
      <AnnouncementToasts v-if="!demoContext" :storage-key="`auricwell:${actor.id}:agency:${context.practice.id}`" :load-items="loadOfficeToasts" />
      <div v-if="demoContext" class="aw-identity" role="status"><strong>Interactive demo · Fictional practice</strong><span>Explore the actual EHR screens. Nothing is saved, signed, submitted or sent.</span><button type="button" @click="resetDemo">Reset demo</button></div>
      <div v-else-if="context.qaWorkspace" class="aw-identity" role="status"><strong>QA workspace · {{ actorName }} · {{ actor.role }}</strong><span>Fictional clients in {{ context.practice.name }}. Changes are saved for testing.</span></div>
      <div v-else class="aw-identity" role="status"><strong>Superadmin preview · {{ actorName }}</strong><span>Real {{ context.practice.name }} records. Saved drafts are live and attributed to you.</span><a :href="appBase">Switch practice</a></div>
      </template>
        <Overview v-if="section === 'overview' || section === 'reports'" :key="context.practice.id" :agency="context.practice" :actor="actor" :slug="slug" :can-document="canDocument" :report="section === 'reports'" :demo="!!demoContext" />
        <WorkspaceTools v-else-if="['account','settings','payroll','notifications'].includes(section)" :section="section" :agency="context.practice" :actor="actor" :slug="slug" :notifications="notificationItems" :loading="notificationsLoading" :error="notificationsError" @refresh="loadNotifications" />
        <section v-else-if="section === 'announcements' && !demoContext" class="aw-toast-managers">
          <ToastAnnouncementManager :request="toastRequest" base-path="/auricwell-preview/toasts" />
          <ToastAnnouncementManager :request="toastRequest" base-path="/platform/toast-announcements" support />
        </section>
        <section v-else-if="section === 'documentation'"><p class="aw-caption">{{ demoContext ? 'Note Workspace · Open a fictional draft or explore a new note. Editing stays on this screen; saving, AI generation, signing and recording are unavailable in the demo.' : 'Note Workspace · Draft changes update the existing agency records. Signing and audio uploads are not enabled in this preview.' }}</p><ClinicalNoteGeneratorView :key="context.practice.id" /></section>
        <section v-else-if="section === 'billing'"><p class="aw-caption">{{ demoContext ? 'Fictional billing examples · Review the queue and claim details. No clearinghouse, payment or financial changes are connected.' : 'Shared billing records · Financial changes and live transmission remain in the full-suite billing workspace during preview.' }}</p><BillingWorkspaceView :key="context.practice.id" /></section>
        <Chart v-else-if="section === 'clients' && /^\d+$/.test(String(route.query.clientId || ''))" :key="`${context.practice.id}:${route.query.clientId}`" :client-id="String(route.query.clientId)" :agency="context.practice" :slug="slug" />
        <slot v-else-if="section === 'appointments' && $slots.appointments" name="appointments" />
        <Records v-else-if="['clients','providers','appointments'].includes(section)" :key="`${context.practice.id}:${section}`" :section="section" :agency="context.practice" :slug="slug" />
        <section v-else class="aw-welcome"><h1>Page unavailable</h1><RouterLink :to="`/${slug}`">Return to practice</RouterLink></section>
    </WorkspaceShell>
  </div>
</template>
<script setup>
import AnnouncementToasts from '../components/notifications/AnnouncementToasts.vue';
import ToastAnnouncementManager from '../components/admin/ToastAnnouncementManager.vue';
import api from '../services/api';
import { AURICWELL_MARK_URL } from '../constants/auricwellBrand';
import { ref, computed, watch, onBeforeUnmount, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import Records from './Records.vue';
import WorkspaceShell from './WorkspaceShell.vue';
import Overview from './Overview.vue';
import WorkspaceTools from './WorkspaceTools.vue';
import PortalIcon from '../components/portal/PortalIcon.vue';
const props = defineProps({ demoContext: { type: Object, default: null } });
const resetDemo = () => window.location.reload();
import Chart from './Chart.vue';
import { auricwellAppBase, auricwellWebsiteBase } from './paths';
import { QA_SLUG, qaSections } from './qaAccess';
const appBase = auricwellAppBase(), websiteBase = auricwellWebsiteBase();
const ClinicalNoteGeneratorView = defineAsyncComponent(() => import('../views/admin/ClinicalNoteGeneratorView.vue'));
const BillingWorkspaceView = defineAsyncComponent(() => import('../views/admin/BillingWorkspaceView.vue'));
const route = useRoute(), agencyStore = useAgencyStore(), authStore = useAuthStore();
const context = ref(null), actor = ref(null), practices = ref([]), loading = ref(true), error = ref('');
const slug = computed(() => String(route.params.organizationSlug || ''));
const section = computed(() => String(route.params.section || 'overview'));
const actorName = computed(() => [actor.value?.first_name, actor.value?.last_name].filter(Boolean).join(' ') || actor.value?.email || 'Your account');
const isLogin = computed(() => route.name === 'login');
const loginUrl = computed(() => `${slug.value===QA_SLUG?`/${QA_SLUG}`:''}/login?redirect=${encodeURIComponent(isLogin.value ? appBase : window.location.pathname + window.location.search)}`);
const canDocument=computed(()=>!context.value?.qaWorkspace||qaSections(actor.value?.role).includes('documentation'));
const qaSectionAllowed = computed(()=>qaSections(actor.value?.role).includes(section.value));
const navigation = computed(() => [{key:'overview',label:'Overview',icon:'dashboard'},{key:'appointments',label:'Appointments',icon:'sessions'},{key:'clients',label:'Clients',icon:'people'},{key:'documentation',label:'Notes & Documentation',icon:'documents'},{key:'billing',label:'Billing',icon:'billing'},{key:'providers',label:'Providers',icon:'providers'},{key:'reports',label:'Reports',icon:'plan'}, ...(!props.demoContext ? [{key:'settings',label:'Settings',icon:'settings'}] : []), ...(!props.demoContext ? [{key:'announcements',label:'Announcements',icon:'notifications'}] : [])].filter(item=>!context.value?.qaWorkspace||qaSections(actor.value?.role).includes(item.key)));
const notificationItems=ref([]),unread=ref(null),notificationsLoading=ref(false),notificationsError=ref('');
let notificationRequestId=0;
async function loadNotifications(){
  const id=++notificationRequestId;
  if(props.demoContext){notificationItems.value=[];unread.value=0;return;}
  notificationsLoading.value=true;notificationsError.value='';
  try{const {data}=await api.get('/auricwell-preview/notifications');if(id!==notificationRequestId)return;notificationItems.value=data.items||[];unread.value=Number(data.unreadCount||0);}
  catch{if(id===notificationRequestId){notificationsError.value='Notifications could not load. Please try again.';unread.value=null;}}
  finally{if(id===notificationRequestId)notificationsLoading.value=false;}
}
const toastRequest = async (path, options = {}) => (await api.request({ url: path, method: options.method || 'GET', data: options.body })).data;
const loadOfficeToasts = async () => (await api.get('/auricwell-preview/toasts/active')).data;
let requestId = 0;
async function load() {
  if (isLogin.value) { loading.value = false; return; }
  const id = ++requestId;
  loading.value = true; context.value = null; error.value = ''; delete window.__auricwellPracticeId;
  try {
    let result;
    if (props.demoContext) {
      if (slug.value !== props.demoContext.practice.slug) throw new Error('This fictional practice is unavailable. Reset the demo to continue.');
      result = props.demoContext;
    } else {
    const response = await fetch(`/api/auricwell-preview${slug.value ? `/context?slug=${encodeURIComponent(slug.value)}` : ''}`, { credentials:'same-origin', cache:'no-store' });
    result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Sign in with your practice account.');
    }
    if (id !== requestId) return;
    actor.value = result.actor;
    if (result.practice) {
      // In-memory only: do not overwrite the agency selected in a full-suite tab.
      authStore.user = result.actor;
      agencyStore.currentAgency = result.practice;
      agencyStore.agencies = [result.practice]; agencyStore.userAgencies = [result.practice]; agencyStore.platformMode = false;
      window.__auricwellPracticeId = result.practice.id;
      context.value = result;
      loadNotifications();
    } else practices.value = result.practices;
  } catch (e) { if (id === requestId) error.value = e.message; }
  finally { if (id === requestId) loading.value = false; }
}
function endSession() { ++requestId; ++notificationRequestId; notificationItems.value=[]; unread.value=null; context.value = null; practices.value = []; error.value = 'Your session ended or is locked. Sign in or unlock before continuing.'; delete window.__auricwellPracticeId; }
window.addEventListener('auricwell-session-ended', endSession);
onBeforeUnmount(() => { ++requestId; ++notificationRequestId; window.removeEventListener('auricwell-session-ended', endSession); });
watch(slug, (current, previous) => { if (!props.demoContext && previous && current !== previous) window.location.assign(`${appBase}/${encodeURIComponent(current)}`); else load(); }, { immediate:true });
</script>

<style scoped>
.aw-toast-managers { display: grid; gap: 24px; }
</style>
