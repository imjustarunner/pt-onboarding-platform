<template>
  <div class="cntp">
    <header class="cntp-head">
      <h3 class="cntp-title">What type of note?</h3>
      <p class="cntp-sub">Add a contact or miscellaneous note here. Open session notes from the client’s to-do list.</p>
    </header>

    <div class="cntp-grid">
      <button
        v-for="opt in options"
        :key="opt.id"
        type="button"
        class="cntp-card"
        :class="[`cntp-card--${opt.tone || 'default'}`, { 'is-disabled': opt.disabled }]"
        :disabled="opt.disabled"
        @click="$emit('select', opt)"
      >
        <span class="cntp-card-label">{{ opt.label }}</span>
        <span class="cntp-card-hint">{{ opt.hint }}</span>
        <span v-if="opt.badge" class="cntp-card-badge">{{ opt.badge }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  isLearning: { type: Boolean, default: false },
  isTutoring: { type: Boolean, default: false }
});

defineEmits(['select']);

const options = [
    {
      id: 'contact',
      label: 'Contact note',
      hint: 'Document a call, email, or message with a contact.',
      tone: 'manual',
      path: 'manual-contact'
    },
    {
      id: 'misc',
      label: 'Miscellaneous note',
      hint: 'Freeform chart note (manual).',
      tone: 'manual',
      path: 'manual-misc'
    }
];
</script>

<style scoped>
.cntp { padding: 8px 4px 16px; }
.cntp-head { margin-bottom: 14px; }
.cntp-title { margin: 0 0 4px; font-size: 1.15rem; font-weight: 800; color: #0f172a; }
.cntp-sub { margin: 0; font-size: 13px; color: #64748b; line-height: 1.45; }
.cntp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.cntp-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  text-align: left;
  padding: 14px 14px 12px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  font: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.cntp-card:hover:not(:disabled) {
  border-color: #2d6a4f;
  box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.12);
}
.cntp-card--manual { border-left: 3px solid #0e7490; }
.cntp-card--aid { border-left: 3px solid #2d6a4f; }
.cntp-card.is-disabled,
.cntp-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.cntp-card-label { font-weight: 750; font-size: 14px; color: #0f172a; }
.cntp-card-hint { font-size: 12px; color: #64748b; line-height: 1.4; }
.cntp-card-badge {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #92400e;
  background: #fef3c7;
  padding: 2px 7px;
  border-radius: 999px;
}
</style>
