<template>
  <div class="branding-templates-management">
    <div class="branding-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="['tab-button', { active: activeTab === tab.id }]"
      >
        {{ tab.label }}
      </button>
    </div>
    
    <div class="branding-content">
      <BrandingConfig v-if="activeTab === 'branding'" />
      <BrandingTemplateManager v-if="activeTab === 'templates'" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import BrandingConfig from './BrandingConfig.vue';
import BrandingTemplateManager from './BrandingTemplateManager.vue';

const activeTab = ref('branding');

const tabs = [
  { id: 'branding', label: 'Branding' },
  { id: 'templates', label: 'Templates' }
];
</script>

<style scoped>
.branding-templates-management {
  width: 100%;
}

.branding-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 0;
}

.tab-button {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--text-primary);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--accent);
}

.branding-content {
  width: 100%;
}
</style>
