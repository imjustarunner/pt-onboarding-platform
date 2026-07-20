<template>
  <div class="pom-backdrop" @click.self="$emit('close')">
    <div class="pom" role="dialog" aria-modal="true" aria-labelledby="pom-title">
      <header class="pom-head">
        <h3 id="pom-title">Submit planned out</h3>
        <button type="button" class="pom-x" aria-label="Close" @click="$emit('close')">×</button>
      </header>

      <form class="pom-form" @submit.prevent="submit">
        <fieldset class="pom-span">
          <legend>Duration</legend>
          <label><input v-model="spanType" type="radio" value="hours" /> Hours</label>
          <label><input v-model="spanType" type="radio" value="half_day" /> Half day</label>
          <label><input v-model="spanType" type="radio" value="all_day" /> All day</label>
        </fieldset>

        <div v-if="spanType === 'hours'" class="pom-row-2">
          <label class="field">
            <span>Start</span>
            <input v-model="startLocal" type="datetime-local" required />
          </label>
          <label class="field">
            <span>End</span>
            <input v-model="endLocal" type="datetime-local" required />
          </label>
        </div>

        <div v-else-if="spanType === 'half_day'" class="pom-row-2">
          <label class="field">
            <span>Date</span>
            <input v-model="dayDate" type="date" required />
          </label>
          <label class="field">
            <span>Half</span>
            <select v-model="halfDayPart">
              <option value="am">Morning (AM)</option>
              <option value="pm">Afternoon (PM)</option>
            </select>
          </label>
        </div>

        <div v-else class="pom-row-2">
          <label class="field">
            <span>Start date</span>
            <input v-model="startDate" type="date" required />
          </label>
          <label class="field">
            <span>End date (inclusive)</span>
            <input v-model="endDateInclusive" type="date" required />
          </label>
        </div>

        <div class="pom-row-3">
          <label class="field">
            <span>Availability</span>
            <select v-model="availability">
              <option value="unavailable">Unavailable</option>
              <option value="available">Available</option>
            </select>
          </label>
          <label class="field">
            <span>Emergencies</span>
            <select v-model="emergencies">
              <option value="none">--</option>
              <option value="okay">Emergencies Okay</option>
              <option value="redirect">Emergencies to someone</option>
            </select>
          </label>
          <label class="field">
            <span>Contact</span>
            <select v-model="contactPreference">
              <option value="none">--</option>
              <option value="call_only">Call Only</option>
              <option value="email_only">Email Only</option>
            </select>
          </label>
        </div>

        <label v-if="emergencies === 'redirect'" class="field">
          <span>Emergencies to (name)</span>
          <input v-model="emergenciesRedirectName" type="text" maxlength="160" placeholder="e.g. Michael Mendez" required />
        </label>

        <label class="field">
          <span>Details (optional)</span>
          <textarea v-model="details" rows="2" maxlength="2000" placeholder="Notes for the team / schedule block" />
        </label>

        <p v-if="error" class="pom-err">{{ error }}</p>

        <footer class="pom-foot">
          <button type="button" class="btn ghost" @click="$emit('close')">Cancel</button>
          <button type="submit" class="btn primary" :disabled="saving">
            {{ saving ? 'Saving…' : 'Submit planned out' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true }
});

const emit = defineEmits(['close', 'created']);

const spanType = ref('hours');
const startLocal = ref('');
const endLocal = ref('');
const dayDate = ref('');
const halfDayPart = ref('am');
const startDate = ref('');
const endDateInclusive = ref('');
const availability = ref('unavailable');
const emergencies = ref('none');
const emergenciesRedirectName = ref('');
const contactPreference = ref('none');
const details = ref('');
const saving = ref(false);
const error = ref('');

function toMysqlLocal(local) {
  if (!local) return null;
  const m = String(local).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}:00`;
  const d = new Date(local);
  if (!Number.isFinite(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function addOneDay(ymd) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function submit() {
  error.value = '';
  saving.value = true;
  try {
    const body = {
      agencyId: Number(props.agencyId),
      spanType: spanType.value,
      availability: availability.value,
      emergencies: emergencies.value,
      emergenciesRedirectName: emergencies.value === 'redirect' ? emergenciesRedirectName.value.trim() : undefined,
      contactPreference: contactPreference.value,
      details: details.value.trim() || undefined
    };
    if (spanType.value === 'hours') {
      body.startAt = toMysqlLocal(startLocal.value);
      body.endAt = toMysqlLocal(endLocal.value);
    } else if (spanType.value === 'half_day') {
      body.startDate = dayDate.value;
      body.halfDayPart = halfDayPart.value;
    } else {
      body.startDate = startDate.value;
      body.endDate = addOneDay(endDateInclusive.value || startDate.value);
      body.allDay = true;
    }
    const res = await api.post('/planned-outs', body, { skipGlobalLoading: true });
    emit('created', res.data?.plannedOut || null);
    emit('close');
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit planned out';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.pom-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  padding: 16px;
}
.pom {
  width: min(560px, 100%);
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
  overflow: hidden;
}
.pom-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
}
.pom-head h3 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--ops-primary, #1f6b4a);
}
.pom-x {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
}
.pom-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}
.pom-span {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 13px;
  font-weight: 600;
}
.pom-span legend {
  padding: 0 4px;
  font-size: 11px;
  font-weight: 800;
  color: #64748b;
}
.pom-row-2, .pom-row-3 {
  display: grid;
  gap: 10px;
}
.pom-row-2 { grid-template-columns: 1fr 1fr; }
.pom-row-3 { grid-template-columns: 1fr 1fr 1fr; }
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}
.field input, .field select, .field textarea {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  color: #0f172a;
}
.pom-err { margin: 0; color: #b91c1c; font-size: 13px; font-weight: 700; }
.pom-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.btn {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: #fff;
}
.btn.primary {
  background: var(--ops-primary, #1f6b4a);
  color: #fff;
  border-color: transparent;
}
.btn.ghost { color: #475569; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
@media (max-width: 640px) {
  .pom-row-2, .pom-row-3 { grid-template-columns: 1fr; }
}
</style>
