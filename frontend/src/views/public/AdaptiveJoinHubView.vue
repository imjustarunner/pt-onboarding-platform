<template>
  <AdaptiveIntakeShell
    class="ai-shell-host--join-flow"
    :branding="config?.branding"
    :program-title="config?.agency?.name || 'Join'"
    form-title="Get Started"
    form-subtitle="Adaptive Intake"
    :sidebar-steps="hubSidebarSteps"
    :progress-index="0"
    :wide="true"
    :cover-mode="loading || !!loadError || redirecting"
  >
    <div v-if="loading || redirecting" class="df-loading">
      {{ redirecting ? 'Taking you to intake…' : 'Loading…' }}
    </div>
    <div v-else-if="loadError" class="df-banner df-banner--warn">{{ loadError }}</div>

    <div v-else class="ai-join-hub">
      <h1 class="ai-page-title">What service are you interested in?</h1>
      <p class="ai-page-lead">
        Choose the type of support you are looking for with {{ config?.agency?.name || 'our team' }}.
      </p>

      <div class="ai-pathway-grid">
        <button
          v-for="svc in services"
          :key="svc.serviceType"
          type="button"
          class="ai-pathway-card"
          @click="goToService(svc.serviceType)"
        >
          <div class="ai-pathway-card-top">
            <span class="ai-pathway-card-icon" aria-hidden="true">{{ iconForService(svc.serviceType) }}</span>
          </div>
          <h2 class="ai-pathway-card-title">{{ svc.displayName }}</h2>
          <p class="ai-pathway-card-desc">{{ svc.introBlurb }}</p>
          <span class="ai-pathway-card-cta">Start intake →</span>
        </button>
      </div>
    </div>
  </AdaptiveIntakeShell>
</template>

<script setup>
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
  if (path) router.push(path);
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
    if (services.value.length <= 1) {
      redirecting.value = true;
      const svc = services.value[0]?.serviceType || 'counseling';
      await router.replace(joinServicePath(svc));
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
.ai-join-hub {
  max-width: 52rem;
}
</style>
