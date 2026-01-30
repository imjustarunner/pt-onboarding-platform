<template>
  <div class="chips">
    <button
      v-for="c in clients"
      :key="c.id"
      class="chip"
      type="button"
      @click="$emit('select', c)"
      :title="chipTitle(c)"
      :data-initials="String(clientLabelMode || 'codes') === 'codes' ? String(c?.initials || '').trim() : ''"
    >
      {{ displayId(c) }}
      <span v-if="Number(c.unread_notes_count || 0) > 0" class="dot" aria-hidden="true" />
    </button>
    <div v-if="clients.length === 0" class="empty">No assigned clients.</div>
  </div>
</template>

<script setup>
const props = defineProps({
  clients: { type: Array, default: () => [] },
  // 'codes' | 'initials' (codes are default with initials on hover)
  clientLabelMode: { type: String, default: 'codes' }
});
defineEmits(['select']);

const displayId = (c) => {
  const mode = String(props.clientLabelMode || 'codes');
  const src = mode === 'initials' ? (c?.initials || c?.identifier_code) : (c?.identifier_code || c?.initials);
  let raw = String(src || '').replace(/\s+/g, '');
  // Preserve casing when displaying initials; codes can be normalized to uppercase.
  if (mode !== 'initials') raw = raw.toUpperCase();
  if (!raw) return '—';
  if (raw.length >= 6) return `${raw.slice(0, 3)}${raw.slice(-3)}`;
  return raw;
};

const chipTitle = (c) => {
  const status = c?.status ? String(c.status) : '';
  const doc = c?.document_status ? String(c.document_status) : '';
  const initials = String(c?.initials || '').trim();
  const mode = String(props.clientLabelMode || 'codes');
  const hover = mode === 'codes' && initials ? `Initials: ${initials}` : '';
  const bits = [hover, status && `Status: ${status}`, doc && `Docs: ${doc}`].filter(Boolean);
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
.chip[data-initials]:hover::after {
  content: attr(data-initials);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(100% + 8px);
  background: rgba(17, 24, 39, 0.95);
  color: white;
  padding: 6px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.04em;
  white-space: nowrap;
  pointer-events: none;
  z-index: 50;
}
.chip[data-initials=""]:hover::after {
  content: '';
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

