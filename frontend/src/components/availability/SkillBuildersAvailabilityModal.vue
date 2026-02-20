<template>
  <div class="sbam-overlay" @click.self="$emit('close')">
    <div class="sbam-modal" role="dialog" aria-modal="true" aria-labelledby="sbam-title">
      <div class="sbam-header">
        <h2 id="sbam-title" style="margin: 0;">Skill Builders availability</h2>
        <button type="button" class="sbam-close" aria-label="Close" @click="$emit('close')">×</button>
      </div>
      <div class="sbam-body">
        <SkillBuildersAvailabilityPanel :agency-id="props.agencyId" :show-title="false" />
      </div>
    </div>
  </div>
</template>

<script setup>
import SkillBuildersAvailabilityPanel from './SkillBuildersAvailabilityPanel.vue';

const props = defineProps({
  agencyId: { type: [Number, String, null], default: null }
});

defineEmits(['close']);
</script>

<style scoped>
.sbam-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
}
.sbam-modal {
  width: 96%;
  max-width: 1100px;
  max-height: 90vh;
  overflow: hidden;
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}
.sbam-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
.sbam-close {
  background: transparent;
  border: none;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
}
.sbam-body {
  padding: 16px 18px;
  overflow: auto;
}
</style>

