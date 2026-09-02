<template>
  <section class="na-quick-session" aria-label="Quick session">
    <div class="na-quick-session__grid">
      <div class="na-quick-session__cell na-quick-session__cell--client">
        <span class="lbl">Client</span>
        <strong>{{ clientLabel || '—' }}</strong>
        <span v-if="clientLinked" class="badge">Chart linked</span>
      </div>
      <div class="na-quick-session__cell">
        <span class="lbl">DOS</span>
        <input
          v-if="editable"
          type="date"
          class="na-quick-session__input"
          :value="dateOfService"
          @input="$emit('update:dateOfService', $event.target.value)"
        />
        <strong v-else>{{ dateOfService || '—' }}</strong>
      </div>
      <div class="na-quick-session__cell">
        <span class="lbl">Code</span>
        <strong>{{ serviceLabel || '—' }}</strong>
      </div>
      <div class="na-quick-session__cell">
        <span class="lbl">Participants</span>
        <select
          v-if="editable"
          class="na-quick-session__select"
          :value="participants"
          @change="$emit('update:participants', $event.target.value)"
        >
          <option value="Client Only">Client Only</option>
          <option value="Client + Family">Client + Family</option>
          <option value="Client + Other">Client + Other</option>
          <option value="Collateral">Collateral</option>
        </select>
        <strong v-else>{{ participants || 'Client Only' }}</strong>
      </div>
      <div class="na-quick-session__cell">
        <span class="lbl">Duration</span>
        <input
          v-if="editable && showDuration"
          type="number"
          min="1"
          max="240"
          class="na-quick-session__input na-quick-session__input--num"
          :value="durationMinutes"
          @change="$emit('update:durationMinutes', Number($event.target.value) || null)"
        />
        <strong v-else>{{ durationLabel }}</strong>
      </div>
      <div class="na-quick-session__cell">
        <span class="lbl">Clinician</span>
        <strong>{{ clinicianLabel || '—' }}</strong>
      </div>
      <div class="na-quick-session__cell na-quick-session__cell--setup">
        <span class="lbl">Setup</span>
        <button
          type="button"
          class="na-quick-session__setup"
          :class="{ ok: setupComplete }"
          @click="$emit('toggle-setup')"
        >
          <span aria-hidden="true">{{ setupComplete ? '✓' : '!' }}</span>
          {{ setupComplete ? 'Client setup complete' : 'Complete client setup' }}
          <span class="chev" aria-hidden="true">▾</span>
        </button>
      </div>
    </div>
    <p v-if="participantsFlag" class="na-quick-session__flag">
      Note may indicate others attended — update Participants or confirm client-only when signing.
    </p>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  clientLabel: { type: String, default: '' },
  clientLinked: { type: Boolean, default: false },
  dateOfService: { type: String, default: '' },
  serviceLabel: { type: String, default: '' },
  participants: { type: String, default: 'Client Only' },
  durationMinutes: { type: [Number, null], default: null },
  clinicianLabel: { type: String, default: '' },
  setupComplete: { type: Boolean, default: false },
  participantsFlag: { type: Boolean, default: false },
  editable: { type: Boolean, default: true },
  showDuration: { type: Boolean, default: true },
  finalized: { type: Boolean, default: false }
});

defineEmits([
  'update:dateOfService',
  'update:participants',
  'update:durationMinutes',
  'toggle-setup'
]);

const durationLabel = computed(() => {
  if (props.finalized && props.durationMinutes != null) return `${props.durationMinutes} min`;
  if (props.durationMinutes != null && props.durationMinutes !== '') return `${props.durationMinutes} min`;
  return '—';
});
</script>

<style scoped>
.na-quick-session {
  background: white;
  border: 1px solid var(--na-border, #e2e8f0);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 14px;
}

.na-quick-session__grid {
  display: grid;
  grid-template-columns: minmax(140px, 1.4fr) repeat(6, minmax(0, 1fr));
  gap: 10px 12px;
  align-items: start;
}

.lbl {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--na-muted, #64748b);
  margin-bottom: 2px;
}

.na-quick-session__cell strong {
  font-size: 0.86rem;
  line-height: 1.3;
  word-break: break-word;
}

.badge {
  display: inline-block;
  margin-top: 2px;
  padding: 2px 6px;
  border-radius: 6px;
  background: #ccfbf1;
  color: #0f766e;
  font-size: 0.68rem;
  font-weight: 700;
}

.na-quick-session__input,
.na-quick-session__select {
  width: 100%;
  border: 1px solid var(--na-border, #e2e8f0);
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.84rem;
  background: white;
}

.na-quick-session__input--num {
  max-width: 72px;
}

.na-quick-session__setup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  color: #92400e;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.na-quick-session__setup.ok {
  border-color: #86efac;
  background: #f0fdf4;
  color: #166534;
}

.chev {
  font-size: 0.7rem;
  opacity: 0.7;
}

.na-quick-session__flag {
  margin: 10px 0 0;
  font-size: 0.82rem;
  color: #b45309;
}

@media (max-width: 1100px) {
  .na-quick-session__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .na-quick-session__grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
