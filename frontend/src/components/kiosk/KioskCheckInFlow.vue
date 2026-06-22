<template>
  <div class="kcif-overlay" @click.self="onOverlayClick">
    <div class="kcif-panel" role="dialog" aria-modal="true" :aria-label="`Check in with ${provider.firstName} ${provider.lastName}`">
      <!-- Header -->
      <div class="kcif-header">
        <div class="kcif-header__provider">
          <div class="kcif-header__avatar" aria-hidden="true">
            <img v-if="photoUrl" :src="photoUrl" alt="" />
            <span v-else>{{ initials }}</span>
          </div>
          <div>
            <div class="kcif-header__name">{{ provider.firstName }} {{ provider.lastName }}</div>
            <div class="kcif-header__cred">{{ provider.credential || provider.title || '' }}</div>
          </div>
        </div>
        <button class="kcif-header__close" aria-label="Close" @click="$emit('close')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Step 1: Select time slot -->
      <div v-if="step === 'slots'" class="kcif-body">
        <h2 class="kcif-body__title">Select your appointment time</h2>
        <p class="kcif-body__hint">Please select the time of your appointment below to check in.</p>

        <div v-if="loadingSlots" class="kcif-loading">
          <div class="kcif-spinner" />
          <span>Loading appointments…</span>
        </div>
        <div v-else-if="slots.length === 0" class="kcif-empty">
          No upcoming appointments found for today.
        </div>
        <div v-else class="kcif-slots-grid">
          <button
            v-for="slot in slots"
            :key="slot.eventId"
            class="kcif-slot"
            :class="{
              'kcif-slot--selected': selectedSlot?.eventId === slot.eventId,
              'kcif-slot--checked-in': slot.alreadyCheckedIn
            }"
            :disabled="slot.alreadyCheckedIn"
            @click="selectedSlot = slot"
          >
            <span class="kcif-slot__time">{{ formatTime(slot.startAt) }}</span>
            <span v-if="slot.roomName" class="kcif-slot__room">{{ slot.roomNumber || slot.roomName }}</span>
            <span v-if="slot.alreadyCheckedIn" class="kcif-slot__done">Checked in</span>
          </button>
        </div>

        <button
          v-if="slots.length > 0"
          class="kcif-btn kcif-btn--primary"
          :disabled="!selectedSlot"
          @click="confirmCheckIn"
        >
          Continue
        </button>
      </div>

      <!-- Step 2: Confirm check-in -->
      <div v-else-if="step === 'confirm'" class="kcif-body">
        <div class="kcif-confirm-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3a6b7a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h2 class="kcif-body__title">Confirm check-in</h2>
        <p class="kcif-body__hint">
          Checking in for your <strong>{{ formatTime(selectedSlot.startAt) }}</strong> appointment
          <span v-if="selectedSlot.roomName"> in {{ selectedSlot.roomName }}</span>.
        </p>
        <p class="kcif-body__hint" style="color: #5a7585; font-size: 14px;">
          Your provider will be notified.
        </p>
        <div class="kcif-confirm-actions">
          <button class="kcif-btn kcif-btn--secondary" @click="step = 'slots'">Back</button>
          <button class="kcif-btn kcif-btn--primary" :disabled="checkingIn" @click="submitCheckIn">
            <span v-if="checkingIn">Checking in…</span>
            <span v-else>Check In</span>
          </button>
        </div>
        <div v-if="checkInError" class="kcif-error">{{ checkInError }}</div>
      </div>

      <!-- Step 3: Questionnaires -->
      <div v-else-if="step === 'questionnaires'" class="kcif-body">
        <h2 class="kcif-body__title">
          {{ questionnaire ? questionnaire.title : 'Please complete the following' }}
        </h2>
        <p v-if="questionnaire?.description" class="kcif-body__hint">{{ questionnaire.description }}</p>

        <div v-if="loadingQuestionnaires" class="kcif-loading">
          <div class="kcif-spinner" />
          <span>Loading questionnaire…</span>
        </div>
        <div v-else-if="questionnaires.length === 0" class="kcif-empty">
          All done! No questionnaires required.
        </div>
        <div v-else class="kcif-quest-form">
          <div
            v-for="field in questionnaire?.fields || []"
            :key="field.id"
            class="kcif-quest-field"
          >
            <label class="kcif-quest-label">{{ field.field_label }}</label>

            <!-- Radio / select style options -->
            <div v-if="field.field_type === 'radio' || field.field_type === 'select'" class="kcif-quest-options">
              <button
                v-for="opt in field.options || []"
                :key="opt.value ?? opt"
                class="kcif-quest-option"
                :class="{ 'kcif-quest-option--selected': answers[field.id] === (opt.value ?? opt) }"
                @click="answers[field.id] = opt.value ?? opt"
              >
                {{ opt.label ?? opt }}
              </button>
            </div>

            <!-- Scale (0–10 or 0–3) -->
            <div v-else-if="field.field_type === 'scale'" class="kcif-quest-scale">
              <button
                v-for="n in scaleOptions(field)"
                :key="n"
                class="kcif-quest-scale-btn"
                :class="{ 'kcif-quest-scale-btn--selected': answers[field.id] === n }"
                @click="answers[field.id] = n"
              >
                {{ n }}
              </button>
            </div>

            <!-- Textarea / text -->
            <textarea
              v-else-if="field.field_type === 'textarea'"
              v-model="answers[field.id]"
              class="kcif-quest-textarea"
              rows="3"
            />
            <input
              v-else
              v-model="answers[field.id]"
              class="kcif-quest-input"
              :type="field.field_type === 'number' ? 'number' : 'text'"
            />
          </div>
        </div>

        <div class="kcif-confirm-actions" style="margin-top: 24px;">
          <button
            v-if="questionnaires.length > 0"
            class="kcif-btn kcif-btn--secondary"
            @click="skipQuestionnaire"
          >
            Skip
          </button>
          <button
            class="kcif-btn kcif-btn--primary"
            :disabled="submittingQuest"
            @click="submitQuestionnaire"
          >
            <span v-if="submittingQuest">Submitting…</span>
            <span v-else-if="questionnaires.length === 0">Continue</span>
            <span v-else>Submit &amp; Continue</span>
          </button>
        </div>
        <div v-if="questError" class="kcif-error">{{ questError }}</div>
      </div>

      <!-- Step 4: Thank you -->
      <div v-else-if="step === 'done'" class="kcif-body kcif-body--center">
        <div class="kcif-done-icon" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#2e7055" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <h2 class="kcif-body__title">You're checked in!</h2>
        <p class="kcif-body__hint">
          {{ provider.firstName }} has been notified. Please have a seat and they'll be with you shortly.
        </p>
        <button class="kcif-btn kcif-btn--primary" style="margin-top: 24px;" @click="$emit('close')">
          Done
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  provider: { type: Object, required: true },
  locationId: { type: [String, Number], required: true },
  timezone: { type: String, default: 'America/Denver' }
});
const emit = defineEmits(['close']);

