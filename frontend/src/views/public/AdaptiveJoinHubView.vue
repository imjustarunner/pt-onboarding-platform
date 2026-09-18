<template>
  <AdaptiveIntakeShell
    class="ai-shell-host--join-flow public-service-hub"
    :branding="config?.branding"
    :scenic-sidebar-url="scenicUrl"
    :trust-items="hubTrust"
    :program-title="config?.agency?.name || 'Join'"
    form-title="Get Started"
    form-subtitle="Adaptive Intake"
    :sidebar-steps="hubSidebarSteps"
    :progress-index="0"
    :wide="true"
    cover-mode
  >
    <template #header-left><router-link v-if="publicWebsitePath(agencySlug)" :to="publicWebsitePath(agencySlug)">← Back to website</router-link></template>
    <div v-if="loading || redirecting" class="df-loading">
      {{ redirecting ? 'Taking you to intake…' : 'Loading…' }}
    </div>
    <div v-else-if="loadError" class="df-banner df-banner--warn">{{ loadError }}</div>

    <div v-else class="ai-join-hub">
      <p class="hub-eyebrow">Join us</p>
      <h1 class="ai-page-title">Find your next step.</h1>
      <p class="ai-page-lead">
        Choose the type of support you are looking for with {{ config?.agency?.name || 'our team' }}.
      </p>

      <div v-if="services.length" class="ai-pathway-grid" aria-label="Available services">
        <button
          v-for="svc in services"
          :key="svc.serviceType"
          type="button"
          class="ai-pathway-card"
          @click="goToService(svc.serviceType)"
        >
          <img class="hub-service-image" :src="imageForService(svc.serviceType)" alt="" />
          <div class="ai-pathway-card-top">
            <span class="ai-pathway-card-icon" aria-hidden="true">{{ iconForService(svc.serviceType) }}</span>
          </div>
          <h2 class="ai-pathway-card-title">{{ svc.displayName }}</h2>
          <p class="ai-pathway-card-desc">{{ svc.introBlurb }}</p>
          <span class="ai-pathway-card-cta">Explore {{ svc.displayName }} →</span>
        </button>
      </div>
      <p v-else>No online registration options are available right now.</p>
      <div class="hub-help"><h2>Not sure where to begin?</h2><p>Our team can help you choose the right service.</p><router-link :to="`/${encodeURIComponent(agencySlug)}/support`">Talk with our team →</router-link></div>
    </div>
  </AdaptiveIntakeShell>
</template>

<script setup>
import { pickTenantWelcomeUrl } from '../../utils/tenantBrandAssets';
import {publicWebsitePath} from '../../utils/publicWebsitePath';
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { AdaptiveIntakeShell } from '../../components/adaptive-intake';

const route = useRoute();
const router = useRouter();

const agencySlug = computed(() =>
  String(route.params.organizationSlug || route.params.agencySlug || '').trim()
);

const loading = ref(true);
const redirecting = ref(false);
const loadError = ref('');
const config = ref(null);

const services = computed(() =>
  Array.isArray(config.value?.intakeServices) ? config.value.intakeServices : []
);

const scenicUrl = computed(() => pickTenantWelcomeUrl(agencySlug.value));
const hubTrust = [{ icon: 'shield', label: 'Secure online registration' }, { icon: 'check', label: 'Real people. Personal support.' }];
function imageForService(type) { return { counseling: '/assets/nlu/family.png', tutoring: '/assets/nlu/learning.png', coaching: '/assets/WelcomeImages/scenic/regular2.webp', consulting: '/assets/WelcomeImages/scenic/regular3.webp' }[type] || scenicUrl.value; }

const hubSidebarSteps = [{ id: 'service', label: 'Choose a service', hint: 'You are here' }];

function iconForService(serviceType) {
  if (serviceType === 'tutoring') return '📚';
  if (serviceType === 'coaching') return '🎯';
  if (serviceType === 'consulting') return '💼';
  return '💚';
}

function joinServicePath(serviceType) {
  const slug = agencySlug.value;
  if (!slug || !serviceType) return '';
  if (route.params.organizationSlug) {
    return `/${encodeURIComponent(slug)}/join/${encodeURIComponent(serviceType)}`;
  }
  return `/join/${encodeURIComponent(slug)}/${encodeURIComponent(serviceType)}`;
}

function goToService(serviceType) {
  const path = joinServicePath(serviceType);
  if (path) router.push({ path, query: route.query });
}

async function loadConfig() {
  loading.value = true;
  loadError.value = '';
  redirecting.value = false;
  try {
    if (!agencySlug.value) {
      loadError.value = 'Missing organization.';
      return;
    }
    const { data } = await api.get(`/public/adaptive-intake/${agencySlug.value}`);
    config.value = data;
    if (services.value.length === 1) {
      redirecting.value = true;
      const svc = services.value[0]?.serviceType || 'counseling';
      await router.replace({ path: joinServicePath(svc), query: route.query });
    }
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || 'Unable to load intake options.';
  } finally {
    loading.value = false;
  }
}

onMounted(loadConfig);
watch(agencySlug, loadConfig);
</script>

<style scoped>
.ai-join-hub { width: 100%; max-width: 1120px; margin: 0 auto; padding: clamp(22px,4vw,48px); border-radius: 24px; background: #ffffffed; box-shadow: 0 20px 60px #12253618; text-align: left; }
.hub-eyebrow { color: #294e61; text-transform: uppercase; letter-spacing: .14em; font-size: 13px; font-weight: 800; }
.ai-page-title { color: #173044; font-size: clamp(32px,4vw,52px); line-height: 1.1; }
.ai-page-lead { color: #425566; max-width: 640px; line-height: 1.7; }
.ai-pathway-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px; margin-top: 28px; }
.public-service-hub .ai-pathway-card { white-space: normal; min-width: 0; display: flex; flex-direction: column; position: relative; padding: 0 24px 26px; overflow: hidden; border: 1px solid #d2dfdf; border-radius: 18px; background: #fff; color: #173044; text-align: left; font: inherit; cursor: pointer; box-shadow: 0 6px 18px #1730440a; }
.ai-pathway-card:hover { border-color: var(--df-primary); box-shadow: 0 8px 22px #17304420; }
.ai-pathway-card:focus-visible { outline: 3px solid #2563eb; outline-offset: 4px; }
.hub-service-image { width: calc(100% + 48px); max-width: none; height: 180px; object-fit: cover; margin: 0 -24px 20px; }
.ai-pathway-card-top { margin-bottom: 12px; }
.public-service-hub .ai-pathway-card-title { color: #173044; font-size: 25px; line-height: 1.2; margin: 0 0 12px; }
.public-service-hub .ai-pathway-card-desc { white-space: normal; overflow-wrap: anywhere; color: #425566; line-height: 1.6; margin: 0 0 20px; }
.ai-pathway-card-cta { margin-top: auto; color: #173044; font-weight: 750; }
.hub-help { margin-top: 32px; border-top: 1px solid #d2dfdf; padding-top: 24px; }
.hub-help h2 { font-size: 22px; color: #173044; }
.hub-help a { color: #173044; font-weight: 700; text-decoration: underline; }
@media (max-width: 600px) { .ai-pathway-grid { grid-template-columns: 1fr; } .ai-join-hub { padding: 22px 18px; } }
</style>
