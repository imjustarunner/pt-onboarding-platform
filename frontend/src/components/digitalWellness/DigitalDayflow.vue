<template>
  <div class="ddf">
    <header class="ddf__head">
      <div>
        <p class="ddf__eyebrow">Digital Dayflow</p>
        <h3 class="ddf__title">How digital use fits a typical day</h3>
      </div>
      <p class="ddf__note">
        Required work or school use is not labeled unhealthy. Distinguish intentional, automatic, and offline time.
      </p>
    </header>

    <div class="ddf__timeline" role="list" aria-label="Typical day periods">
      <div
        v-for="period in periods"
        :key="period.id"
        class="ddf__period"
        role="listitem"
      >
        <div class="ddf__period-label">{{ period.label }}</div>
        <div class="ddf__slots">
          <label
            v-for="kind in kinds"
            :key="`${period.id}-${kind.id}`"
            class="ddf__slot"
            :class="[`kind-${kind.id}`, { on: isOn(period.id, kind.id) }]"
          >
            <input
              type="checkbox"
              :checked="isOn(period.id, kind.id)"
              :disabled="!allowEditing"
              @change="toggle(period.id, kind.id, $event.target.checked)"
            />
            <span>{{ kind.label }}</span>
          </label>
        </div>
      </div>
    </div>

    <details class="ddf__alt">
      <summary>Text entry alternative</summary>
      <label
        v-for="period in periods"
        :key="`text-${period.id}`"
        class="ddf__field"
      >
        {{ period.label }}
        <input
          type="text"
          :value="textFor(period.id)"
          :disabled="!allowEditing"
          placeholder="e.g. work focus, then lunch walk"
          @change="setText(period.id, $event.target.value)"
        />
      </label>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { DAYFLOW_PERIODS } from '../../utils/digitalWellness.js';

const props = defineProps({
  dayflowEntries: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: true },
  allowEditing: { type: Boolean, default: true }
});

const emit = defineEmits(['update:dayflowEntries']);

const periods = DAYFLOW_PERIODS;
const kinds = [
  { id: 'required', label: 'Required digital' },
  { id: 'intentional', label: 'Intentional recreational' },
  { id: 'automatic', label: 'Automatic / unplanned' },
  { id: 'offline', label: 'Offline' },
  { id: 'movement', label: 'Movement' },
  { id: 'recovery', label: 'Recovery / sleep' }
];

const entries = computed(() => props.dayflowEntries || []);

function entryFor(periodId) {
  return entries.value.find((e) => e.periodId === periodId) || null;
}

function isOn(periodId, kindId) {
  const e = entryFor(periodId);
  return !!(e?.kinds || []).includes(kindId);
}

function textFor(periodId) {
  return entryFor(periodId)?.note || '';
}

function upsert(periodId, patch) {
  const next = [...entries.value];
  const idx = next.findIndex((e) => e.periodId === periodId);
  const base = idx >= 0 ? { ...next[idx] } : { periodId, kinds: [], note: '' };
  const merged = { ...base, ...patch };
  if (idx >= 0) next[idx] = merged;
  else next.push(merged);
  emit('update:dayflowEntries', next);
}

function toggle(periodId, kindId, on) {
  if (!props.allowEditing) return;
  const e = entryFor(periodId);
  const kindsSet = new Set(e?.kinds || []);
  if (on) kindsSet.add(kindId);
  else kindsSet.delete(kindId);
  upsert(periodId, { kinds: [...kindsSet] });
}

function setText(periodId, note) {
  if (!props.allowEditing) return;
  upsert(periodId, { note: String(note || '') });
}
</script>

<style scoped>
.ddf {
  background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 1rem 1.1rem 1.15rem;
}
.ddf__eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0369a1;
  font-weight: 600;
}
.ddf__title {
  margin: 0.2rem 0 0.35rem;
  font-size: 1.05rem;
}
.ddf__note {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
}
.ddf__timeline {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.9rem;
}
.ddf__period {
  display: grid;
  grid-template-columns: 7.5rem 1fr;
  gap: 0.55rem;
  align-items: start;
}
.ddf__period-label {
  font-size: 0.8rem;
  font-weight: 650;
  color: #0f172a;
  padding-top: 0.35rem;
}
.ddf__slots {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.ddf__slot {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 0.28rem 0.55rem;
  font-size: 0.72rem;
  color: #475569;
  cursor: pointer;
}
.ddf__slot input {
  accent-color: #0284c7;
}
.ddf__slot.on {
  border-color: #7dd3fc;
  background: #e0f2fe;
  color: #0c4a6e;
}
.ddf__slot.kind-automatic.on {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #92400e;
}
.ddf__slot.kind-offline.on,
.ddf__slot.kind-movement.on,
.ddf__slot.kind-recovery.on {
  background: #ecfdf5;
  border-color: #6ee7b7;
  color: #065f46;
}
.ddf__alt {
  margin-top: 0.9rem;
  font-size: 0.85rem;
  color: #475569;
}
.ddf__field {
  display: grid;
  gap: 0.25rem;
  margin-top: 0.55rem;
  font-size: 0.8rem;
}
.ddf__field input {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.45rem 0.6rem;
  font: inherit;
}
@media (max-width: 640px) {
  .ddf__period {
    grid-template-columns: 1fr;
  }
}
</style>
