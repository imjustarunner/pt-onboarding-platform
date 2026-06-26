<template>
  <div v-if="items.length" class="accepted-insurance">
    <div v-if="showLabel" class="accepted-insurance-label">{{ label }}</div>
    <div class="accepted-insurance-list">
      <div
        v-for="ins in items"
        :key="insKey(ins)"
        class="accepted-insurance-item"
        :title="itemTitle(ins)"
      >
        <img
          v-if="ins.logo_url || logoUrl(ins.logo_path)"
          :src="ins.logo_url || logoUrl(ins.logo_path)"
          :alt="ins.name || ins.label"
          class="accepted-insurance-logo"
        />
        <span v-else class="accepted-insurance-fallback">{{ initials(ins) }}</span>
        <span v-if="showNames" class="accepted-insurance-name">
          {{ ins.name || ins.label }}
          <span v-if="ins.source === 'billing_supervisor'" class="inherited-tag">via supervisor</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toUploadsUrl } from '../../utils/uploadsUrl';

defineProps({
  items: { type: Array, default: () => [] },
  label: { type: String, default: 'Insurance accepted' },
  showLabel: { type: Boolean, default: true },
  showNames: { type: Boolean, default: true }
});

const insKey = (ins) =>
  String(ins?.insurance_definition_id || ins?.id || ins?.insurance_key || ins?.name || ins?.label || '');

const logoUrl = (path) => (path ? toUploadsUrl(path) : '');

const initials = (ins) => String(ins?.name || ins?.label || '?').slice(0, 2).toUpperCase();

const itemTitle = (ins) => {
  const name = ins?.name || ins?.label || 'Insurance';
  if (ins?.source === 'billing_supervisor' && ins?.inherited_from_name) {
    return `${name} — via billing supervisor ${ins.inherited_from_name}`;
  }
  if (ins?.effective_date) return `${name} — effective ${ins.effective_date}`;
  return name;
};
</script>

<style scoped>
.accepted-insurance-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.accepted-insurance-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.accepted-insurance-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  max-width: 100%;
}
.accepted-insurance-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 4px;
  flex-shrink: 0;
}
.accepted-insurance-fallback {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  background: var(--bg-alt, #f3f4f6);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.accepted-insurance-name {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
}
.inherited-tag {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
}
</style>
