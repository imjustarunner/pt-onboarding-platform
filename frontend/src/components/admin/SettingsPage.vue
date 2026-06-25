<template>
  <div class="settings-page">
    <div class="page-header">
      <div class="page-title">
        <h1>Settings</h1>
        <div class="subtitle">Manage platform and organization settings.</div>
      </div>
      <div class="page-actions">
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
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import SettingsModal from './SettingsModal.vue';

const router = useRouter();
const route = useRoute();

// Allow deep-linking to a specific settings section via ?category=workflow&item=hiring-prehire
const initialItemId = computed(() => route.query.item || null);
const initialCategoryId = computed(() => route.query.category || null);

const goBack = () => {
  router.back();
};
</script>

<style scoped>
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