const step = ref('slots'); // slots | confirm | questionnaires | done

// Slots
const slots = ref([]);
const loadingSlots = ref(true);
const selectedSlot = ref(null);
const checkingIn = ref(false);
const checkInError = ref('');

// Questionnaires
const questionnaires = ref([]);
const questIdx = ref(0);
const questionnaire = computed(() => questionnaires.value[questIdx.value] || null);
const loadingQuestionnaires = ref(false);
const answers = ref({});
const submittingQuest = ref(false);
const questError = ref('');

const photoUrl = computed(() => toUploadsUrl(props.provider.profilePhotoPath));
const initials = computed(() => {
  const f = (props.provider.firstName || '').charAt(0);
  const l = (props.provider.lastName || '').charAt(0);
  return `${f}${l}`.toUpperCase();
});

function formatTime(iso) {
  if (!iso) return '';
  // The DB stores local time strings — append 'Z' trick won't work here.
  // Instead, treat the string as a local time in the office's timezone.
  // The string looks like "2026-06-22 10:00:00" (local, no tz indicator).
  // We parse it naively then display it directly — it already IS the local time.
  const normalized = String(iso).replace(' ', 'T');
  // Strip any trailing Z so browsers don't re-interpret as UTC
  const noZ = normalized.endsWith('Z') ? normalized.slice(0, -1) : normalized;
  const d = new Date(noZ);
  if (Number.isNaN(d.getTime())) return String(iso);
  // Format using the office timezone so the displayed hour matches the stored local hour
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: props.timezone });
}

