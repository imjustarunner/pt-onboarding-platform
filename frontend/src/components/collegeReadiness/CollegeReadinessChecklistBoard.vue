<template>
  <div class="crb">
    <header class="crb__head">
      <h3 class="crb__title">{{ title }}</h3>
      <p class="crb__sub">
        {{ completedCount }} of {{ items.length }} completed
        · College readiness includes knowing when and how to use available support.
      </p>
    </header>

    <div v-for="group in grouped" :key="group.label" class="crb__group">
      <h4>{{ group.label }}</h4>
      <ul>
        <li v-for="item in group.items" :key="item.id">
          <button
            type="button"
            class="crb__item"
            :class="`is-${item.status}`"
            :aria-label="`${item.title}: ${statusLabel(item.status)}`"
            @click="cycleStatus(item)"
          >
            <span class="crb__mark" aria-hidden="true">{{ mark(item.status) }}</span>
            <span class="crb__text">{{ item.title }}</span>
            <span class="crb__status">{{ statusLabel(item.status) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { CHECKLIST_STATUSES } from '../../utils/collegeReadiness.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  title: { type: String, default: 'Readiness Checklist Board' },
  interactive: { type: Boolean, default: true }
});

const emit = defineEmits(['update-item']);

const completedCount = computed(
  () => (props.items || []).filter((i) => i.status === 'completed').length
);

const grouped = computed(() => {
  const map = new Map();
  for (const item of props.items || []) {
    const label = item.categoryLabel || item.category || 'General';
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(item);
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }));
});

function statusLabel(id) {
  return CHECKLIST_STATUSES.find((s) => s.id === id)?.label || id;
}

function mark(status) {
  if (status === 'completed') return '✓';
  if (status === 'in-progress') return '●';
  if (status === 'needs-help') return '!';
  if (status === 'not-applicable') return '—';
  return '○';
}

function cycleStatus(item) {
  if (!props.interactive) return;
  const order = ['not-started', 'in-progress', 'completed', 'needs-help', 'not-applicable'];
  const idx = order.indexOf(item.status);
  const next = order[(idx + 1) % order.length];
  emit('update-item', { ...item, status: next });
}
</script>

<style scoped>
.crb {
  background: linear-gradient(180deg, #fff, #f8fafc);
  border: 1px solid #dbe3f0;
  border-radius: 16px;
  padding: 1rem 1.1rem;
  color: #0f172a;
}

.crb__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
}

.crb__sub {
  margin: 0.25rem 0 0.85rem;
  font-size: 0.85rem;
  color: #64748b;
}

.crb__group {
  margin-bottom: 0.85rem;
}

.crb__group h4 {
  margin: 0 0 0.4rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
}

.crb__group ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}

.crb__item {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.55rem;
  align-items: center;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 0.5rem 0.65rem;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.crb__item:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

.crb__mark {
  width: 1.25rem;
  text-align: center;
  font-weight: 800;
}

.crb__text {
  font-size: 0.88rem;
  font-weight: 600;
}

.crb__status {
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 700;
}

.is-completed .crb__mark {
  color: #059669;
}
.is-in-progress .crb__mark {
  color: #0284c7;
}
.is-needs-help .crb__mark {
  color: #c2410c;
}
</style>
