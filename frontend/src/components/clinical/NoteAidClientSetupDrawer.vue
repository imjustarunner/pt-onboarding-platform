<template>
  <div v-if="open" class="na-setup-backdrop" @click.self="emit('close')">
    <div class="na-setup-modal" role="dialog" aria-labelledby="na-setup-chart-title" aria-modal="true">
      <header class="na-setup-head">
        <div>
          <p class="na-setup-eyebrow">New client</p>
          <h3 id="na-setup-chart-title">Set up chart for {{ clientLabel }}</h3>
          <p class="na-setup-sub">
            Import a structured plan or intake now, or skip and keep documenting.
          </p>
        </div>
        <button type="button" class="na-setup-close" aria-label="Close" @click="emit('close')">
          ×
        </button>
      </header>

      <div class="na-setup-actions">
        <button type="button" class="na-setup-card" @click="emit('import-plan')">
          <span class="na-setup-card-title">Import treatment plan</span>
          <span class="na-setup-card-desc">Paste or upload a plan to seed goals and objectives.</span>
        </button>
        <button type="button" class="na-setup-card" @click="emit('import-intake')">
          <span class="na-setup-card-title">Import intake</span>
          <span class="na-setup-card-desc">Bring in assessment content and primary diagnosis.</span>
        </button>
      </div>

      <footer class="na-setup-foot">
        <button type="button" class="na-setup-skip" @click="emit('skip')">
          Skip for now
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { clientDisplayName } from '../../utils/noteAidTreatmentHelpers.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  client: { type: Object, default: null }
});

const emit = defineEmits(['close', 'import-plan', 'import-intake', 'skip']);

const clientLabel = computed(
  () => clientDisplayName(props.client) || props.client?.initials || 'client'
);
</script>

<style scoped>
.na-setup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(2px);
}
.na-setup-modal {
  width: min(440px, 100%);
  background: #fff;
  border-radius: 16px;
  padding: 22px 22px 18px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
  border: 1px solid rgba(15, 23, 42, 0.06);
}
.na-setup-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}
.na-setup-eyebrow {
  margin: 0 0 4px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.na-setup-head h3 {
  margin: 0 0 6px;
  font-size: 1.2rem;
  font-weight: 650;
  color: #0f172a;
  line-height: 1.25;
}
.na-setup-sub {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.4;
  max-width: 34ch;
}
.na-setup-close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: #f1f5f9;
  color: #475569;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}
.na-setup-close:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.na-setup-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.na-setup-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.na-setup-card:hover {
  border-color: #94a3b8;
  background: #fff;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
}
.na-setup-card-title {
  font-size: 0.98rem;
  font-weight: 600;
  color: #0f172a;
}
.na-setup-card-desc {
  font-size: 0.82rem;
  color: #64748b;
  line-height: 1.35;
}
.na-setup-foot {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}
.na-setup-skip {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
}
.na-setup-skip:hover {
  color: #0f172a;
  background: #f1f5f9;
}
</style>
