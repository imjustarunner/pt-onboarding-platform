<template>
  <section class="na-quick-session" aria-label="Quick session">
    <div class="na-quick-session__grid">
      <div class="na-quick-session__cell na-quick-session__cell--client">
        <span class="lbl">Client</span>
        <a
          v-if="profileHref && clientLabel"
          class="na-quick-session__client-link"
          :href="profileHref"
          target="_blank"
          rel="noopener noreferrer"
          :title="'Open client profile'"
        >
          <strong>{{ clientLabel }}</strong>
        </a>
        <strong v-else>{{ clientLabel || '—' }}</strong>
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
        <select
          v-if="editable && serviceCodeChoices.length > 1"
          class="na-quick-session__select"
          :value="serviceCode"
          @change="$emit('update:serviceCode', $event.target.value)"
        >
          <option v-for="c in serviceCodeChoices" :key="c" :value="c">{{ c }}</option>
        </select>
        <strong v-else>{{ serviceCode || '—' }}</strong>
      </div>
      <div class="na-quick-session__cell na-quick-session__cell--participants">
        <span class="lbl">Participants</span>
        <select
          v-if="editable"
          class="na-quick-session__select"
          :value="participants"
          @change="$emit('update:participants', $event.target.value)"
        >
          <option value="Client Only">Client Only</option>
          <option value="Client and Others">Client and Others</option>
          <option value="Others (client not present)">Others (client not present)</option>
        </select>
        <strong v-else>{{ participants || 'Client Only' }}</strong>
        <input
          v-if="editable && needsAttendeeDetail"
          type="text"
          class="na-quick-session__input na-quick-session__input--detail"
          :class="{ 'na-quick-session__input--required': attendeesRequired }"
          :value="participantsDetail"
          :placeholder="attendeesRequired ? 'Who attended? (required)' : 'Who attended? (e.g. mother, guardian)'"
          required
          @input="$emit('update:participantsDetail', $event.target.value)"
        />
        <span v-else-if="!editable && participantsDetail" class="detail">{{ participantsDetail }}</span>
        <span v-if="editable && attendeesRequired && !String(participantsDetail || '').trim()" class="na-quick-session__req">
          Name who attended
        </span>
      </div>
      <div class="na-quick-session__cell">
        <span class="lbl">Duration</span>
        <input
          v-if="editable"
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
        <span class="lbl">Location</span>
        <input
          v-if="editable"
          type="text"
          class="na-quick-session__input"
          :value="locationLabel"
          placeholder="Office, telehealth…"
          @input="$emit('update:locationLabel', $event.target.value)"
        />
        <strong v-else>{{ locationLabel || '—' }}</strong>
      </div>
      <div class="na-quick-session__cell">
        <span class="lbl">Start</span>
        <input
          v-if="editable"
          type="time"
          class="na-quick-session__input"
          :value="startTime"
          @input="$emit('update:startTime', $event.target.value)"
        />
        <strong v-else>{{ startTime || '—' }}</strong>
      </div>
      <div class="na-quick-session__cell">
        <span class="lbl">End</span>
        <input
          v-if="editable"
          type="time"
          class="na-quick-session__input"
          :value="endTime"
          @input="$emit('update:endTime', $event.target.value)"
        />
        <strong v-else>{{ endTime || '—' }}</strong>
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
    <p v-if="durationHint" class="na-quick-session__hint">{{ durationHint }}</p>
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
  profileHref: { type: String, default: '' },
  dateOfService: { type: String, default: '' },
  serviceLabel: { type: String, default: '' },
  serviceCode: { type: String, default: '' },
  serviceCodeChoices: { type: Array, default: () => [] },
  participants: { type: String, default: 'Client Only' },
  participantsDetail: { type: String, default: '' },
  durationMinutes: { type: [Number, null], default: null },
  locationLabel: { type: String, default: '' },
  startTime: { type: String, default: '' },
  endTime: { type: String, default: '' },
  clinicianLabel: { type: String, default: '' },
  setupComplete: { type: Boolean, default: false },
  participantsFlag: { type: Boolean, default: false },
  attendeesRequired: { type: Boolean, default: false },
  editable: { type: Boolean, default: true },
  finalized: { type: Boolean, default: false },
  durationHint: { type: String, default: '' }
});

defineEmits([
  'update:dateOfService',
  'update:serviceCode',
  'update:participants',
  'update:participantsDetail',
  'update:durationMinutes',
  'update:locationLabel',
  'update:startTime',
  'update:endTime',
  'toggle-setup'
]);

const needsAttendeeDetail = computed(
  () => props.participants && props.participants !== 'Client Only'
);

const durationLabel = computed(() => {
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
  grid-template-columns: minmax(120px, 1.3fr) repeat(5, minmax(0, 1fr)) minmax(70px, 0.8fr) repeat(3, minmax(0, 1fr));
  gap: 10px 10px;
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

.na-quick-session__client-link {
  color: inherit;
  text-decoration: none;
}

.na-quick-session__client-link:hover strong,
.na-quick-session__client-link:focus-visible strong {
  color: #0f766e;
  text-decoration: underline;
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

.detail {
  display: block;
  margin-top: 4px;
  font-size: 0.78rem;
  color: #475569;
}

.na-quick-session__input,
.na-quick-session__select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 0.84rem;
  background: #fff;
  color: #0f172a;
  box-sizing: border-box;
}

.na-quick-session__input--num {
  max-width: 4.5rem;
}

.na-quick-session__input--detail {
  margin-top: 4px;
}

.na-quick-session__input--required {
  border-color: #f59e0b;
}

.na-quick-session__req {
  display: block;
  margin-top: 2px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #b45309;
}

.na-quick-session__setup {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  color: #92400e;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.na-quick-session__setup.ok {
  border-color: #86efac;
  background: #f0fdf4;
  color: #166534;
}

.chev {
  opacity: 0.7;
}

.na-quick-session__hint {
  margin: 8px 0 0;
  font-size: 0.75rem;
  color: #64748b;
}

.na-quick-session__flag {
  margin: 6px 0 0;
  font-size: 0.75rem;
  color: #b45309;
  font-weight: 600;
}

@media (max-width: 1100px) {
  .na-quick-session__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