function scaleOptions(field) {
  const max = field.max_value ?? 10;
  const min = field.min_value ?? 0;
  const arr = [];
  for (let i = min; i <= max; i++) arr.push(i);
  return arr;
}

async function loadSlots() {
  loadingSlots.value = true;
  try {
    const res = await api.get(`/kiosk/${props.locationId}/providers/${props.provider.id}/slots-today`);
    slots.value = res.data?.slots || [];
  } catch {
    slots.value = [];
  } finally {
    loadingSlots.value = false;
  }
}

function confirmCheckIn() {
  if (!selectedSlot.value) return;
  step.value = 'confirm';
  checkInError.value = '';
}

async function submitCheckIn() {
  checkingIn.value = true;
  checkInError.value = '';
  try {
    await api.post(`/kiosk/${props.locationId}/checkin`, { eventId: selectedSlot.value.eventId });
    // After check-in, load questionnaires
    await loadQuestionnaires();
    step.value = 'questionnaires';
  } catch (e) {
    checkInError.value = e?.response?.data?.error?.message || 'Check-in failed. Please try again or contact the support team.';
  } finally {
    checkingIn.value = false;
  }
}

async function loadQuestionnaires() {
  loadingQuestionnaires.value = true;
  questionnaires.value = [];
  questIdx.value = 0;
  answers.value = {};
  try {
    const res = await api.get(`/kiosk/${props.locationId}/questionnaires`, { params: { eventId: selectedSlot.value.eventId } });
    const qs = res.data || [];

    // Fetch field definitions for each questionnaire
    const full = [];
    for (const q of qs) {
      try {
        let def = null;
        if (q.moduleId) {
          const r = await api.get(`/kiosk/${props.locationId}/questionnaires/${q.moduleId}/definition`);
          def = r.data;
        } else if (q.intakeLinkId) {
          const r = await api.get(`/kiosk/${props.locationId}/intake-questionnaire/${q.intakeLinkId}/definition`);
          def = r.data;
        }
        full.push({ ...q, fields: def?.fields || [] });
      } catch {
        full.push({ ...q, fields: [] });
      }
    }
    questionnaires.value = full;
  } catch {
    questionnaires.value = [];
  } finally {
    loadingQuestionnaires.value = false;
  }
}

function skipQuestionnaire() {
  advanceOrFinish();
}

async function submitQuestionnaire() {
  if (!questionnaire.value) {
    advanceOrFinish();
    return;
  }
  submittingQuest.value = true;
  questError.value = '';
  try {
    const q = questionnaire.value;
    await api.post(`/kiosk/${props.locationId}/questionnaires/submit`, {
      eventId: selectedSlot.value.eventId,
      moduleId: q.moduleId || undefined,
      intakeLinkId: q.intakeLinkId || undefined,
      answers: answers.value,
      typicalDayTime: true
    });
    advanceOrFinish();
  } catch (e) {
    questError.value = e?.response?.data?.error?.message || 'Could not submit. Please try again.';
  } finally {
    submittingQuest.value = false;
  }
}

function advanceOrFinish() {
  answers.value = {};
  if (questIdx.value < questionnaires.value.length - 1) {
    questIdx.value++;
  } else {
    step.value = 'done';
  }
}

function onOverlayClick() {
  if (step.value === 'done') emit('close');
}

onMounted(loadSlots);
</script>

<style scoped>
.kcif-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 40, 55, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.kcif-panel {
  background: #fff;
  border-radius: 20px;
  width: 100%;
  max-width: 560px;
  max-height: 90dvh;
  overflow-y: auto;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
}

