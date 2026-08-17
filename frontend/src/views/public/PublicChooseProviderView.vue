<template>
  <div class="choose-provider-page">
    <div class="choose-provider-inner">
      <ChooseProviderDirectory
        mode="public"
        title="Choose a provider"
        :lead="pageLead"
        :providers="providers"
        :loading="loading"
        :error="error"
        @prefer="onPrefer"
        @waitlist="onWaitlist"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import ChooseProviderDirectory from '../../components/public/ChooseProviderDirectory.vue';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl.js';

const route = useRoute();
const router = useRouter();
const agencySlug = computed(() => String(route.params.organizationSlug || '').trim());

const loading = ref(true);
const error = ref('');
const providers = ref([]);
const fullIntake = ref(null);

const pageLead = computed(() =>
  'Search and sort providers by openings. Choosing a slot is a preference — not a booking. First come first served; expect a callback within 24–48 hours. Waitlist requests require the full intake packet.'
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/public/agency-services/${encodeURIComponent(agencySlug.value)}/choose-providers`);
    providers.value = Array.isArray(res.data?.providers) ? res.data.providers : [];
    fullIntake.value = res.data?.fullIntake || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load providers';
    providers.value = [];
  } finally {
    loading.value = false;
  }
}

function intakeUrlForProvider(provider, { waitlist = false } = {}) {
  const publicKey = fullIntake.value?.publicKey;
  if (!publicKey) return null;
  const base = buildPublicIntakeUrl(publicKey);
  const url = new URL(base, window.location.origin);
  if (provider?.id) url.searchParams.set('providerId', String(provider.id));
  if (waitlist) url.searchParams.set('waitlist', '1');
  return `${url.pathname}${url.search}`;
}

function onPrefer(provider) {
  const path = intakeUrlForProvider(provider, { waitlist: false });
  if (path) {
    router.push(path);
    return;
  }
  router.push({
    path: `/${agencySlug.value}/join/counseling`,
    query: { providerId: String(provider.id) }
  });
}

function onWaitlist(provider) {
  const path = intakeUrlForProvider(provider, { waitlist: true });
  if (!path) {
    error.value = 'Full intake is required to join a waitlist. A published office intake packet was not found for this organization.';
    return;
  }
  router.push(path);
}

onMounted(load);
</script>

<style scoped>
.choose-provider-page {
  min-height: 100vh;
  background: #f4f7fa;
  padding: 1.5rem 1rem 3rem;
}
.choose-provider-inner {
  max-width: 1100px;
  margin: 0 auto;
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  padding: 1.25rem 1.35rem 1.75rem;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
</style>
