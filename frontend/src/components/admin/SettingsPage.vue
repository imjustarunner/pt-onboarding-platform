<template>
  <div class="settings-page">
    <div class="page-header">
      <div class="page-title">
        <p class="scope-label">{{ agency ? "Organization settings" : "Plot Twist Co · Platform settings" }}</p><h1>{{ agency?.name || "Platform settings" }}</h1>
        <div class="subtitle">{{ agency ? "Manage this agency’s people, services, branding, and payments." : "Manage shared platform defaults and organizations." }}</div>
      </div>
      <div class="page-actions">
        <AppearanceSelect />
        <router-link v-if="agency && canBill" class="btn btn-primary" :to="{ path: agency.slug ? `/${agency.slug}/admin/family-billing` : '/admin/family-billing', query: { tab: 'setup', agencyId: String(agency.id) } }">Stripe & payment setup</router-link>
        <button @click="goBack" class="btn btn-secondary">Back</button>
      </div>
    </div>

    <!-- Reuse the existing SettingsModal content, but in page mode -->
    <div class="settings-page-body">
      <SettingsModal
      :embedded="true"
      :show-tenant-context="true"
      :initial-category-id="initialCategoryId"
      :initial-item-id="initialItemId"
    />
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { canAccessMedicalBilling } from '../../config/medicalBillingAccess.js';
import { useRouter, useRoute } from 'vue-router';
import SettingsModal from './SettingsModal.vue';
import AppearanceSelect from '../AppearanceSelect.vue';
import { normalizeSettingsDestination } from '../../navigation/settingsDestinations';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const agency = computed(() => agencyStore.currentAgency);
const canBill = computed(() => canAccessMedicalBilling(authStore.user, agency.value?.id));
const router = useRouter();
const route = useRoute();

// Allow deep-linking to a specific settings section via ?category=workflow&item=hiring-prehire
const destination = computed(() => normalizeSettingsDestination(route.query));
const initialItemId = computed(() => destination.value.item || null);
const initialCategoryId = computed(() => destination.value.category || null);
watch(() => route.query, query => {
  const target = normalizeSettingsDestination(query);
  if (query.item !== target.item || query.category !== target.category || query.agencyTab !== target.agencyTab) {
    const next = { ...query, category: target.category, item: target.item };
    if (target.agencyTab) next.agencyTab = target.agencyTab; else delete next.agencyTab;
    router.replace({ query: next });
  }
}, { immediate: true });

const goBack = () => {
  router.back();
};
</script>

<style scoped>
.scope-label { font-size: .78rem; text-transform:uppercase; letter-spacing:.1em; color:var(--link-color); font-weight:700; margin-bottom:8px; }
.page-actions { display:flex; flex-wrap:wrap; gap:10px; }

.settings-page {
  padding: 18px;
  width: 100%;
  max-width: none;
  margin: 0;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.page-title h1 {
  margin: 0;
  color: var(--text-primary);
}

.subtitle {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

.settings-page-body {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  overflow: hidden;
  box-shadow: var(--shadow);
}
</style>
