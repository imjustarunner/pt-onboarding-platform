<template>
  <div class="nsb-root">
    <button
      type="button"
      class="nsb-trigger"
      aria-label="Quick navigation"
      title="Quick Nav — ⌘/Ctrl+K"
      @click="openNav"
    >
      <svg class="nsb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" stroke-linecap="round" />
      </svg>
      <span class="nsb-hint" aria-hidden="true">Quick Nav</span>
    </button>
  </div>
</template>

<script setup>
import { useCommandPalette } from '../composables/useCommandPalette';

const { openPalette } = useCommandPalette();

function openNav() {
  openPalette('nav');
}
</script>

<style scoped>
.nsb-root {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.nsb-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px 0 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-card);
  color: var(--link-color);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.nsb-trigger:hover {
  background: var(--brand-tint);
  border-color: var(--link-color);
  box-shadow: 0 2px 8px rgba(13, 148, 136, 0.15);
}
.nsb-ic { width: 15px; height: 15px; flex-shrink: 0; }
.nsb-hint { font-size: 13px; }

@media (max-width: 900px) {
  .nsb-hint { display: none; }
  .nsb-trigger { width: 36px; justify-content: center; padding: 0; }
}
</style>
