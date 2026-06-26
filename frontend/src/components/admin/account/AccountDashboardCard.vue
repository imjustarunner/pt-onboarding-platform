<template>
  <section :id="sectionId" class="acct-card">
    <header class="acct-card-head">
      <div class="acct-card-head-text">
        <h3 class="acct-card-title">{{ title }}</h3>
        <p v-if="subtitle" class="acct-card-subtitle">{{ subtitle }}</p>
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
            Edit
          </button>
          <template v-else>
            <button
              type="button"
              class="acct-btn acct-btn--primary"
              :disabled="saving"
              @click="$emit('save')"
            >
              {{ saving ? 'Saving…' : 'Save' }}
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
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  sectionId: { type: String, default: '' },
  canEdit: { type: Boolean, default: false },
  editing: { type: Boolean, default: false },
  saving: { type: Boolean, default: false }
});

defineEmits(['edit', 'save', 'cancel']);
</script>

<style scoped>
.acct-card {
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);
  overflow: hidden;
}

.acct-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 0;
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
}

.acct-card-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.acct-card-body {
  padding: 16px 22px 22px;
}

.acct-btn {
  border: none;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.acct-btn--ghost {
  background: #f1f5f9;
  color: #334155;
}

.acct-btn--ghost:hover:not(:disabled) {
  background: #e2e8f0;
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
