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
          <div v-if="sheet.waiversEnabled && canEditWaivers" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="openWaiverEdit('emergency_contacts')">
              Add or change
            </button>
          </div>
          <div v-else-if="sheet.waiversEnabled && guardianUserId && needsEsignFirst" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="openWaiverEdit('esignature_consent')">
              Sign e-signature consent first
            </button>
          </div>
        </section>

        <!-- Step: Authorized pickups -->
        <section v-else-if="currentStepId === 'pickup'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">Authorized drivers &amp; pickups</h4>
          <p v-if="sheetHasPickups" class="muted small">
            Review who may pick up {{ clientLabel }} today.
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
          <p v-if="!sheetHasPickups" class="muted small">No authorized pickup people on file yet.</p>
          <div
            v-if="sheet.waiversEnabled && pickupGateBlocked"
            class="ek-checkin-banner"
          >
            <strong>Pickup authorization required</strong>
            <p class="small">Add or sign pickup authorization before continuing.</p>
          </div>
          <div v-if="sheet.waiversEnabled && canEditWaivers" class="ek-checkin-step-actions">
            <button
              v-if="needsEsignFirst"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="openWaiverEdit('esignature_consent')"
            >
              Sign e-signature consent first
            </button>
            <button
              v-else
              type="button"
              class="btn btn-secondary btn-sm"
              @click="openWaiverEdit('pickup_authorization')"
            >
              {{ sheetHasPickups ? 'Add or change' : 'Add pickup person & sign' }}
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
          <div v-if="sheet.waiversEnabled && canEditWaivers" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="openWaiverEdit('walk_home_authorization')">
              Add or change
            </button>
          </div>
          <div v-else-if="sheet.waiversEnabled && guardianUserId && needsEsignFirst" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="openWaiverEdit('esignature_consent')">
              Sign e-signature consent first
            </button>
          </div>
        </section>

        <!-- Step: Who is checking in -->
        <section v-else-if="currentStepId === 'checker'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">Who is checking in?</h4>
          <p class="muted small">Confirm who is dropping off {{ clientLabel }} today.</p>
          <div v-if="sheet.guardians?.length > 1" class="ek-checkin-field">
            <label class="ek-checkin-lbl">I am</label>
            <select v-model="guardianUserId" class="input" @change="onGuardianPickerChange">
              <option v-for="g in sheet.guardians" :key="g.userId" :value="g.userId">
                {{ g.name || `Guardian #${g.userId}` }}
              </option>
            </select>
          </div>
          <p v-else-if="sheet.guardians?.length === 1" class="muted small">
            Checking in as <strong>{{ sheet.guardians[0].name || 'guardian' }}</strong>
          </p>
          <p v-else class="ek-checkin-banner small">
            No guardian linked on file — staff may need to verify identity manually.
          </p>
          <label class="ek-checkin-check-row">
            <input v-model="checkerConfirmed" type="checkbox" />
            <span>
              I confirm I am the person checking in {{ clientLabel }} today
              <template v-if="checkerDisplayName"> ({{ checkerDisplayName }})</template>.
            </span>
          </label>
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
          <div v-if="sheet.waiversEnabled && canEditWaivers" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="openWaiverEdit('allergies_snacks')">
              Add or change
            </button>
          </div>
          <div v-else-if="sheet.waiversEnabled && guardianUserId && needsEsignFirst" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="openWaiverEdit('esignature_consent')">
              Sign e-signature consent first
            </button>
          </div>
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
  checkinUrl: { type: String, required: true },
  authHeaders: { type: Function, default: () => ({}) },
  snackOptions: { type: Array, default: () => [] },
  displayName: { type: Function, default: (c) => c?.fullName || c?.initials || 'Client' }
});

const emit = defineEmits(['close', 'checked-in', 'sheet-updated']);

const steps = [
  { id: 'emergency', title: 'Emergency contacts', subtitle: 'Confirm or update emergency contacts.' },
  { id: 'pickup', title: 'Authorized pickups', subtitle: 'Confirm who may pick up your child.' },
  { id: 'walk_home', title: 'Walk-home authorization', subtitle: 'Confirm walk-home rules for this program.' },
  { id: 'checker', title: 'Who is checking in?', subtitle: 'Confirm who is dropping off today.' },
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
const checkerConfirmed = ref(false);
const allergiesConfirmed = ref(false);

const waiverEditOpen = ref(false);
const waiverEditKey = ref('');
const waiverDraft = ref({});
const waiverConsent = ref(false);
const waiverIntent = ref(false);
const waiverSig = ref('');
const waiverSaving = ref(false);
const waiverError = ref('');

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

const canEditWaivers = computed(() => !!guardianUserId.value && !!sheet.value?.gate?.esignActive);
const needsEsignFirst = computed(() => sheet.value?.gate?.needsEsignBeforePickup);
const pickupGateBlocked = computed(() => {
  const gate = sheet.value?.gate || {};
  if (!sheet.value?.waiversEnabled) return false;
  if (gate.pickupRequired && !gate.pickupSatisfied) return true;
  if (!sheetHasPickups.value && gate.pickupRequired) return true;
  return false;
});

const checkerDisplayName = computed(() => {
  const gid = Number(guardianUserId.value || 0);
  const g = (sheet.value?.guardians || []).find((x) => Number(x.userId) === gid);
  return g?.name || '';
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
  if (id === 'pickup' && pickupGateBlocked.value) return false;
  if (id === 'checker' && !checkerConfirmed.value) return false;
  return true;
});

const advanceLabel = computed(() => {
  if (currentStepId.value === 'emergency' && !sheet.value?.emergencyContacts?.length) {
    return 'Continue without emergency contact';
  }
  return 'Looks correct — continue';
});

const canComplete = computed(() => {
  if (!sheet.value || sheetLoading.value) return false;
  if (!allergiesConfirmed.value) return false;
  if (!checkerConfirmed.value) return false;
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
  checkerConfirmed.value = false;
  allergiesConfirmed.value = false;
  error.value = '';
  sheet.value = null;
  guardianUserId.value = null;
  closeWaiverEdit();
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

function onGuardianPickerChange() {
  checkerConfirmed.value = false;
  reloadSheet();
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
    const existing = sheet.value?.emergencySection;
    if (existing && typeof existing === 'object') {
      return JSON.parse(JSON.stringify(existing));
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
    closeWaiverEdit();
  } catch (e) {
    waiverError.value = e.response?.data?.error?.message || 'Save failed';
  } finally {
    waiverSaving.value = false;
  }
}

async function completeCheckin() {
  if (!props.client?.id || !canComplete.value) return;
  submitting.value = true;
  error.value = '';
  try {
    await api.post(props.checkinUrl, { clientId: props.client.id }, {
      headers: props.authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    emit('checked-in', { clientId: props.client.id });
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
</style>
