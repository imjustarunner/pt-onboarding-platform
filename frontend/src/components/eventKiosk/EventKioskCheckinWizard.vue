<template>
  <div v-if="open" class="ek-checkin-overlay" @click.self="emitClose">
    <div class="ek-checkin-card">
      <header class="ek-checkin-hdr">
        <div>
          <div class="ek-checkin-title">Check in {{ clientLabel }}</div>
          <div class="muted small">{{ currentStepMeta.subtitle }}</div>
        </div>
        <button type="button" class="btn btn-text" @click="emitClose">Close</button>
      </header>

      <div class="ek-checkin-progress" aria-hidden="true">
        <span
          v-for="(s, i) in steps"
          :key="s.id"
          class="ek-checkin-dot"
          :class="{ 'ek-checkin-dot--active': i === stepIndex, 'ek-checkin-dot--done': i < stepIndex }"
        />
      </div>
      <p class="ek-checkin-step-label muted small">
        Step {{ stepIndex + 1 }} of {{ steps.length }} — {{ currentStepMeta.title }}
      </p>

      <div v-if="error" class="error-box ek-checkin-err">{{ error }}</div>
      <div v-if="sheetLoading" class="muted small">Loading…</div>

      <template v-else-if="sheet">
        <!-- Step: Emergency contacts -->
        <section v-if="currentStepId === 'emergency'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">Emergency contacts</h4>
          <ul v-if="sheet.emergencyContacts?.length" class="ek-checkin-list">
            <li v-for="(e, i) in sheet.emergencyContacts" :key="`ec-${i}`">
              <strong>{{ e.name }}</strong>
              <span v-if="e.relationship" class="muted small"> · {{ e.relationship }}</span>
              <div v-if="e.phone" class="muted small">{{ e.phone }}</div>
            </li>
          </ul>
          <p v-else class="muted small">None on file.</p>
          <div v-if="checkerIsGuardian" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="requestWaiverEdit('emergency_contacts')">
              {{ sheet.emergencyContacts?.length ? 'Edit contacts' : 'Add emergency contact' }}
            </button>
          </div>
          <p v-else class="muted small ek-checkin-step-actions">
            Sign in as the account guardian to add or update emergency contacts.
          </p>
        </section>

        <!-- Step: Authorized pickups -->
        <section v-else-if="currentStepId === 'pickup'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">Authorized drivers &amp; pickups</h4>
          <p class="muted small">
            {{ sheetHasPickups ? `Review who may pick up ${clientLabel} today.` : `No authorized pickup people on file yet.` }}
          </p>
          <p v-if="sheetGuardianPickups.length" class="ek-checkin-sub muted small">Guardians</p>
          <ul v-if="sheetGuardianPickups.length" class="ek-checkin-list">
            <li v-for="(p, i) in sheetGuardianPickups" :key="`sg-${i}`">
              <strong>{{ p.name }}</strong>
              <span class="muted small"> · Guardian</span>
              <div v-if="p.phone" class="muted small">{{ p.phone }}</div>
            </li>
          </ul>
          <p v-if="sheetOtherPickups.length" class="ek-checkin-sub muted small">Other authorized pickups</p>
          <ul v-if="sheetOtherPickups.length" class="ek-checkin-list">
            <li v-for="(p, i) in sheetOtherPickups" :key="`so-${i}`">
              <strong>{{ p.name }}</strong>
              <span v-if="p.relationship" class="muted small"> · {{ p.relationship }}</span>
              <div v-if="p.phone" class="muted small">{{ p.phone }}</div>
            </li>
          </ul>

          <!-- Inline add/edit pickup people (no signature required) -->
          <div class="ek-pickup-inline">
            <div class="ek-pickup-inline-hdr">
              <span class="small muted">{{ inlinePickups.length ? 'Edit or add pickup contacts' : 'Add pickup contacts' }}</span>
              <button v-if="!inlinePickupOpen" type="button" class="btn btn-secondary btn-sm" @click="openInlinePickups">
                {{ sheetHasPickups ? 'Add / edit' : 'Add person' }}
              </button>
            </div>
            <div v-if="inlinePickupOpen" class="ek-pickup-inline-form">
              <div v-for="(row, idx) in inlinePickups" :key="`ip-${idx}`" class="ek-pickup-inline-row">
                <input v-model="row.name" class="input" type="text" placeholder="Full name" />
                <input v-model="row.relationship" class="input" type="text" placeholder="Relationship (e.g. Aunt)" />
                <input v-model="row.phone" class="input" type="tel" inputmode="tel" placeholder="Phone (10 digits)" />
                <button type="button" class="btn btn-secondary btn-sm" @click="inlinePickups.splice(idx, 1)">Remove</button>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" @click="inlinePickups.push({ name: '', relationship: '', phone: '' })">
                + Add another person
              </button>
              <div v-if="inlinePickupError" class="error-box ek-checkin-err">{{ inlinePickupError }}</div>
              <div class="ek-pickup-inline-actions">
                <button type="button" class="btn btn-secondary btn-sm" @click="closeInlinePickups">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" :disabled="inlinePickupSaving" @click="saveInlinePickups">
                  {{ inlinePickupSaving ? 'Saving…' : 'Save contacts' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Formal waiver signing (guardian flow) -->
          <div v-if="canEditWaivers" class="ek-checkin-step-actions">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              @click="requestWaiverEdit('pickup_authorization')"
            >
              Sign formal pickup authorization
            </button>
          </div>
        </section>

        <!-- Step: Walk-home -->
        <section v-else-if="currentStepId === 'walk_home'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">Walk-home authorization</h4>
          <div v-if="sheet.walkHome?.allowedToWalkHome" class="ek-checkin-ok">
            <strong>Authorized to walk home alone.</strong>
            <p v-if="sheet.walkHome.allowedWindow" class="small muted">
              Window: {{ sheet.walkHome.allowedWindow }}
            </p>
            <p v-if="sheet.walkHome.route" class="small muted">Route: {{ sheet.walkHome.route }}</p>
            <p v-if="sheet.walkHome.conditions" class="small muted">{{ sheet.walkHome.conditions }}</p>
          </div>
          <p v-else class="muted small">Not authorized to walk home alone from this program.</p>
          <div v-if="checkerIsGuardian" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="requestWaiverEdit('walk_home_authorization')">
              Add or change
            </button>
          </div>
          <p v-else class="muted small ek-checkin-step-actions">
            Sign in as the account guardian to update walk-home authorization.
          </p>
        </section>

        <!-- Step: Who is checking in (identity first) -->
        <section v-if="currentStepId === 'checker'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">Who is checking in {{ clientLabel }}?</h4>
          <p class="muted small">Tap your name. Guardians can update child information on the following steps.</p>

          <ul class="ek-checker-list">
            <li
              v-for="opt in checkerOptions"
              :key="opt.key"
              class="ek-checker-opt"
              :class="{ 'ek-checker-opt--sel': checkerSelectedKey === opt.key, 'ek-checker-opt--guardian': opt.kind === 'guardian' }"
              @click="selectChecker(opt)"
            >
              <div>
                <strong>{{ opt.name }}</strong>
                <span class="muted small"> · {{ opt.relationship }}</span>
                <span v-if="opt.kind === 'guardian'" class="ek-guardian-badge">Main guardian</span>
              </div>
              <span v-if="checkerSelectedKey === opt.key" class="ek-checker-tick">✓</span>
            </li>
            <li
              class="ek-checker-opt"
              :class="{ 'ek-checker-opt--sel': checkerSelectedKey === 'other' }"
              @click="selectSomeoneElse"
            >
              <div>
                <strong>Someone else</strong>
                <span class="muted small"> · Not listed above</span>
              </div>
              <span v-if="checkerSelectedKey === 'other'" class="ek-checker-tick">✓</span>
            </li>
          </ul>

          <!-- Guardian identity confirmation -->
          <div v-if="checkerKind === 'guardian'" class="ek-guardian-confirm">
            <label class="ek-checkin-check-row">
              <input v-model="guardianIdentityConfirmed" type="checkbox" />
              <span>I confirm that I am <strong>{{ selectedCheckerName }}</strong> and I am authorized to update this child's information.</span>
            </label>
            <p class="muted small ek-guardian-confirm-note">
              As the account guardian, you can update emergency contacts, walk-home authorization, and other details on the following steps.
            </p>
          </div>

          <div v-if="checkerKind === 'other'" class="ek-checker-other">
            <div class="ek-checkin-field">
              <label class="ek-checkin-lbl">Your name</label>
              <input v-model="otherCheckerName" class="input" type="text" placeholder="First and last name" />
            </div>
            <div class="ek-checkin-field">
              <label class="ek-checkin-lbl">Relationship to {{ clientLabel }} (optional)</label>
              <input v-model="otherCheckerRelationship" class="input" type="text" placeholder="e.g. Aunt, Family friend" />
            </div>
            <label class="ek-checkin-lbl">Sign to check in</label>
            <SignaturePad compact @signed="(d) => (otherCheckerSig = d)" />
            <p class="muted small">No photo required.</p>
          </div>
        </section>

        <!-- Step: Allergies & snacks (one page) -->
        <section v-else-if="currentStepId === 'allergies'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">Allergies &amp; approved snacks</h4>
          <template v-if="sheet.allergies">
            <div v-if="allergyText" class="ek-checkin-banner ek-checkin-banner--warn">
              <strong>Allergies / medical:</strong> {{ allergyText }}
            </div>
            <p v-else-if="sheet.allergies.applyNone" class="muted small">No medical info reported.</p>
            <p v-else class="muted small">No known allergies listed.</p>
            <p v-if="sheet.allergies.notes" class="small">
              <strong>Notes:</strong> {{ sheet.allergies.notes }}
            </p>
            <div class="ek-checkin-snack-block">
              <strong>Approved snacks</strong>
              <p v-if="sheet.allergies.noSnacks" class="ek-checkin-banner ek-checkin-banner--warn small">
                Do not give snacks to this child.
              </p>
              <p v-else-if="snacksSummary" class="small">{{ snacksSummary }}</p>
              <p v-else class="muted small">None on file.</p>
            </div>
          </template>
          <p v-else class="muted small">No allergy or snack information on file.</p>
          <div v-if="canEditWaivers" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="requestWaiverEdit('allergies_snacks')">
              Add or change
            </button>
          </div>
          <p v-else-if="sheet.waiversEnabled && !attributionGuardianId" class="muted small ek-checkin-step-actions">
            A linked guardian is required to add or change this — staff can help.
          </p>
          <label class="ek-checkin-check-row">
            <input v-model="allergiesConfirmed" type="checkbox" />
            <span>Allergies and snack information above is correct.</span>
          </label>
        </section>

        <footer class="ek-checkin-footer">
          <button v-if="stepIndex > 0" type="button" class="btn btn-secondary" @click="prevStep">Back</button>
          <button type="button" class="btn btn-secondary" @click="emitClose">Cancel</button>
          <button
            v-if="!isLastStep"
            type="button"
            class="btn btn-primary"
            :disabled="!canAdvanceStep"
            @click="nextStep"
          >
            {{ advanceLabel }}
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            :disabled="!canComplete || submitting"
            @click="completeCheckin"
          >
            {{ submitting ? 'Checking in…' : 'Complete check-in' }}
          </button>
        </footer>
      </template>
    </div>

    <!-- Waiver section editor -->
    <div v-if="waiverEditOpen" class="ek-checkin-overlay ek-checkin-overlay--stack" @click.self="closeWaiverEdit">
      <div class="ek-checkin-card">
        <header class="ek-checkin-hdr">
          <div class="ek-checkin-title">{{ waiverTitle }}</div>
          <button type="button" class="btn btn-text" @click="closeWaiverEdit">Close</button>
        </header>
        <component
          :is="waiverFieldComponent"
          v-if="waiverFieldComponent"
          v-model="waiverDraft"
          :snack-options="snackOptions"
        />
        <div class="ek-checkin-waiver-checks">
          <label class="ek-checkin-check-row">
            <input v-model="waiverConsent" type="checkbox" />
            <span>I have read this section and consent to sign.</span>
          </label>
          <label class="ek-checkin-check-row">
            <input v-model="waiverIntent" type="checkbox" />
            <span>I intend my electronic signature to have the same effect as a handwritten signature.</span>
          </label>
        </div>
        <SignaturePad compact @signed="(d) => (waiverSig = d)" />
        <div v-if="waiverError" class="error-box ek-checkin-err">{{ waiverError }}</div>
        <footer class="ek-checkin-footer">
          <button type="button" class="btn btn-secondary" @click="closeWaiverEdit">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="waiverSaving" @click="saveWaiverEdit">
            {{ waiverSaving ? 'Saving…' : 'Save & return' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import SignaturePad from '../SignaturePad.vue';
import GwvFieldsEsign from '../../views/guardian/waivers/GwvFieldsEsign.vue';
import GwvFieldsPickup from '../../views/guardian/waivers/GwvFieldsPickup.vue';
import GwvFieldsEmergency from '../../views/guardian/waivers/GwvFieldsEmergency.vue';
import GwvFieldsWalkHome from '../../views/guardian/waivers/GwvFieldsWalkHome.vue';
import GwvFieldsAllergies from '../../views/guardian/waivers/GwvFieldsAllergies.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  client: { type: Object, default: null },
  sheetUrl: { type: String, required: true },
  waiverUrl: { type: String, required: true },
  /** Endpoint for saving kiosk-direct pickup contacts (no signature required). */
  pickupsUrl: { type: String, default: '' },
  checkinUrl: { type: String, required: true },
  authHeaders: { type: Function, default: () => ({}) },
  snackOptions: { type: Array, default: () => [] },
  displayName: { type: Function, default: (c) => c?.fullName || c?.initials || 'Client' }
});

const emit = defineEmits(['close', 'checked-in', 'sheet-updated']);

const steps = [
  { id: 'checker', title: 'Who is checking in?', subtitle: 'Tell us who is dropping off today.' },
  { id: 'emergency', title: 'Emergency contacts', subtitle: 'Confirm or update emergency contacts.' },
  { id: 'pickup', title: 'Authorized pickups', subtitle: 'Confirm who may pick up your child.' },
  { id: 'walk_home', title: 'Walk-home authorization', subtitle: 'Confirm walk-home rules for this program.' },
  { id: 'allergies', title: 'Allergies & snacks', subtitle: 'Review allergies and approved snacks on one page.' }
];

const WAIVER_FIELDS = {
  esignature_consent: GwvFieldsEsign,
  pickup_authorization: GwvFieldsPickup,
  emergency_contacts: GwvFieldsEmergency,
  walk_home_authorization: GwvFieldsWalkHome,
  allergies_snacks: GwvFieldsAllergies
};
const WAIVER_TITLES = {
  esignature_consent: 'E-signature consent',
  pickup_authorization: 'Authorized pickups',
  emergency_contacts: 'Emergency contacts',
  walk_home_authorization: 'Walk-home authorization',
  allergies_snacks: 'Allergies & approved snacks'
};

const sheet = ref(null);
const sheetLoading = ref(false);
const error = ref('');
const submitting = ref(false);
const stepIndex = ref(0);
const guardianUserId = ref(null);
const allergiesConfirmed = ref(false);

const checkerSelectedKey = ref('');
const checkerKind = ref('');
const guardianIdentityConfirmed = ref(false);
const otherCheckerName = ref('');
const otherCheckerRelationship = ref('');
const otherCheckerSig = ref('');

const waiverEditOpen = ref(false);
const waiverEditKey = ref('');
const pendingWaiverKey = ref('');
const waiverDraft = ref({});
const waiverConsent = ref(false);
const waiverIntent = ref(false);
const waiverSig = ref('');
const waiverSaving = ref(false);
const waiverError = ref('');

// Inline (no-signature) pickup editing
const inlinePickupOpen = ref(false);
const inlinePickups = ref([]);
const inlinePickupSaving = ref(false);
const inlinePickupError = ref('');

const clientLabel = computed(() => props.displayName(props.client));
const currentStepId = computed(() => steps[stepIndex.value]?.id || 'emergency');
const currentStepMeta = computed(() => steps[stepIndex.value] || steps[0]);
const isLastStep = computed(() => stepIndex.value >= steps.length - 1);

const sheetGuardianPickups = computed(() =>
  (sheet.value?.authorizedPickups || []).filter((p) => p.source === 'guardian')
);
const sheetOtherPickups = computed(() =>
  (sheet.value?.authorizedPickups || []).filter((p) => p.source !== 'guardian')
);
const sheetHasPickups = computed(() => (sheet.value?.authorizedPickups || []).length > 0);

const attributionGuardianId = computed(() =>
  guardianUserId.value || sheet.value?.guardians?.[0]?.userId || null
);
const esignActive = computed(() => !sheet.value?.waiversEnabled || !!sheet.value?.gate?.esignActive);
/** True only when the checking-in person selected themselves as a guardian AND confirmed their identity. */
const checkerIsGuardian = computed(() =>
  checkerKind.value === 'guardian' && guardianIdentityConfirmed.value
);
const canEditWaivers = computed(() => checkerIsGuardian.value && !!attributionGuardianId.value);
const selectedCheckerName = computed(() => {
  const opt = checkerOptions.value.find((o) => o.key === checkerSelectedKey.value);
  return opt?.name || '';
});
const pickupGateBlocked = computed(() => {
  const gate = sheet.value?.gate || {};
  if (!sheet.value?.waiversEnabled) return false;
  // Only block if pickup authorization is required AND there are no pickups on file at all.
  // Pickups populated from intake, signed waivers, or kiosk-direct saves all satisfy this check.
  if (gate.pickupRequired && !sheetHasPickups.value) return true;
  return false;
});

const checkerOptions = computed(() => {
  const opts = [];
  for (const g of sheet.value?.guardians || []) {
    if (!g?.userId) continue;
    opts.push({
      key: `g-${g.userId}`,
      kind: 'guardian',
      userId: Number(g.userId),
      name: g.name || `Guardian #${g.userId}`,
      relationship: 'Guardian'
    });
  }
  (sheet.value?.authorizedPickups || []).forEach((p, i) => {
    if (p.source === 'guardian') return;
    const name = String(p?.name || '').trim();
    if (!name) return;
    opts.push({
      key: `p-${i}-${name}`,
      kind: 'pickup',
      userId: null,
      name,
      relationship: p.relationship || 'Approved pickup'
    });
  });
  return opts;
});

const checkerValid = computed(() => {
  if (!checkerSelectedKey.value) return false;
  if (checkerKind.value === 'guardian') return guardianIdentityConfirmed.value;
  if (checkerKind.value === 'other') {
    return !!otherCheckerName.value.trim() && !!otherCheckerSig.value;
  }
  return true;
});

const allergyText = computed(() => {
  const a = sheet.value?.allergies;
  if (!a) return '';
  const t = String(a.allergies || '').trim();
  if (!t || t.toLowerCase() === 'none') return '';
  return t;
});

const snacksSummary = computed(() => {
  const a = sheet.value?.allergies;
  if (!a) return '';
  const list = Array.isArray(a.approvedSnacksList) && a.approvedSnacksList.length
    ? a.approvedSnacksList.join(', ')
    : '';
  const freeText = String(a.approvedSnacks || '').trim();
  if (freeText.toLowerCase() === 'none') return list || '';
  return [list, freeText].filter(Boolean).join('; ');
});

const waiverFieldComponent = computed(() => WAIVER_FIELDS[waiverEditKey.value] || null);
const waiverTitle = computed(() => WAIVER_TITLES[waiverEditKey.value] || 'Waiver section');

const canAdvanceStep = computed(() => {
  const id = currentStepId.value;
  if (id === 'checker' && !checkerValid.value) return false;
  if (id === 'pickup' && pickupGateBlocked.value) return false;
  return true;
});

const advanceLabel = computed(() => {
  if (currentStepId.value === 'checker') return 'Continue';
  if (currentStepId.value === 'emergency' && !sheet.value?.emergencyContacts?.length) {
    return 'Continue without emergency contact';
  }
  return 'Looks correct — continue';
});

const canComplete = computed(() => {
  if (!sheet.value || sheetLoading.value) return false;
  if (!checkerValid.value) return false;
  if (!allergiesConfirmed.value) return false;
  const gate = sheet.value.gate || {};
  if (sheet.value.waiversEnabled) {
    if (gate.pickupRequired && !gate.pickupSatisfied) return false;
    if (gate.pickupRequired && !guardianUserId.value) return false;
    if (!sheetHasPickups.value && gate.pickupRequired && !gate.pickupSatisfied) return false;
  }
  return true;
});

function emitClose() {
  emit('close');
}

function resetWizard() {
  stepIndex.value = 0;
  allergiesConfirmed.value = false;
  checkerSelectedKey.value = '';
  checkerKind.value = '';
  guardianIdentityConfirmed.value = false;
  otherCheckerName.value = '';
  otherCheckerRelationship.value = '';
  otherCheckerSig.value = '';
  error.value = '';
  sheet.value = null;
  guardianUserId.value = null;
  pendingWaiverKey.value = '';
  closeWaiverEdit();
  closeInlinePickups();
}

function openInlinePickups() {
  // Pre-populate with existing non-guardian pickups so the family can edit them
  inlinePickups.value = (sheet.value?.authorizedPickups || [])
    .filter((p) => p.source !== 'guardian')
    .map((p) => ({ name: p.name || '', relationship: p.relationship || '', phone: p.phone || '' }));
  if (!inlinePickups.value.length) {
    inlinePickups.value = [{ name: '', relationship: '', phone: '' }];
  }
  inlinePickupError.value = '';
  inlinePickupOpen.value = true;
}

function closeInlinePickups() {
  inlinePickupOpen.value = false;
  inlinePickups.value = [];
  inlinePickupError.value = '';
}

async function saveInlinePickups() {
  const rows = inlinePickups.value.filter((r) => String(r.name || '').trim());
  if (!rows.length) {
    inlinePickupError.value = 'Enter at least one person\'s name.';
    return;
  }
  if (!props.pickupsUrl) {
    inlinePickupError.value = 'Save URL not configured.';
    return;
  }
  inlinePickupSaving.value = true;
  inlinePickupError.value = '';
  try {
    const checkerName = checkerKind.value === 'other'
      ? otherCheckerName.value.trim()
      : (checkerOptions.value.find((o) => o.key === checkerSelectedKey.value)?.name || null);
    const res = await api.post(props.pickupsUrl, {
      pickups: rows,
      addedByName: checkerName || null,
      guardianUserId: guardianUserId.value || null
    }, {
      headers: props.authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    if (res.data?.sheet) {
      sheet.value = res.data.sheet;
      emit('sheet-updated', res.data.sheet);
    }
    closeInlinePickups();
  } catch (e) {
    inlinePickupError.value = e.response?.data?.error?.message || 'Could not save pickup contacts.';
  } finally {
    inlinePickupSaving.value = false;
  }
}

function selectChecker(opt) {
  checkerSelectedKey.value = opt.key;
  checkerKind.value = opt.kind;
  guardianIdentityConfirmed.value = false;
  if (opt.kind === 'guardian' && opt.userId && Number(guardianUserId.value) !== Number(opt.userId)) {
    guardianUserId.value = opt.userId;
    reloadSheet();
  }
}

function selectSomeoneElse() {
  checkerSelectedKey.value = 'other';
  checkerKind.value = 'other';
  guardianIdentityConfirmed.value = false;
}

function nextStep() {
  if (!canAdvanceStep.value) return;
  if (stepIndex.value < steps.length - 1) stepIndex.value += 1;
}

function prevStep() {
  if (stepIndex.value > 0) stepIndex.value -= 1;
}

function isValidPhone(phone) {
  const d = String(phone || '').replace(/\D+/g, '');
  if (d.length === 10) return true;
  if (d.length === 11 && d.startsWith('1')) return true;
  return false;
}

async function reloadSheet() {
  if (!props.client?.id || !props.sheetUrl) return;
  sheetLoading.value = true;
  error.value = '';
  try {
    const params = {};
    if (guardianUserId.value) params.guardianUserId = guardianUserId.value;
    const res = await api.get(props.sheetUrl, {
      params,
      headers: props.authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    sheet.value = res.data;
    if (!guardianUserId.value && res.data?.guardianUserId) {
      guardianUserId.value = res.data.guardianUserId;
    } else if (!guardianUserId.value && res.data?.guardians?.length) {
      guardianUserId.value = res.data.guardians[0].userId;
    }
    emit('sheet-updated', res.data);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Could not load check-in info';
  } finally {
    sheetLoading.value = false;
  }
}

function defaultWaiverPayload(key) {
  if (key === 'esignature_consent') {
    return { consented: false, understoodElectronicRecords: false };
  }
  if (key === 'pickup_authorization') {
    const existing = sheet.value?.pickupSection;
    if (existing && typeof existing === 'object') {
      return JSON.parse(JSON.stringify(existing));
    }
    const merged = (sheet.value?.authorizedPickups || [])
      .filter((p) => String(p?.name || '').trim())
      .map((p) => ({
        name: String(p.name).trim(),
        relationship: String(p.relationship || (p.source === 'guardian' ? 'Guardian' : '')).trim(),
        phone: String(p.phone || '').trim()
      }));
    if (merged.length) return { authorizedPickups: merged };
    return { authorizedPickups: [{ name: '', relationship: '', phone: '' }] };
  }
  if (key === 'emergency_contacts') {
    // Prefer a formally saved section (has full structure); fall back to intake-sourced
    // contacts so the guardian can edit/correct them rather than starting from scratch.
    const existing = sheet.value?.emergencySection;
    if (existing && typeof existing === 'object') {
      return JSON.parse(JSON.stringify(existing));
    }
    const intakeContacts = (sheet.value?.emergencyContacts || []).map((c) => ({
      name: String(c?.name || '').trim(),
      phone: String(c?.phone || '').trim(),
      relationship: String(c?.relationship || '').trim()
    })).filter((c) => c.name);
    if (intakeContacts.length) {
      return { contacts: intakeContacts };
    }
    return { contacts: [{ name: '', phone: '', relationship: '' }] };
  }
  if (key === 'walk_home_authorization') {
    const existing = sheet.value?.walkHomeSection;
    if (existing && typeof existing === 'object') {
      return JSON.parse(JSON.stringify(existing));
    }
    if (sheet.value?.walkHome) {
      return {
        allowedToWalkHome: !!sheet.value.walkHome.allowedToWalkHome,
        allowedWindow: sheet.value.walkHome.allowedWindow || '',
        route: sheet.value.walkHome.route || '',
        conditions: sheet.value.walkHome.conditions || '',
        attestation: !!sheet.value.walkHome.attestation
      };
    }
    return { allowedToWalkHome: null };
  }
  if (key === 'allergies_snacks') {
    const existing = sheet.value?.allergiesSection;
    if (existing && typeof existing === 'object') {
      return JSON.parse(JSON.stringify(existing));
    }
    if (sheet.value?.allergies) {
      return JSON.parse(JSON.stringify(sheet.value.allergies));
    }
    return { allergies: '', approvedSnacks: '', notes: '' };
  }
  return {};
}

function requestWaiverEdit(key) {
  // Backend requires an active e-signature consent before any other section
  // can be saved. If consent isn't on file yet, capture it first and then
  // continue straight to the section the guardian wanted to edit.
  if (key !== 'esignature_consent' && !esignActive.value) {
    pendingWaiverKey.value = key;
    openWaiverEdit('esignature_consent');
    return;
  }
  pendingWaiverKey.value = '';
  openWaiverEdit(key);
}

function openWaiverEdit(key) {
  if (!guardianUserId.value && sheet.value?.guardians?.length) {
    guardianUserId.value = sheet.value.guardians[0].userId;
  }
  waiverEditKey.value = key;
  waiverDraft.value = defaultWaiverPayload(key);
  waiverConsent.value = false;
  waiverIntent.value = false;
  waiverSig.value = '';
  waiverError.value = '';
  waiverEditOpen.value = true;
}

function closeWaiverEdit() {
  waiverEditOpen.value = false;
  waiverEditKey.value = '';
  waiverError.value = '';
}

async function saveWaiverEdit() {
  const key = waiverEditKey.value;
  if (!key || !waiverConsent.value || !waiverIntent.value) {
    waiverError.value = 'Check both boxes and sign to save.';
    return;
  }
  const sig = String(waiverSig.value || '').trim();
  if (sig.length < 80) {
    waiverError.value = 'Signature is required.';
    return;
  }
  if (key === 'esignature_consent') {
    const p = waiverDraft.value || {};
    if (!p.consented || !p.understoodElectronicRecords) {
      waiverError.value = 'Complete e-sign consent checkboxes in the form.';
      return;
    }
  }
  if (key === 'pickup_authorization') {
    const p = waiverDraft.value || {};
    if (!p.declinePickupAuthorization) {
      const rows = Array.isArray(p.authorizedPickups) ? p.authorizedPickups : [];
      const ok = rows.some((r) => String(r?.name || '').trim() && isValidPhone(r?.phone));
      if (!ok) {
        waiverError.value = 'Add at least one pickup person with name and phone, or check the opt-out box.';
        return;
      }
    }
  }
  if (key === 'emergency_contacts') {
    const p = waiverDraft.value || {};
    if (!p.declineEmergencyContacts) {
      const rows = Array.isArray(p.contacts) ? p.contacts : [];
      const ok = rows.some((r) => String(r?.name || '').trim() && isValidPhone(r?.phone));
      if (!ok) {
        waiverError.value = 'Add at least one emergency contact with name and phone, or check the opt-out box.';
        return;
      }
    }
  }
  if (key === 'walk_home_authorization') {
    const p = waiverDraft.value || {};
    if (p.allowedToWalkHome === true) {
      if (!String(p.allowedWindow || '').trim()) {
        waiverError.value = 'Enter the approved release window when walk-home is authorized.';
        return;
      }
      if (!p.attestation) {
        waiverError.value = 'Check the attestation box to authorize walk-home.';
        return;
      }
    }
  }
  const gid = guardianUserId.value;
  const cid = props.client?.id;
  if (!gid || !cid) {
    waiverError.value = 'Select a guardian to sign.';
    return;
  }
  const status = sheet.value?.sectionStatus?.[key];
  const action = status === 'active' ? 'update' : 'create';
  waiverSaving.value = true;
  waiverError.value = '';
  try {
    const res = await api.post(props.waiverUrl, {
      clientId: cid,
      guardianUserId: gid,
      sectionKey: key,
      payload: waiverDraft.value,
      signatureData: sig,
      consentAcknowledged: true,
      intentToSign: true,
      action
    }, {
      headers: props.authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    sheet.value = res.data?.sheet || sheet.value;
    if (res.data?.sheet) emit('sheet-updated', res.data.sheet);
    if (key === 'esignature_consent' && pendingWaiverKey.value) {
      const next = pendingWaiverKey.value;
      pendingWaiverKey.value = '';
      openWaiverEdit(next);
    } else {
      closeWaiverEdit();
    }
  } catch (e) {
    waiverError.value = e.response?.data?.error?.message || 'Save failed';
  } finally {
    waiverSaving.value = false;
  }
}

function buildCheckerPayload() {
  if (checkerKind.value === 'other') {
    return {
      checkedInByName: otherCheckerName.value.trim(),
      checkedInByRelationship: otherCheckerRelationship.value.trim() || null,
      checkedInByUserId: null,
      checkinSignatureData: otherCheckerSig.value || null
    };
  }
  const opt = checkerOptions.value.find((o) => o.key === checkerSelectedKey.value);
  return {
    checkedInByName: opt?.name || null,
    checkedInByRelationship: opt?.relationship || null,
    checkedInByUserId: opt?.kind === 'guardian' ? opt.userId : null,
    checkinSignatureData: null
  };
}

async function completeCheckin() {
  if (!props.client?.id || !canComplete.value) return;
  submitting.value = true;
  error.value = '';
  const checker = buildCheckerPayload();
  try {
    await api.post(props.checkinUrl, { clientId: props.client.id, ...checker }, {
      headers: props.authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    emit('checked-in', {
      clientId: props.client.id,
      checkedInByName: checker.checkedInByName,
      checkedInByRelationship: checker.checkedInByRelationship
    });
    emitClose();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Check-in failed';
  } finally {
    submitting.value = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      resetWizard();
      reloadSheet();
    }
  }
);
</script>

<style scoped>
.ek-checkin-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.ek-checkin-overlay--stack {
  z-index: 1300;
}
.ek-checkin-card {
  background: #fff;
  border-radius: 14px;
  width: min(520px, 100%);
  max-height: min(92vh, 720px);
  overflow: auto;
  padding: 18px 20px 16px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18);
}
.ek-checkin-hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.ek-checkin-title {
  font-size: 1.15rem;
  font-weight: 700;
}
.ek-checkin-progress {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.ek-checkin-dot {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: #e2e8f0;
}
.ek-checkin-dot--active {
  background: #166534;
}
.ek-checkin-dot--done {
  background: #86efac;
}
.ek-checkin-step-label {
  margin: 0 0 14px;
}
.ek-checkin-h4 {
  margin: 0 0 10px;
  font-size: 1rem;
}
.ek-checkin-sub {
  margin: 10px 0 4px;
}
.ek-checkin-list {
  margin: 0;
  padding-left: 1.1rem;
}
.ek-checkin-list li {
  margin-bottom: 8px;
}
.ek-checkin-step-actions {
  margin-top: 12px;
}
.ek-checker-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ek-checker-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.ek-checker-opt:hover {
  border-color: #94a3b8;
}
.ek-checker-opt--sel {
  border-color: #166534;
  background: #ecfdf5;
}
.ek-checker-opt--guardian {
  border-color: #c7d2fe;
}
.ek-checker-tick {
  color: #166534;
  font-weight: 800;
}
.ek-guardian-badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #e0e7ff;
  color: #3730a3;
  border-radius: 999px;
  padding: 1px 7px;
}
.ek-guardian-confirm {
  margin-top: 14px;
  padding: 12px 14px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
}
.ek-guardian-confirm-note {
  margin-top: 8px;
}
.ek-checker-other {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}
.ek-checkin-banner {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
}
.ek-checkin-banner--warn {
  background: #fef2f2;
  border-color: #fecaca;
}
.ek-checkin-ok {
  padding: 10px 12px;
  border-radius: 8px;
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
}
.ek-checkin-snack-block {
  margin-top: 12px;
}
.ek-checkin-field {
  margin: 12px 0;
}
.ek-checkin-lbl {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}
.ek-checkin-check-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 14px;
  font-size: 14px;
  cursor: pointer;
}
.ek-checkin-check-row input {
  margin-top: 3px;
}
.ek-checkin-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}
.ek-checkin-err {
  margin-bottom: 10px;
}
.ek-checkin-waiver-checks {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.muted { color: #64748b; }
.small { font-size: 13px; }
.ek-pickup-inline {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}
.ek-pickup-inline-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.ek-pickup-inline-form {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ek-pickup-inline-row {
  display: grid;
  gap: 6px;
  grid-template-columns: 1fr 1fr;
}
.ek-pickup-inline-row input:first-child {
  grid-column: 1 / -1;
}
.ek-pickup-inline-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
</style>
