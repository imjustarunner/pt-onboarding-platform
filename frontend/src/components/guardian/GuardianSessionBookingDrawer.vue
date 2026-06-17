<template>
  <div v-if="open" class="gsb-overlay" @click.self="$emit('close')">
    <div class="gsb-drawer" role="dialog" aria-modal="true" aria-label="Book tutoring sessions">
      <div class="gsb-header">
        <h3 class="gsb-title">Book tutoring sessions</h3>
        <button class="gsb-close" @click="$emit('close')" aria-label="Close">&times;</button>
      </div>

      <!-- Step indicator -->
      <div class="gsb-steps">
        <span
          v-for="(s, i) in visibleSteps"
          :key="s.id"
          :class="['gsb-step-dot', { active: stepIndex === i, done: stepIndex > i }]"
        />
      </div>

      <div class="gsb-body">
        <!-- STEP: Package -->
        <div v-if="currentStep === 'package'" class="gsb-section">
          <h4>How many sessions?</h4>
          <p v-if="minPkg > 1" class="gsb-hint">
            {{ providerName }} requires a minimum package of <strong>{{ minPkg }}</strong> sessions.
          </p>
          <div class="gsb-pkg-row">
            <button class="gsb-qty-btn" @click="sessionCount = Math.max(minPkg, sessionCount - 1)">–</button>
            <span class="gsb-qty-val">{{ sessionCount }}</span>
            <button class="gsb-qty-btn" @click="sessionCount++">+</button>
          </div>
          <p v-if="sessionRateCents" class="gsb-total">
            Total: <strong>{{ fmtMoney(sessionRateCents * sessionCount) }}</strong>
            <span class="gsb-muted"> ({{ fmtMoney(sessionRateCents) }} / session)</span>
          </p>
          <p v-if="paymentPolicy === 'PREPAY'" class="gsb-policy-badge prepay">Prepayment required at booking</p>
          <p v-else class="gsb-policy-badge post">Charged after each completed session</p>
        </div>

        <!-- STEP: Schedule -->
        <div v-if="currentStep === 'schedule'" class="gsb-section">
          <h4>Choose a time slot</h4>
          <div class="gsb-week-nav">
            <button class="gsb-nav-btn" @click="shiftWeek(-1)">&lsaquo;</button>
            <span class="gsb-week-label">{{ weekLabel }}</span>
            <button class="gsb-nav-btn" @click="shiftWeek(1)">&rsaquo;</button>
          </div>
          <div v-if="slotsLoading" class="gsb-loading">Loading availability…</div>
          <div v-else-if="!slots.length" class="gsb-empty">No available slots this week.</div>
          <ul v-else class="gsb-slot-list">
            <li
              v-for="slot in slots"
              :key="slot.start"
              :class="['gsb-slot', { selected: selectedSlot?.start === slot.start }]"
              @click="selectedSlot = slot"
            >
              <span class="gsb-slot-day">{{ fmtSlotDay(slot.start) }}</span>
              <span class="gsb-slot-time">{{ fmtSlotTime(slot.start) }} – {{ fmtSlotTime(slot.end) }}</span>
            </li>
          </ul>
        </div>

        <!-- STEP: Notes -->
        <div v-if="currentStep === 'notes'" class="gsb-section">
          <h4>Additional notes</h4>
          <p class="gsb-hint">Anything the tutor should know about your child's needs or goals.</p>
          <textarea
            v-model="notes"
            rows="4"
            class="gsb-textarea"
            placeholder="Optional — goals, accommodations, subject focus…"
          />
        </div>

        <!-- STEP: Payment (PREPAY only) -->
        <div v-if="currentStep === 'payment'" class="gsb-section">
          <h4>Payment</h4>
          <p class="gsb-hint">
            You will be charged <strong>{{ fmtMoney(sessionRateCents * sessionCount) }}</strong>
            to reserve {{ sessionCount }} session{{ sessionCount !== 1 ? 's' : '' }}.
          </p>
          <div v-if="stripeLoading" class="gsb-loading">Loading payment form…</div>
          <div v-else-if="stripeError" class="gsb-error">{{ stripeError }}</div>
          <div v-else>
            <div id="gsb-card-element" class="gsb-stripe-element" />
            <div v-if="cardError" class="gsb-error" style="margin-top: 6px;">{{ cardError }}</div>
          </div>
        </div>

        <!-- STEP: Confirm (POST_SESSION) -->
        <div v-if="currentStep === 'confirm'" class="gsb-section">
          <h4>Confirm your request</h4>
          <div class="gsb-confirm-row">
            <span class="gsb-confirm-label">Child</span>
            <span>{{ childName }}</span>
          </div>
          <div class="gsb-confirm-row">
            <span class="gsb-confirm-label">Tutor</span>
            <span>{{ providerName }}</span>
          </div>
          <div v-if="selectedSlot" class="gsb-confirm-row">
            <span class="gsb-confirm-label">First session</span>
            <span>{{ fmtSlotDay(selectedSlot.start) }} {{ fmtSlotTime(selectedSlot.start) }}</span>
          </div>
          <div class="gsb-confirm-row">
            <span class="gsb-confirm-label">Sessions booked</span>
            <span>{{ sessionCount }}</span>
          </div>
          <div v-if="sessionRateCents" class="gsb-confirm-row">
            <span class="gsb-confirm-label">Rate</span>
            <span>{{ fmtMoney(sessionRateCents) }} / session</span>
          </div>
          <div class="gsb-confirm-row">
            <span class="gsb-confirm-label">Payment</span>
            <span>{{ paymentPolicy === 'PREPAY' ? 'Prepaid' : 'Charged after each session' }}</span>
          </div>
          <div v-if="notes" class="gsb-confirm-row">
            <span class="gsb-confirm-label">Notes</span>
            <span class="gsb-muted small">{{ notes }}</span>
          </div>
        </div>

        <!-- SUCCESS -->
        <div v-if="submitted" class="gsb-success">
          <div class="gsb-success-icon">✓</div>
          <p>Your booking request has been submitted! An admin will review and confirm your session.</p>
          <button class="btn btn-primary" @click="$emit('close')">Done</button>
        </div>
      </div>

      <!-- Footer navigation -->
      <div v-if="!submitted" class="gsb-footer">
        <button
          v-if="stepIndex > 0"
          class="btn btn-secondary"
          @click="stepIndex--"
          :disabled="submitting"
        >Back</button>
        <span style="flex:1" />
        <button
          v-if="!isLastStep"
          class="btn btn-primary"
          @click="advance"
          :disabled="!canAdvance || submitting"
        >Next</button>
        <button
          v-else
          class="btn btn-primary"
          @click="submit"
          :disabled="!canAdvance || submitting"
        >{{ submitting ? 'Submitting…' : 'Submit request' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { loadStripe } from '@stripe/stripe-js';
import api from '../../services/api';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencySlug: { type: String, required: true },
  providerId: { type: Number, required: true },
  providerName: { type: String, default: 'Your tutor' },
  childId: { type: Number, default: null },
  childName: { type: String, default: '' },
  sessionRateCents: { type: Number, default: null },
  minSessionPackage: { type: Number, default: 1 },
  paymentPolicy: { type: String, default: 'POST_SESSION' }
});

