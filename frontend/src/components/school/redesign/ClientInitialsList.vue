<template>
  <div class="chips">
    <button
      v-for="c in clients"
      :key="c.id"
      class="chip"
      type="button"
      @click="$emit('select', c)"
      :title="chipTitle(c)"
    >
      {{ displayId(c) }}
      <span v-if="Number(c.unread_notes_count || 0) > 0" class="dot" aria-hidden="true" />
    </button>
    <div v-if="clients.length === 0" class="empty">No assigned clients.</div>
  </div>
</template>

<script setup>
const props = defineProps({
  clients: { type: Array, default: () => [] }
});
defineEmits(['select']);

const displayId = (c) => {
  const raw = String(c?.identifier_code || c?.initials || '').replace(/\s+/g, '').toUpperCase();
  if (!raw) return '—';
  if (raw.length >= 6) return `${raw.slice(0, 3)}${raw.slice(-3)}`;
  return raw;
};

const chipTitle = (c) => {
  const status = c?.status ? String(c.status) : '';
  const doc = c?.document_status ? String(c.document_status) : '';
  const bits = [status && `Status: ${status}`, doc && `Docs: ${doc}`].filter(Boolean);
  return bits.join(' • ') || 'Open client';
};
</script>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  position: relative;
  border: 1px solid var(--border);
  background: white;
  border-radius: 999px;
  padding: 8px 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  font-size: 12px;
}
.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--danger, #d92d20);
  margin-left: 8px;
  vertical-align: middle;
}
.empty {
  color: var(--text-secondary);
  font-size: 13px;
}
</style>

