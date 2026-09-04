<template>
  <div class="office-intake-queue-view">
    <header class="oiq-header">
      <div>
        <p class="oiq-eyebrow">Office Client Management</p>
        <h1 class="oiq-title">Intake Queue</h1>
        <p class="oiq-subtitle">New office intakes awaiting review and assignment.</p>
      </div>
      <div class="ocm-hub-header-actions">
        <nav class="ocm-hub-switcher" aria-label="Office tools">
          <template v-for="item in officeNavLinks" :key="item.key">
            <span v-if="item.isActive" class="ocm-hub-switcher-btn is-active" aria-current="page">{{ item.label }}</span>
            <router-link v-else class="ocm-hub-switcher-btn" :to="item.to">{{ item.label }}</router-link>
          </template>
        </nav>
      </div>
    </header>
    <OfficeIntakeQueuePanel />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import OfficeIntakeQueuePanel from '../../components/admin/OfficeIntakeQueuePanel.vue';
import { useOfficeClientAgency } from '../../composables/useOfficeClientAgency.js';
import { buildOfficeQuickNavLinks } from '../../utils/officeQuickNav.js';
import '../../styles/officeQuickNav.css';

const { orgPath } = useOfficeClientAgency();
const officeNavLinks = computed(() => buildOfficeQuickNavLinks({ orgPath, current: 'intake' }));
</script>

<style scoped>
.office-intake-queue-view {
  padding: 20px 24px 60px;
  max-width: 1600px;
  margin: 0 auto;
}
.oiq-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1.25rem;
}
.oiq-eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #5b6b63;
}
.oiq-title {
  margin: 0.15rem 0;
  font-size: 1.75rem;
  color: #14352a;
}
.oiq-subtitle {
  margin: 0;
  color: #5b6b63;
}
</style>
