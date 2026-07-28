<template>
  <div v-if="open" class="sam-panel" data-testid="supervision-attendee-mandatory-panel">
    <div class="sam-header">
      <div>
        <div class="sam-title">Mandatory / optional participants</div>
        <p class="sam-hint muted">
          Optional by default. Mandatory attendees are compensated when they attend.
          Assigned presenters are compensated even when marked optional.
        </p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="emit('close')">Done</button>
    </div>

    <div v-if="!participants.length" class="muted">Select participants first.</div>
    <ul v-else class="sam-list">
      <li v-for="row in participants" :key="`sam-${row.id}`" class="sam-row">
        <label class="sam-check">
          <input
            type="checkbox"
            :checked="mandatorySet.has(row.id)"
            :disabled="disabled"
            @change="toggleMandatory(row.id, !!$event.target.checked)"
          />
          <span class="sam-name">{{ row.label }}</span>
        </label>
        <span class="sam-badges">
          <span v-if="row.kind === 'primary'" class="sam-badge">Primary</span>
          <span
            class="sam-badge"
            :class="mandatorySet.has(row.id) ? 'sam-badge--mandatory' : 'sam-badge--optional'"
          >
            {{ mandatorySet.has(row.id) ? 'Mandatory' : 'Optional' }}
          </span>
          <span v-if="presenterSet.has(row.id)" class="sam-badge sam-badge--presenter">Presenter</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  participants: { type: Array, default: () => [] },
  mandatoryIds: { type: Array, default: () => [] },
  presenterIds: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:mandatoryIds', 'close']);

const mandatorySet = computed(
  () => new Set((props.mandatoryIds || []).map((n) => Number(n || 0)).filter((n) => n > 0))
);
const presenterSet = computed(
  () => new Set((props.presenterIds || []).map((n) => Number(n || 0)).filter((n) => n > 0))
);

function toggleMandatory(userId, checked) {
  const id = Number(userId || 0);
  if (!id) return;
  const next = new Set(mandatorySet.value);
  if (checked) next.add(id);
  else next.delete(id);
  emit('update:mandatoryIds', Array.from(next.values()));
}
</script>

<style scoped>
.sam-panel {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--border-subtle, #d8dee6);
  border-radius: 10px;
  background: var(--surface-raised, #f8fafc);
}

.sam-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.sam-title {
  font-weight: 600;
  font-size: 0.95rem;
}

.sam-hint {
  margin: 4px 0 0;
  font-size: 0.82rem;
  line-height: 1.35;
}

.sam-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.sam-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--border-subtle, #e5e7eb);
}

.sam-check {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  min-width: 0;
}

.sam-name {
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sam-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.sam-badge {
  font-size: 0.72rem;
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef2f7;
  color: #475569;
  white-space: nowrap;
}

.sam-badge--mandatory {
  background: #dbeafe;
  color: #1d4ed8;
}

.sam-badge--optional {
  background: #f1f5f9;
  color: #64748b;
}

.sam-badge--presenter {
  background: #dcfce7;
  color: #166534;
}
</style>
