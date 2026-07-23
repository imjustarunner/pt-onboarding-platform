<template>
  <aside class="submit-history" :aria-label="`${groupTitle} submission history`">
    <header class="submit-history__head">
      <h4 class="submit-history__title">Your submissions</h4>
      <button
        v-if="hasAny"
        type="button"
        class="submit-history__refresh"
        :disabled="loading"
        @click="$emit('refresh')"
      >
        {{ loading ? '…' : '↻' }}
      </button>
    </header>

    <div v-if="loading && !hasAny" class="submit-history__muted">Loading…</div>
    <div v-else-if="error" class="submit-history__error">{{ error }}</div>
    <div v-else-if="!hasAny" class="submit-history__muted">No submissions yet.</div>

    <div v-else class="submit-history__blocks">
      <section v-for="block in blocks" :key="block.type" class="submit-history__block">
        <div class="submit-history__block-head">
          <span class="submit-history__type">{{ block.typeLabel }}</span>
          <span v-if="block.pendingCount" class="submit-history__pending-count">
            {{ block.pendingCount }} pending
          </span>
        </div>
        <ul class="submit-history__list">
          <li v-for="item in block.items" :key="item.id" class="submit-history__item">
            <div class="submit-history__item-top">
              <span class="submit-history__item-title">{{ item.title }}</span>
              <span :class="['hub-pill', 'hub-pill--sm', item.statusClass]">{{ item.statusLabel }}</span>
            </div>
            <div v-if="item.dateLabel" class="submit-history__item-date">{{ item.dateLabel }}</div>
          </li>
        </ul>
        <button
          v-if="block.hasMore"
          type="button"
          class="submit-history__more"
          @click="$emit('view-payroll')"
        >
          View more ({{ block.hiddenCount }} more)
        </button>
      </section>
    </div>

    <button
      v-if="hasAny"
      type="button"
      class="submit-history__payroll-link"
      @click="$emit('view-payroll')"
    >
      Open My Payroll →
    </button>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { getSubmitGroupMeta } from '../../config/submitDisplayCategories';

const props = defineProps({
  groupId: { type: String, required: true },
  blocks: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

defineEmits(['refresh', 'view-payroll']);

const groupTitle = computed(() => getSubmitGroupMeta(props.groupId).title);
const hasAny = computed(() => (props.blocks || []).some((b) => (b.items || []).length > 0));
</script>

<style scoped>
.submit-history {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 12px 10px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.submit-history__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.submit-history__title {
  margin: 0;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.submit-history__refresh {
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
}
.submit-history__muted {
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.4;
}
.submit-history__error {
  font-size: 12px;
  color: #b91c1c;
}
.submit-history__blocks {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
}
.submit-history__block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 6px;
}
.submit-history__type {
  font-size: 11px;
  font-weight: 800;
  color: #374151;
}
.submit-history__pending-count {
  font-size: 10px;
  font-weight: 700;
  color: #b45309;
}
.submit-history__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.submit-history__item {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 9px;
}
.submit-history__item-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}
.submit-history__item-title {
  font-size: 11px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
  min-width: 0;
}
.submit-history__item-date {
  margin-top: 3px;
  font-size: 10px;
  color: #9ca3af;
}
.submit-history__more {
  margin-top: 6px;
  border: none;
  background: none;
  padding: 0;
  font-size: 11px;
  font-weight: 700;
  color: #166534;
  cursor: pointer;
}
.submit-history__more:hover {
  text-decoration: underline;
}
.submit-history__payroll-link {
  margin-top: auto;
  border: none;
  background: none;
  padding: 4px 0 0;
  font-size: 11px;
  font-weight: 700;
  color: #166534;
  cursor: pointer;
  text-align: left;
}
.submit-history__payroll-link:hover {
  text-decoration: underline;
}

.hub-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 700;
  white-space: nowrap;
}
.hub-pill--sm {
  font-size: 9px;
  padding: 2px 6px;
}
.hub-pill--success {
  background: #dcfce7;
  color: #166534;
}
.hub-pill--warning {
  background: #fef3c7;
  color: #92400e;
}
.hub-pill--danger {
  background: #fee2e2;
  color: #991b1b;
}
.hub-pill--muted {
  background: #f3f4f6;
  color: #4b5563;
}
</style>
