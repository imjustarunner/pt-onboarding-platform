<template>
  <PlotlineSessionBoundary v-if="plotlinePrivateSession" />
  <router-view v-if="route.meta?.guestPaymentSurface" :key="route.fullPath" />
  <AssistantAppShell v-else-if="assistantSurface"><router-view /></AssistantAppShell>
  <PublicWebsiteShell v-else-if="route.meta?.publicMarketingHub"><router-view /></PublicWebsiteShell>
  <router-view v-else-if="route.meta?.plotlineEntry" />
  <router-view v-else-if="publicLoginSurface" />
  <router-view v-else-if="plotlineInterview" />
  <PlotlineWorkspaceShell v-else-if="plotlineCompany" :agency="plotlineCompany"><router-view /></PlotlineWorkspaceShell>
  <main v-else-if="auth.isAuthenticated && companyScope.locked.value" role="status">Opening company…</main>
  <AppWorkspace v-else />
</template>

<script setup>
import { computed, defineAsyncComponent, h } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './store/auth';
import {useAgencyStore} from './store/agency';
import PlotlineWorkspaceShell from './components/plotline/PlotlineWorkspaceShell.vue';
import PlotlineSessionBoundary from './components/plotline/PlotlineSessionBoundary.vue';
import AssistantAppShell from './components/assistants/AssistantAppShell.vue';
import PublicWebsiteShell from './components/public/PublicWebsiteShell.vue';
import {usePlotlineCompanyScope} from './composables/usePlotlineCompanyScope';

// The ordinary workspace owns employee widgets and polling. Never mount it for
// an assistant, including during a direct navigation to a forbidden staff URL.
const AppWorkspace = defineAsyncComponent({
  loader: () => import('./AppWorkspace.vue'),
  delay: 0,
  loadingComponent: { render: () => h('main', {
    role: 'status', style: 'padding:32px;font:16px/1.5 system-ui,sans-serif;min-height:100vh;box-sizing:border-box'
  }, 'Opening your workspace…') }
});
const route = useRoute();
const auth = useAuthStore();
const agencies=useAgencyStore();
const companyScope=usePlotlineCompanyScope(route,agencies);
const plotlineInterview=computed(()=>route.name==='BrandedInterview' && companyScope.locked.value);
const plotlineCompany=computed(()=>{const agency=agencies.currentAgency;if(!auth.isAuthenticated||!agency)return null;let flags=agency.feature_flags||agency.featureFlags||{};try{if(typeof flags==='string')flags=JSON.parse(flags);}catch{return null;}const slug=route.params.organizationSlug;return flags.plotlineOnly===true&&slug&&(agency.portal_url===slug||agency.slug===slug)?agency:null;});
const assistantSurface = computed(() => String(auth.user?.role || '').toLowerCase() === 'assistant' || route.meta?.assistantSurface === true);
// Sign-in must remain available when an unrelated employee widget cannot load.
// Login views own their branding; authentication and route guards stay in place.
const publicLoginNames = new Set(['Login', 'OrganizationLogin', 'ParentOrganizationLogin']);
const schoolPortalEntryNames = new Set(['SchoolCareBridgeLogin', 'SchoolCareBridgeSchool']);
const publicEnrollmentNames = new Set(['PublicIntakeSigning', 'PublicIntakeSigningShort']);
const publicRecoveryNames = new Set(['SessionEnded', 'OrganizationSessionEnded']);
// Authentication succeeds before LoginView finishes preparing the destination.
// Keep that same form mounted until navigation, including its retry/error state.
const publicLoginSurface = computed(() => publicEnrollmentNames.has(route.name) || publicRecoveryNames.has(route.name) || publicLoginNames.has(route.name)
  || (!auth.isAuthenticated && schoolPortalEntryNames.has(route.name)));
const plotlinePrivateSession=computed(()=>auth.isAuthenticated && !assistantSurface.value && !publicLoginSurface.value
  && !['client','guardian','client_guardian'].includes(String(auth.user?.role || '').toLowerCase())
  && (route.meta?.plotlineEntry===true || !!plotlineCompany.value || plotlineInterview.value || companyScope.locked.value));
</script>
