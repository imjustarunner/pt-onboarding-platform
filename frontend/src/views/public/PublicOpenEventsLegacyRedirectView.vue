<template>
  <div class="legacy-redirect">
    <p v-if="message" class="muted">{{ message }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();
const message = ref('Opening program events…');

onMounted(async () => {
  const agency = String(route.params.agencySlug || '').trim();
  if (!agency) {
    message.value = 'Missing agency.';
    return;
  }
  try {
    const res = await api.get(`/public/skill-builders/agency/${encodeURIComponent(agency)}/skill-builders-program`, {
      skipGlobalLoading: true
    });
    const portalSlug = String(res.data?.portalSlug || '').trim().toLowerCase();
    if (portalSlug) {
      await router.replace(`/open-events/${agency}/programs/${portalSlug}/events`);
      return;
    }
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || '';
    message.value = msg || 'Could not resolve program. Check the program slug on the affiliated program.';
    return;
  }
  message.value = 'Could not resolve program.';
});
</script>

<style scoped>
.legacy-redirect {
  max-width: 520px;
  margin: 48px auto;
  padding: 0 16px;
}
.muted {
  color: var(--text-secondary, #64748b);
}
</style>
