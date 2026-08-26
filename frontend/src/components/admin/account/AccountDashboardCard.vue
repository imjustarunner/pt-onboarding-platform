<template>
  <section :id="sectionId" class="acct-card">
    <header class="acct-card-head">
      <div class="acct-card-head-main">
        <span v-if="icon" class="acct-card-icon" aria-hidden="true" v-html="iconSvg" />
        <div class="acct-card-head-text">
          <h3 class="acct-card-title">{{ title }}</h3>
          <p v-if="subtitle" class="acct-card-subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div class="acct-card-actions">
        <slot name="actions" />
        <template v-if="canEdit">
          <button
            v-if="!editing"
            type="button"
            class="acct-btn acct-btn--ghost"
            @click="$emit('edit')"
          >
            <svg class="acct-btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ editLabel }}
          </button>
          <template v-else>
            <button
              type="button"
              class="acct-btn acct-btn--primary"
              :disabled="saving"
              @click="$emit('save')"
            >
              {{ saving ? 'Saving…' : saveLabel }}
            </button>
            <button
              type="button"
              class="acct-btn acct-btn--ghost"
              :disabled="saving"
              @click="$emit('cancel')"
            >
              Cancel
            </button>
          </template>
        </template>
      </div>
    </header>
    <div class="acct-card-body">
      <slot />
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  sectionId: { type: String, default: '' },
  canEdit: { type: Boolean, default: false },
  editing: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  saveLabel: { type: String, default: 'Save' },
  editLabel: { type: String, default: 'Edit' },
  /** Optional icon key: building | shield | clipboard | lock | globe | key */
  icon: { type: String, default: '' }
});

defineEmits(['edit', 'save', 'cancel']);

const ICONS = {
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 9h.01M15 9h.01M9 13h.01M15 13h.01" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke-linecap="round"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke-linecap="round"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke-linecap="round"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="4"/><path d="M10.5 12.5L21 2m-4 0l4 4M15 6l2 2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

const iconSvg = computed(() => ICONS[String(props.icon || '').toLowerCase()] || '');
</script>

<style scoped>
.acct-card {
  background: #fff;
  border: 1px solid #e8ecef;
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  overflow: hidden;
  scroll-margin-top: 96px;
}

.acct-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 0;
}

.acct-card-head-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.acct-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #eef6f3;
  color: #2e5d50;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.acct-card-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.acct-card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.acct-card-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.35;
}

.acct-card-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
}

.acct-card-body {
  padding: 16px 22px 22px;
}

.acct-btn {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.acct-btn-ico {
  width: 14px;
  height: 14px;
}

.acct-btn--ghost {
  background: #fff;
  color: #2e5d50;
  border-color: #c5ddd4;
}

.acct-btn--ghost:hover:not(:disabled) {
  background: #f3faf7;
}

.acct-btn--primary {
  background: #2e5d50;
  color: #fff;
}

.acct-btn--primary:hover:not(:disabled) {
  background: #244a40;
}

.acct-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
