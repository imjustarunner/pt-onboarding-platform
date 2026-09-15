<template>
  <section>
    <p v-if="loading" role="status">Loading business details…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!company">Choose a company in Settings to edit its business details.</p>
    <p v-else-if="!isRootTenant(company)">{{ company.name }} · {{ organizationKindLabel(company) }}. Open the parent company to manage business identity, services, features, and billing.</p>
    <template v-else>
      <h2>{{ company.name }} · Business details</h2>
      <p>Identity, contact information, branding, and communication preferences. Use Settings search to jump directly to an area.</p>
      <AgencyManagement :key="company.id" :embedded-org-id="company.id" :embedded-tab="embeddedTab" workspace-mode />
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import AgencyManagement from './AgencyManagement.vue';
import { isRootTenant, organizationKindLabel } from '../../navigation/organizationKinds';
const props = defineProps({ embeddedOrgId: { type: [Number, String], default: null }, embeddedTab: { type: String, default: 'general' }, scopedAgencyId: { type: [Number, String], default: null } });
const store = useAgencyStore(), company = ref(null), loading = ref(false), error = ref('');
const id = computed(() => Number(props.embeddedOrgId || props.scopedAgencyId || store.currentAgency?.id) || null);
let request = 0;
watch(id, async value => {
  const current = ++request;
  company.value = null; error.value = ''; loading.value = !!value;
  if (!value) return;
  try { const { data } = await api.get(`/agencies/${value}`); if (current === request) company.value = data.agency || data; }
  catch { if (current === request) error.value = 'We could not load this company. Please reopen its settings.'; }
  finally { if (current === request) loading.value = false; }
}, { immediate: true });
</script>
