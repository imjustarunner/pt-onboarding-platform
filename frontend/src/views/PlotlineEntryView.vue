<template>
  <div class="plotline-surface">
    <header class="pl-header"><a :href="PLOTLINE_WEBSITE_URL" aria-label="Plotline home"><PlotlineBrand/></a><span class="pl-eyebrow">Your people’s next chapter</span></header>
    <main v-if="!auth.isAuthenticated" class="pl-entry pl-wrap pl-section"><section><p class="pl-eyebrow">Welcome to Plotline</p><h1>People have<br>a journey.</h1><p class="pl-entry-lead">Pick up where your team left off. Sign in with your organization’s existing account.</p><p>Careers · Hiring · Onboarding · Training · Growth</p></section><section class="pl-login-card" aria-label="Sign in to Plotline"><h2>Welcome back.</h2><router-link class="pl-button" :to="{path:'/login',query:{redirect:'/plotline/app'}}">Sign in to Plotline →</router-link></section></main>
    <main v-else class="pl-wrap pl-section"><p class="pl-eyebrow">Plotline people operations</p><h1>Choose your workspace.</h1><p>Open the people operations workspace available to your account.</p><p v-if="busy" role="status">Loading your workspaces…</p><div v-else-if="error" class="pl-status" role="alert"><p>{{ error }}</p><button class="pl-button" @click="load">Try again</button></div><div v-else class="pl-grid"><router-link v-for="agency in workspaces" :key="agency.id" class="pl-card pl-workspace" :to="`/${agency.portal_url || agency.slug}/people-operations`" @click="agencies.setCurrentAgency(agency)"><h2>{{ agency.name }}</h2><span>Open Plotline →</span></router-link><div v-if="!workspaces.length" class="pl-status"><h2>Your next chapter starts here.</h2><p>No Plotline workspaces are available to this account yet. Your organization’s administrator can help with access.</p><a class="pl-button" :href="PLOTLINE_WEBSITE_URL">Explore Plotline</a></div></div></main>
    <footer class="pl-footer"><span>Plotline by PlotTwistCo</span><a :href="PLOTLINE_WEBSITE_URL">Explore the people journey →</a></footer>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { canAccessPeopleOperationsHub } from '../utils/workspaceNavAccess';
import api from '../services/api';
import { isTenantOrganizationType } from '../utils/organizationTypes';
import { isPlotlineCompanySlug, PLOTLINE_WEBSITE_URL } from '../utils/plotline';
import PlotlineBrand from '../components/plotline/PlotlineBrand.vue';
import '../styles/plotline.css';
const auth = useAuthStore(), agencies = useAgencyStore();
const busy = ref(false), error = ref('');
const workspaces = computed(() => (agencies.userAgencies || []).filter(agency =>
  isTenantOrganizationType(agency) && isPlotlineCompanySlug(agency.portal_url || agency.slug) && canAccessPeopleOperationsHub({ role: auth.user?.role, user: auth.user, agencyFeatureFlags: agency.feature_flags || agency.featureFlags || {} })
));
async function load() {
  if (!auth.isAuthenticated) return;
  busy.value = true; error.value = '';
  try {
    const { data } = await api.get('/users/me/agencies', { skipGlobalLoading: true, skipAuthRedirect: true });
    if (!Array.isArray(data)) throw new Error('Invalid workspace response');
    agencies.applyLoginAgencies(data);
  } catch { error.value = 'We couldn’t load your workspaces. Please try again.'; }
  finally { busy.value = false; }
}
watch(() => auth.isAuthenticated, load);
onMounted(() => { document.title = 'Sign in | Plotline'; load(); });
</script>
<style scoped>
.pl-entry{display:grid;grid-template-columns:1fr 1fr;gap:65px;align-items:center;min-height:75vh}.pl-entry-lead{font-size:19px;max-width:470px}.pl-login-card{background:#fff;border:1px solid var(--pl-border);padding:35px;border-radius:24px;min-width:0}.pl-workspace{text-decoration:none}.pl-workspace h2{font-size:24px}.pl-login-card :deep(.login-page){padding:0!important;background:none!important;min-height:0!important;display:block!important}.pl-login-card :deep(.login-container),.pl-login-card :deep(.login-card){width:100%!important;max-width:none!important;padding:0!important;background:none!important;box-shadow:none!important;border:0!important;margin:0!important}.pl-login-card :deep(.login-logo),.pl-login-card :deep(.login-dual-brand),.pl-login-card :deep(.logo),.pl-login-card :deep(.login-card>h2),.pl-login-card :deep(.login-card>.subtitle),.pl-login-card :deep(.platform-footer),.pl-login-card :deep(video),.pl-login-card :deep(.app-preview-toggle-group){display:none!important}.pl-login-card :deep(.btn-primary){background:#0f2d24!important;color:#fff!important;border-color:#0f2d24!important}.pl-login-card :deep(.help-link),.pl-login-card :deep(.login-security-link){color:#0f2d24!important}.pl-login-card :deep(.login-credentials-wrap){display:flex!important;flex-direction:column;gap:18px!important}
@media(max-width:800px){.pl-entry{grid-template-columns:1fr;gap:30px}.pl-login-card{padding:25px}}
</style>
