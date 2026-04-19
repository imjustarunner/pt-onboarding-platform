<template>
  <div class="chips">
    <button
      v-for="c in clients"
      :key="c.id"
      :id="anchorIdFor(c)"
      :class="['chip', { 'chip-locked': isLocked(c), 'chip-highlight': isHighlighted(c) }]"
      type="button"
      :disabled="isLocked(c)"
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
  clientLabelMode: { type: String, default: 'codes' },
  highlightClientId: { type: [Number, String], default: null },
  scrollAnchorProviderUserId: { type: [Number, String], default: null }
});
defineEmits(['select']);

const isLocked = (c) => c?.school_portal_force_placeholder === true || c?.school_portal_can_open === false;

const isHighlighted = (c) => Number(c?.id || 0) === Number(props.highlightClientId || 0) && Number(props.highlightClientId || 0) > 0;

const anchorIdFor = (c) => {
  if (!isHighlighted(c)) return undefined;
  const pid = Number(props.scrollAnchorProviderUserId || 0);
  if (!Number.isFinite(pid) || pid <= 0) return undefined;
  return `school-portal-client-highlight-${pid}-${Number(c.id)}`;
};

const displayId = (c) => {
  const mode = String(props.clientLabelMode || 'codes');
  const src = mode === 'initials' ? (c?.initials || c?.identifier_code) : (c?.identifier_code || c?.initials);
  let raw = String(src || '').replace(/\s+/g, '');
  if (mode !== 'initials') raw = raw.toUpperCase();
  if (isLocked(c)) {
    if (raw) {
      if (raw.length >= 6) return `${raw.slice(0, 3)}${raw.slice(-3)}`;
      return raw;
    }
    return String(c?.school_portal_locked_label || 'NO ROI').trim() || 'NO ROI';
  }
  if (!raw) return '—';
  if (raw.length >= 6) return `${raw.slice(0, 3)}${raw.slice(-3)}`;
  return raw;
};

const chipTitle = (c) => {
  if (isLocked(c)) {
    const state = String(c?.school_staff_effective_access_state || '').toLowerCase();
    if (state === 'expired') {
      return 'ROI EXPIRED: Release of information is expired. Client label is shown for schedule context only.';
    }
    return 'ROI LOCKED: ROI is missing, pending, or requires packet update/approval. Client label is shown for schedule context only.';
  }
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
.chip-highlight {
  outline: 2px solid rgba(79, 70, 229, 0.85);
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
}
.chip-locked {
  background: #f3f4f6;
  color: #6b7280;
  border-color: #d1d5db;
}
.chip-locked:disabled {
  cursor: default;
  opacity: 1;
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

