<template>
  <div class="ssp" data-testid="supervision-supervisee-panel">
    <div class="ssp-head">
      <h3 class="ssp-title">{{ title }}</h3>
      <p class="ssp-sub muted">{{ subtitle }}</p>
    </div>

    <div v-if="hasRoster" class="ssp-roster">
      <div v-if="rosterLoading && !participants.length" class="muted">Loading participants…</div>
      <div v-else-if="rosterError && !participants.length" class="error">{{ rosterError }}</div>
      <div v-else-if="!participants.length" class="muted">No invited participants for this session.</div>
      <div v-else class="ssp-roster-list">
        <article
          v-for="row in participants"
          :key="`ssp-p-${row.id}`"
          class="ssp-person"
          :class="{ 'ssp-person--presenter': row.isPresenter }"
        >
          <div class="ssp-person-head">
            <div class="ssp-person-name">{{ row.name || `User #${row.id}` }}</div>
            <span class="ssp-badges">
              <span v-if="row.isPresenter" class="ssp-presenter-badge">PRESENTER</span>
              <button
                v-if="canEditRequired"
                type="button"
                class="ssp-required-badge"
                :class="row.isRequired === false ? 'ssp-required-badge--optional' : 'ssp-required-badge--mandatory'"
                :disabled="requiredBusyId === row.id"
                :title="row.isRequired === false ? 'Optional — click to make mandatory' : 'Mandatory — click to make optional'"
                @click="$emit('toggle-required', row.id, row.isRequired === false)"
              >
                {{ requiredBusyId === row.id ? '…' : (row.isRequired === false ? 'OPTIONAL' : 'MANDATORY') }}
              </button>
              <span
                v-else
                class="ssp-required-badge"
                :class="row.isRequired === false ? 'ssp-required-badge--optional' : 'ssp-required-badge--mandatory'"
              >
                {{ row.isRequired === false ? 'OPTIONAL' : 'MANDATORY' }}
              </span>
            </span>
          </div>
          <div v-if="row.loading" class="muted ssp-person-meta">Loading hours…</div>
          <div v-else-if="row.error" class="error ssp-person-meta">{{ row.error }}</div>
          <div v-else-if="row.enabled === false" class="muted ssp-person-meta">
            Hour tracking not enabled for this supervisee.
          </div>
          <div v-else class="ssp-person-hours">
            <div class="ssp-hour">
              <span class="ssp-hour-k">Individual</span>
              <span class="ssp-hour-v">{{ fmt(row.individualHours) }} hrs</span>
            </div>
            <div class="ssp-hour">
              <span class="ssp-hour-k">Group</span>
              <span class="ssp-hour-v">{{ fmt(row.groupHours) }} hrs</span>
            </div>
            <div class="ssp-hour ssp-hour--total">
              <span class="ssp-hour-k">Total</span>
              <span class="ssp-hour-v">{{ fmt(totalFor(row)) }} hrs</span>
            </div>
          </div>
        </article>
      </div>
    </div>

    <template v-else>
      <div v-if="loading" class="muted">Loading supervision hours…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="!enabled" class="muted">
        Supervision hour tracking is not enabled for this supervisee on this tenant.
      </div>
      <div v-else class="ssp-cards">
        <div class="ssp-card">
          <div class="ssp-k">Individual</div>
          <div class="ssp-v">{{ fmt(individualHours) }} / {{ fmt(requiredIndividual) }}</div>
          <div class="ssp-bar" aria-hidden="true">
            <span class="ssp-bar-fill" :style="{ width: pct(individualHours, requiredIndividual) }" />
          </div>
          <div class="ssp-meta muted">{{ remaining(individualHours, requiredIndividual) }} hrs remaining</div>
        </div>
        <div class="ssp-card">
          <div class="ssp-k">Group</div>
          <div class="ssp-v">{{ fmt(groupHours) }} / {{ fmt(requiredGroup) }}</div>
          <div class="ssp-bar" aria-hidden="true">
            <span class="ssp-bar-fill ssp-bar-fill--group" :style="{ width: pct(groupHours, requiredGroup) }" />
          </div>
          <div class="ssp-meta muted">{{ remaining(groupHours, requiredGroup) }} hrs remaining</div>
        </div>
        <div class="ssp-card ssp-card--wide">
          <div class="ssp-k">Total</div>
          <div class="ssp-v">{{ fmt(totalHours) }} hrs logged</div>
          <div class="ssp-meta muted">Session type: {{ sessionTypeLabel }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  participantName: { type: String, default: '' },
  sessionType: { type: String, default: 'individual' },
  individualHours: { type: Number, default: 0 },
  groupHours: { type: Number, default: 0 },
  requiredIndividual: { type: Number, default: 50 },
  requiredGroup: { type: Number, default: 50 },
  enabled: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  /** When set, show a roster of invited participants with per-person hours. */
  participants: { type: Array, default: () => [] },
  rosterMode: { type: Boolean, default: false },
  rosterLoading: { type: Boolean, default: false },
  rosterError: { type: String, default: '' },
  /** Facilitator/admin may toggle mandatory vs optional for already-invited participants. */
  canEditRequired: { type: Boolean, default: false },
  requiredBusyId: { type: Number, default: 0 }
});

