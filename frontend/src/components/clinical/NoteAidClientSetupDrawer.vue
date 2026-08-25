<template>
  <div v-if="open" class="na-drawer-backdrop" @click.self="emit('close')">
    <aside class="na-drawer" role="dialog" aria-label="Client setup">
      <header class="na-drawer-head">
        <div>
          <h3>Set up chart for {{ clientLabel }}</h3>
          <p class="muted">Import structured plan/intake now, or skip and continue documenting.</p>
        </div>
        <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
      </header>
      <div class="na-drawer-actions">
        <button type="button" class="na-btn-primary" @click="emit('import-plan')">
          Import treatment plan
        </button>
        <button type="button" class="na-btn-outline" @click="emit('import-intake')">
          Import intake
        </button>
        <button type="button" class="na-link-btn" @click="emit('skip')">
          Skip for now
        </button>
      </div>
    </aside>
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
.na-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  z-index: 75;
  display: flex;
  justify-content: flex-end;
}
.na-drawer {
  width: min(420px, 100%);
  background: #fff;
  height: 100%;
  padding: 20px;
  box-shadow: -12px 0 40px rgba(15, 23, 42, 0.15);
}
.na-drawer-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.na-drawer-head h3 {
  margin: 0 0 6px;
  font-size: 1.05rem;
}
.muted {
  margin: 0;
  color: #64748b;
  font-size: 0.85rem;
}
.na-drawer-actions {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