/* Header */
.kcif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 18px;
  border-bottom: 1px solid #eaeff3;
}
.kcif-header__provider {
  display: flex;
  align-items: center;
  gap: 14px;
}
.kcif-header__avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  overflow: hidden;
  background: #d0e4ea;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #1e4a5a;
  flex-shrink: 0;
}
.kcif-header__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.kcif-header__name {
  font-size: 17px;
  font-weight: 700;
  color: #1a2f3a;
}
.kcif-header__cred {
  font-size: 13px;
  color: #6b8494;
}
.kcif-header__close {
  background: none;
  border: none;
  cursor: pointer;
  color: #8aa3b0;
  padding: 4px;
  border-radius: 8px;
  line-height: 1;
  transition: color 0.1s, background 0.1s;
}
.kcif-header__close:hover { color: #1a2f3a; background: #f0f4f6; }

/* Body */
.kcif-body {
  padding: 24px 24px 28px;
}
.kcif-body--center {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.kcif-body__title {
  font-size: 22px;
  font-weight: 800;
  color: #1a2f3a;
  margin: 0 0 8px;
}
.kcif-body__hint {
  font-size: 15px;
  color: #4a6070;
  margin: 0 0 20px;
  line-height: 1.5;
}

/* Slots */
.kcif-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}
.kcif-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 10px;
  border: 2px solid #e2ecf0;
  border-radius: 12px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.kcif-slot:hover:not(:disabled) {
  border-color: #3a6b7a;
  background: #f3f8fa;
}
.kcif-slot--selected {
  border-color: #3a6b7a;
  background: #e8f4f7;
}
.kcif-slot--checked-in {
  opacity: 0.5;
  cursor: not-allowed;
}
.kcif-slot__time {
  font-size: 18px;
  font-weight: 700;
  color: #1a2f3a;
}
.kcif-slot__room {
  font-size: 12px;
  color: #6b8494;
}
.kcif-slot__done {
  font-size: 11px;
  background: #eef6f3;
  color: #2e7055;
  border-radius: 8px;
  padding: 2px 8px;
  font-weight: 600;
}

/* Confirm */
.kcif-confirm-icon,
.kcif-done-icon {
  margin-bottom: 16px;
}
.kcif-confirm-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* Questionnaire */
.kcif-quest-form { display: flex; flex-direction: column; gap: 20px; }
.kcif-quest-field { display: flex; flex-direction: column; gap: 8px; }
.kcif-quest-label {
  font-size: 15px;
  font-weight: 600;
  color: #1a2f3a;
  line-height: 1.4;
}
.kcif-quest-options,
.kcif-quest-scale { display: flex; flex-wrap: wrap; gap: 8px; }
.kcif-quest-option,
.kcif-quest-scale-btn {
  padding: 8px 16px;
  border: 2px solid #e2ecf0;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  color: #2a4a5a;
  font-weight: 500;
  transition: border-color 0.1s, background 0.1s;
}
.kcif-quest-option:hover,
.kcif-quest-scale-btn:hover { border-color: #3a6b7a; background: #f0f7f9; }
.kcif-quest-option--selected,
.kcif-quest-scale-btn--selected { border-color: #3a6b7a; background: #e8f4f7; color: #1a3a4a; }
.kcif-quest-input,
.kcif-quest-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #dde6eb;
  border-radius: 10px;
  font-size: 15px;
  color: #1a2f3a;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.12s;
}
.kcif-quest-input:focus,
.kcif-quest-textarea:focus { border-color: #3a6b7a; }

/* Buttons */
.kcif-btn {
  padding: 12px 28px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  border: none;
  transition: opacity 0.12s, background 0.12s;
}
.kcif-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.kcif-btn--primary { background: #1e3a4a; color: #fff; }
.kcif-btn--primary:hover:not(:disabled) { background: #2d5265; }
.kcif-btn--secondary { background: #e8edf2; color: #2a4a5a; }
.kcif-btn--secondary:hover:not(:disabled) { background: #dae3ea; }

/* Misc */
.kcif-loading, .kcif-empty {
  padding: 32px 0;
  text-align: center;
  color: #7a9aaa;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.kcif-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #dde6eb;
  border-top-color: #3a6b7a;
  border-radius: 50%;
  animation: kcif-spin 0.7s linear infinite;
}
@keyframes kcif-spin { to { transform: rotate(360deg); } }

.kcif-error {
  margin-top: 12px;
  color: #c0392b;
  font-size: 14px;
  background: #fdf0ee;
  border-radius: 8px;
  padding: 10px 14px;
}
</style>