defineEmits(['toggle-required']);

const hasRoster = computed(() => !!props.rosterMode);
const title = computed(() => (hasRoster.value ? 'Participants' : 'Supervisee'));
const subtitle = computed(() => {
  if (hasRoster.value) {
    return 'Invited participants with individual, group, and total hours logged';
  }
  return props.participantName || 'Supervision progress toward required hours';
});

const totalHours = computed(() => Number(props.individualHours || 0) + Number(props.groupHours || 0));
const sessionTypeLabel = computed(() => {
  const t = String(props.sessionType || 'individual').toLowerCase();
  if (t === 'group') return 'Group';
  if (t === 'triadic') return 'Triadic';
  return 'Individual';
});

function totalFor(row) {
  return Number(row?.individualHours || 0) + Number(row?.groupHours || 0);
}
function fmt(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
function pct(have, need) {
  const n = Number(need || 0);
  if (!(n > 0)) return '0%';
  return `${Math.min(100, Math.round((Number(have || 0) / n) * 100))}%`;
}
function remaining(have, need) {
  return fmt(Math.max(0, Number(need || 0) - Number(have || 0)));
}
</script>

<style scoped>
.ssp { display: flex; flex-direction: column; gap: 12px; }
.ssp-title { margin: 0; font-size: 1rem; font-weight: 800; color: #0f172a; }
.ssp-sub { margin: 2px 0 0; font-size: 0.82rem; }
.ssp-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.ssp-card {
  padding: 12px 14px;
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #f8fafc;
}
.ssp-card--wide { grid-column: 1 / -1; }
.ssp-k {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.ssp-v {
  margin-top: 4px;
  font-size: 1.25rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}
.ssp-bar {
  margin-top: 8px;
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.ssp-bar-fill {
  display: block;
  height: 100%;
  background: #2563eb;
  border-radius: 999px;
}
.ssp-bar-fill--group { background: #7c3aed; }
.ssp-meta { margin-top: 6px; font-size: 0.8rem; font-weight: 600; }
.ssp-roster-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ssp-person {
  padding: 12px 14px;
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #f8fafc;
}
.ssp-person--presenter {
  border-color: #fda4af;
  background: #fff1f2;
}
.ssp-person-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ssp-badges {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.ssp-required-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  flex: 0 0 auto;
  border: 1px solid transparent;
}
button.ssp-required-badge {
  cursor: pointer;
}
button.ssp-required-badge:disabled {
  opacity: 0.6;
  cursor: wait;
}
.ssp-required-badge--mandatory {
  background: #ffedd5;
  color: #9a3412;
  border-color: #fdba74;
}
.ssp-required-badge--optional {
  background: #f1f5f9;
  color: #475569;
  border-color: #cbd5e1;
}
.ssp-person-name {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}
.ssp-presenter-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: #9f1239;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  flex: 0 0 auto;
}
.ssp-person-meta { margin-top: 6px; font-size: 0.8rem; }
.ssp-person-hours {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.ssp-hour {
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e2e8f0;
}
.ssp-hour--total {
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.ssp-hour-k {
  display: block;
  font-size: 0.66rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.ssp-hour-v {
  display: block;
  margin-top: 2px;
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}
.error { color: #b91c1c; font-size: 0.85rem; }
.muted { color: #64748b; }
@media (max-width: 640px) {
  .ssp-cards { grid-template-columns: 1fr; }
  .ssp-card--wide { grid-column: auto; }
  .ssp-person-hours { grid-template-columns: 1fr; }
}
</style>