const emit = defineEmits(['close', 'submitted']);

// ── state ───────────────────────────────────────────────────────────────
const stepIndex = ref(0);
const sessionCount = ref(props.minSessionPackage || 1);
const selectedSlot = ref(null);
const notes = ref('');
const submitting = ref(false);
const submitted = ref(false);
const submitError = ref('');

// slot picker
const slots = ref([]);
const slotsLoading = ref(false);
const weekStart = ref(sundayOfCurrentWeek());
const weekLabel = computed(() => {
  const end = new Date(weekStart.value);
  end.setDate(end.getDate() + 6);
  return `${weekStart.value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
});

// stripe
const stripeLoading = ref(false);
const stripeError = ref('');
const cardError = ref('');
let stripeInstance = null;
let cardElement = null;

// ── computed ─────────────────────────────────────────────────────────────
const minPkg = computed(() => Math.max(1, props.minSessionPackage || 1));

const visibleSteps = computed(() => {
  const steps = [
    { id: 'package' },
    { id: 'schedule' },
    { id: 'notes' }
  ];
  if (props.paymentPolicy === 'PREPAY') {
    steps.push({ id: 'payment' });
  } else {
    steps.push({ id: 'confirm' });
  }
  return steps;
});

const currentStep = computed(() => visibleSteps.value[stepIndex.value]?.id);
const isLastStep = computed(() => stepIndex.value === visibleSteps.value.length - 1);

const canAdvance = computed(() => {
  if (currentStep.value === 'package') return sessionCount.value >= minPkg.value;
  if (currentStep.value === 'schedule') return !!selectedSlot.value;
  return true;
});

// ── helpers ───────────────────────────────────────────────────────────────
function sundayOfCurrentWeek() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function shiftWeek(delta) {
  const d = new Date(weekStart.value);
  d.setDate(d.getDate() + delta * 7);
  weekStart.value = d;
}

function fmtMoney(cents) {
  if (!cents) return '$0';
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
}

function fmtSlotDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtSlotTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

async function loadSlots() {
  if (!props.providerId || !props.agencySlug) return;
  slotsLoading.value = true;
  slots.value = [];
  try {
    const weekOf = weekStart.value.toISOString().slice(0, 10);
    const res = await api.get(
      `/public/agency-services/${encodeURIComponent(props.agencySlug)}/providers/${props.providerId}/slots?weekOf=${weekOf}`,
      { skipGlobalLoading: true }
    );
    slots.value = Array.isArray(res.data?.slots) ? res.data.slots : [];
  } catch {
    slots.value = [];
  } finally {
    slotsLoading.value = false;
  }
}

async function mountStripe() {
  if (!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY) return;
  stripeLoading.value = true;
  stripeError.value = '';
  try {
    stripeInstance = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
    await nextTick();
    const elements = stripeInstance.elements();
    cardElement = elements.create('card', {
      style: { base: { fontSize: '15px', color: '#1a1a2e', '::placeholder': { color: '#999' } } }
    });
    cardElement.mount('#gsb-card-element');
    cardElement.on('change', (e) => { cardError.value = e.error?.message || ''; });
  } catch (e) {
    stripeError.value = 'Could not load payment form.';
  } finally {
    stripeLoading.value = false;
  }
}

// ── lifecycle ─────────────────────────────────────────────────────────────
watch(() => props.open, (v) => {
  if (v) {
    stepIndex.value = 0;
    sessionCount.value = minPkg.value;
    selectedSlot.value = null;
    notes.value = '';
    submitted.value = false;
    submitError.value = '';
  }
});

watch(
  () => weekStart.value,
  () => { if (currentStep.value === 'schedule') loadSlots(); }
);

watch(currentStep, async (step) => {
  if (step === 'schedule') await loadSlots();
  if (step === 'payment') await nextTick().then(mountStripe);
});

// ── navigation ────────────────────────────────────────────────────────────
async function advance() {
  if (!canAdvance.value) return;
  stepIndex.value++;
}

async function submit() {
  if (submitting.value) return;
  submitting.value = true;
  submitError.value = '';
  try {
    let paymentToken = null;
    if (props.paymentPolicy === 'PREPAY' && cardElement && stripeInstance) {
      const { paymentMethod, error } = await stripeInstance.createPaymentMethod({
        type: 'card',
        card: cardElement
      });
      if (error) {
        cardError.value = error.message;
        submitting.value = false;
        return;
      }
      paymentToken = paymentMethod.id;
    }

    await api.post(
      `/public/agency-services/${encodeURIComponent(props.agencySlug)}/requests`,
      {
        serviceType: 'tutoring',
        sessionType: 'tutoring',
        providerId: props.providerId,
        clientId: props.childId || undefined,
        requestedStartAt: selectedSlot.value?.start,
        requestedEndAt: selectedSlot.value?.end,
        modality: 'IN_PERSON',
        notes: notes.value || null,
        sessionCount: sessionCount.value,
        bookingMode: 'CURRENT_CLIENT',
        paymentPolicyToken: paymentToken
      },
      { skipGlobalLoading: true }
    );

    submitted.value = true;
    emit('submitted');
  } catch (e) {
    submitError.value = e.response?.data?.error?.message || 'Submission failed. Please try again.';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.gsb-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.gsb-drawer {
  background: #fff;
  border-radius: 18px 18px 0 0;
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.gsb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.gsb-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #1a1a2e;
}

.gsb-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #888;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.gsb-steps {
  display: flex;
  gap: 6px;
  padding: 10px 20px 6px;
}

.gsb-step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ddd;
  transition: background 0.2s;
}
.gsb-step-dot.active { background: #4f46e5; }
.gsb-step-dot.done { background: #22c55e; }

.gsb-body {
  flex: 1;
  padding: 16px 20px;
}

.gsb-section h4 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
}

.gsb-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #666;
}

.gsb-pkg-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.gsb-qty-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid #4f46e5;
  background: #fff;
  color: #4f46e5;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.gsb-qty-btn:hover { background: #f0f0ff; }

.gsb-qty-val {
  font-size: 22px;
  font-weight: 700;
  color: #1a1a2e;
  min-width: 32px;
  text-align: center;
}

.gsb-total {
  margin: 0 0 10px;
  font-size: 15px;
  color: #1a1a2e;
}

.gsb-policy-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  margin-top: 4px;
}
.gsb-policy-badge.prepay { background: #fef9c3; color: #92400e; }
.gsb-policy-badge.post { background: #dcfce7; color: #14532d; }

.gsb-week-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.gsb-nav-btn {
  background: none;
  border: 1px solid #ddd;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 18px;
  color: #4f46e5;
}

.gsb-week-label {
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.gsb-loading, .gsb-empty {
  font-size: 13px;
  color: #888;
  padding: 12px 0;
}

.gsb-slot-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gsb-slot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 2px solid #e8e8f0;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.gsb-slot:hover { border-color: #4f46e5; background: #f5f4ff; }
.gsb-slot.selected { border-color: #4f46e5; background: #eef2ff; }

.gsb-slot-day { font-size: 13px; font-weight: 600; color: #1a1a2e; flex: 1; }
.gsb-slot-time { font-size: 12px; color: #555; }

.gsb-textarea {
  width: 100%;
  border: 1.5px solid #ddd;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  color: #1a1a2e;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}
.gsb-textarea:focus { border-color: #4f46e5; }

.gsb-stripe-element {
  border: 1.5px solid #ddd;
  border-radius: 10px;
  padding: 12px 14px;
  background: #fff;
}

.gsb-confirm-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid #f4f4f8;
  font-size: 14px;
}
.gsb-confirm-label {
  color: #888;
  font-size: 12px;
  min-width: 100px;
  padding-top: 1px;
}

.gsb-muted { color: #888; }
.gsb-muted.small, .small { font-size: 12px; }

.gsb-error {
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-top: 8px;
}

.gsb-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px 0;
  text-align: center;
}

.gsb-success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #22c55e;
  color: #fff;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gsb-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px 20px;
  border-top: 1px solid #f0f0f0;
}

.btn { padding: 9px 20px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
.btn-primary { background: #4f46e5; color: #fff; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: #f4f4f8; color: #4f46e5; border: 1.5px solid #ddd; }
</style>
