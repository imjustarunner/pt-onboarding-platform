<template>
  <div
    v-if="canToggleDisplayMode"
    class="client-display-mode-toggle"
    title="Toggle how clients are identified"
  >
    <button
      type="button"
      :class="['client-display-mode-btn', { active: displayMode === 'initials' }]"
      title="Show initials only (private)"
      @click="displayMode = 'initials'"
    >
      Initials
    </button>
    <button
      type="button"
      :class="['client-display-mode-btn', { active: displayMode === 'full_name' }]"
      title="Show full name with initials"
      @click="displayMode = 'full_name'"
    >
      Name
    </button>
    <button
      type="button"
      :class="['client-display-mode-btn', { active: displayMode === 'code' }]"
      title="Show client code"
      @click="displayMode = 'code'"
    >
      Code
    </button>
  </div>
</template>

<script setup>
import { useClientDisplayMode } from '../../composables/useClientDisplayMode';

const { displayMode, canToggleDisplayMode } = useClientDisplayMode();
</script>

<style scoped>
.client-display-mode-toggle {
  display: flex;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: #fff;
}

.client-display-mode-btn {
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  background: transparent;
  border: none;
  border-right: 1px solid var(--border, #e2e8f0);
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  transition: background 0.15s, color 0.15s;
}

.client-display-mode-btn:last-child {
  border-right: none;
}

.client-display-mode-btn.active {
  background: var(--color-primary, var(--primary, #2d6a4f));
  color: #fff;
}

.client-display-mode-btn:hover:not(.active) {
  background: var(--bg-alt, #f1f5f9);
}
</style>
