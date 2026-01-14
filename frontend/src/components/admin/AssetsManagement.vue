<template>
  <div class="assets-management">
    <div class="assets-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="['tab-button', { active: activeTab === tab.id }]"
      >
        {{ tab.label }}
      </button>
    </div>
    
    <div class="assets-content">
      <IconLibraryView v-if="activeTab === 'icons'" />
      <FontManager v-if="activeTab === 'fonts'" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import IconLibraryView from '../../views/admin/IconLibraryView.vue';
import FontManager from './FontManager.vue';

const activeTab = ref('icons');

const tabs = [
  { id: 'icons', label: 'Icons' },
  { id: 'fonts', label: 'Fonts' }
];
</script>

<style scoped>
.assets-management {
  width: 100%;
}

.assets-tabs {
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

.assets-content {
  width: 100%;
}
</style>
