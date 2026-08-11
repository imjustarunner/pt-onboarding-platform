<template>
  <div class="mop-page">
    <header class="mop-header">
      <div>
        <h1>Master Office Paper</h1>
        <p class="muted mop-sub">
          Branded printable in-depth intake packet for staff to download and hand to clients/guardians.
          Same method as the school packet — separate content channel (no school ROI).
        </p>
      </div>
      <div class="mop-actions">
        <router-link class="btn btn-secondary btn-sm" :to="digitalTo">Master Office Digital</router-link>
        <router-link class="btn btn-secondary btn-sm" :to="backTo">Back to Clients &amp; Guardians</router-link>
      </div>
    </header>

    <div v-if="!agencyId" class="error">No agency context. Open Workforce Ops from an agency portal.</div>
    <OfficePacketTemplateEditor v-else :agency-id="agencyId" />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import OfficePacketTemplateEditor from '../../components/office/OfficePacketTemplateEditor.vue';

const route = useRoute();
const agencyStore = useAgencyStore();
const orgSlug = computed(() =>
  typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : ''
);
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || route.query?.agencyId || 0));
const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/schedule` : '/schedule'));
const digitalTo = computed(() =>
  orgSlug.value ? `/${orgSlug.value}/admin/master-office-form` : '/admin/master-office-form'
);
</script>

<style scoped>
.mop-page { padding: 24px 40px 48px; max-width: 1600px; margin: 0 auto; }
.mop-header { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.mop-header h1 { margin: 0; }
.mop-sub { max-width: 48rem; margin: 6px 0 0; line-height: 1.45; }
.mop-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.muted { color: #6b7280; }
.error { color: #b91c1c; }
</style>
