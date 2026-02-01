<template>
  <div class="wrap">
    <div v-if="organizationId && providerUserId" data-tour="school-provider-profile-page">
      <ProviderSchoolProfile
        :school-organization-id="organizationId"
        :provider-user-id="providerUserId"
        :school-name="organizationName"
        @open-client="openClient"
      />
    </div>
    <div v-else class="empty">Organization not loaded.</div>

    <ClientModal
      v-if="selectedClient && organizationId"
      :client="selectedClient"
      :school-organization-id="organizationId"
      @close="selectedClient = null"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import ProviderSchoolProfile from '../../components/school/redesign/ProviderSchoolProfile.vue';
import ClientModal from '../../components/school/redesign/ClientModal.vue';

const route = useRoute();
const organizationStore = useOrganizationStore();

const selectedClient = ref(null);

const providerUserId = computed(() => {
  const v = parseInt(route.params.providerUserId, 10);
  return Number.isFinite(v) && v > 0 ? v : null;
});

const organizationId = computed(() => {
  return organizationStore.organizationContext?.id || organizationStore.currentOrganization?.id || null;
});

const organizationName = computed(() => {
  const org = organizationStore.organizationContext || organizationStore.currentOrganization;
  return org?.official_name?.trim() || org?.name || '';
});

const openClient = (c) => {
  selectedClient.value = c;
};

onMounted(async () => {
  // Ensure org context is loaded (route is slug-prefixed).
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) {
    if (organizationStore.organizationContext?.slug !== slug) {
      await organizationStore.fetchBySlug(slug);
    }
  }
});
</script>

<style scoped>
.wrap {
  width: 100%;
}
.empty {
  color: var(--text-secondary);
  padding: 20px 0;
}
</style>

