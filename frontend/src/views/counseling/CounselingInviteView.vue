<template>
  <div class="cinv">
    <h1>Join counseling session</h1>
    <p v-if="loading">Opening invite…</p>
    <p v-else-if="error" class="cinv__error">{{ error }}</p>
    <p v-else>Taking you into the session…</p>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { acceptCounselingInvite } from '../../services/counselingApi.js';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const loading = ref(true);
const error = ref('');

const orgSlug = computed(() => {
  const fromRoute = String(route.params.organizationSlug || '').trim();
  if (fromRoute) return fromRoute;
  const a = agencyStore.currentAgency;
  return String(a?.slug || a?.portal_url || a?.portalUrl || '').trim();
});

onMounted(async () => {
  try {
    const token = String(route.params.token || '').trim();
    const data = await acceptCounselingInvite(token);
    const key = data?.session?.publicId || data?.session?.id;
    if (!key) throw new Error('Invalid invite response');
    const path = orgSlug.value
      ? `/${orgSlug.value}/counseling/session/${key}`
      : `/counseling/session/${key}`;
    await router.replace(path);
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Unable to open invite';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.cinv {
  max-width: 420px;
  margin: 3rem auto;
  padding: 1.5rem;
  text-align: center;
}
.cinv__error {
  color: #b91c1c;
}
</style>
