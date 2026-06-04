<template>
  <div v-if="open" class="ek-checkin-overlay ek-checkin-overlay--fullscreen">
    <div class="ek-checkin-card ek-checkin-card--fullscreen">
      <header class="ek-checkin-hdr">
        <div>
          <div class="ek-checkin-title">{{ t('kiosk.checkinTitle', { name: clientLabel }) }}</div>
          <div class="muted small">{{ currentStepMeta.subtitle }}</div>
        </div>
        <button type="button" class="btn btn-text" @click="emitClose">{{ t('kiosk.close') }}</button>
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
        {{ t('kiosk.stepOf', { current: stepIndex + 1, total: steps.length, title: currentStepMeta.title }) }}
      </p>

      <div v-if="error" class="error-box ek-checkin-err">{{ error }}</div>
      <div v-if="sheetLoading" class="muted small">{{ t('kiosk.loading') }}</div>

      <template v-else-if="sheet">
        <!-- Step: Photo preference (shown once to confirmed guardians) -->
        <section v-if="currentStepId === 'photo_preference'" class="ek-checkin-step ek-photo-pref-step">
          <h4 class="ek-checkin-h4">{{ t('kiosk.photoPreference.heading') }}</h4>
          <p class="ek-photo-pref-desc">{{ t('kiosk.photoPreference.desc', { name: clientLabel }) }}</p>

          <!-- Guardian picking up themselves -->
          <div class="ek-photo-pref-group">
            <p class="ek-photo-pref-group-label">{{ t('kiosk.photoPreference.whenYouPickup', { name: clientLabel }) }}</p>
            <div class="ek-photo-pref-btns">
              <button
                type="button"
                class="btn ek-photo-pref-btn"
                :class="selfPrefDraft === true ? 'ek-photo-pref-btn--selected' : 'ek-photo-pref-btn--yes'"
                :disabled="photoPreferenceSaving"
                @click="selfPrefDraft = true"
              >
                <span class="ek-photo-pref-icon">📷</span>
                <strong>{{ t('kiosk.photoPreference.takeMyPhoto') }}</strong>
              </button>
              <button
                type="button"
                class="btn ek-photo-pref-btn"
                :class="selfPrefDraft === false ? 'ek-photo-pref-btn--selected' : 'ek-photo-pref-btn--no'"
                :disabled="photoPreferenceSaving"
                @click="selfPrefDraft = false"
              >
                <span class="ek-photo-pref-icon">✕</span>
                <strong>{{ t('kiosk.photoPreference.noPhotoForMe') }}</strong>
              </button>
            </div>
          </div>

          <!-- Anyone else picking up -->
          <div class="ek-photo-pref-group">
            <p class="ek-photo-pref-group-label">{{ t('kiosk.photoPreference.whenSomeoneElse', { name: clientLabel }) }}</p>
            <div class="ek-photo-pref-btns">
              <button
                type="button"
                class="btn ek-photo-pref-btn"
                :class="othersPrefDraft === true ? 'ek-photo-pref-btn--selected' : 'ek-photo-pref-btn--yes'"
                :disabled="photoPreferenceSaving"
                @click="othersPrefDraft = true"
              >
                <span class="ek-photo-pref-icon">📷</span>
                <strong>{{ t('kiosk.photoPreference.takeTheirPhoto') }}</strong>
              </button>
              <button
                type="button"
                class="btn ek-photo-pref-btn"
                :class="othersPrefDraft === false ? 'ek-photo-pref-btn--selected' : 'ek-photo-pref-btn--no'"
                :disabled="photoPreferenceSaving"
                @click="othersPrefDraft = false"
              >
                <span class="ek-photo-pref-icon">✕</span>
                <strong>{{ t('kiosk.photoPreference.noPhoto') }}</strong>
              </button>
            </div>
          </div>

          <button
            type="button"
            class="btn btn-primary ek-photo-pref-save"
            :disabled="photoPreferenceSaving || selfPrefDraft === null || othersPrefDraft === null"
            @click="savePhotoPreference(selfPrefDraft, othersPrefDraft)"
          >
            {{ photoPreferenceSaving ? t('kiosk.photoPreference.saving') : t('kiosk.photoPreference.savePreferences') }}
          </button>

          <p v-if="photoPreferenceError" class="muted small ek-photo-pref-note" style="color:#dc2626;">
            {{ photoPreferenceError }}
          </p>
        </section>

        <!-- Step: Emergency contacts -->
        <section v-if="currentStepId === 'emergency'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">{{ t('kiosk.emergency.heading') }}</h4>
          <ul v-if="sheet.emergencyContacts?.length" class="ek-checkin-list">
            <li v-for="(e, i) in sheet.emergencyContacts" :key="`ec-${i}`">
              <strong>{{ e.name }}</strong>
              <span v-if="e.relationship" class="muted small"> · {{ e.relationship }}</span>
              <div v-if="e.phone" class="muted small">{{ e.phone }}</div>
            </li>
          </ul>
          <p v-else class="muted small">{{ t('kiosk.emergency.noneOnFile') }}</p>
          <div v-if="checkerIsGuardian" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="requestWaiverEdit('emergency_contacts')">
              {{ sheet.emergencyContacts?.length ? t('kiosk.emergency.editContacts') : t('kiosk.emergency.addContact') }}
            </button>
          </div>
          <p v-else class="muted small ek-checkin-step-actions">{{ t('kiosk.emergency.signInToEdit') }}</p>
        </section>

        <!-- Step: Authorized pickups -->
        <section v-else-if="currentStepId === 'pickup'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">{{ t('kiosk.pickup.heading') }}</h4>
          <p class="muted small">
            {{ sheetHasPickups ? t('kiosk.pickup.reviewToday', { name: clientLabel }) : t('kiosk.pickup.noneOnFile') }}
          </p>
          <p v-if="sheetGuardianPickups.length" class="ek-checkin-sub muted small">{{ t('kiosk.pickup.guardians') }}</p>
          <ul v-if="sheetGuardianPickups.length" class="ek-checkin-list">
            <li v-for="(p, i) in sheetGuardianPickups" :key="`sg-${i}`">
              <strong>{{ p.name }}</strong>
              <span class="muted small"> · {{ t('kiosk.pickup.guardian') }}</span>
              <div v-if="p.phone" class="muted small">{{ p.phone }}</div>
            </li>
          </ul>
          <p v-if="sheetOtherPickups.length" class="ek-checkin-sub muted small">{{ t('kiosk.pickup.otherPickups') }}</p>
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
              <span class="small muted">{{ inlinePickups.length ? t('kiosk.pickup.editOrAdd') : t('kiosk.pickup.addContacts') }}</span>
              <button v-if="!inlinePickupOpen" type="button" class="btn btn-secondary btn-sm" @click="openInlinePickups">
                {{ sheetHasPickups ? t('kiosk.pickup.addEdit') : t('kiosk.pickup.addPerson') }}
              </button>
            </div>
            <div v-if="inlinePickupOpen" class="ek-pickup-inline-form">
              <div v-for="(row, idx) in inlinePickups" :key="`ip-${idx}`" class="ek-pickup-inline-row">
                <input v-model="row.name" class="input" type="text" :placeholder="t('kiosk.pickup.fullName')" />
                <input v-model="row.relationship" class="input" type="text" :placeholder="t('kiosk.pickup.relationship')" />
                <input v-model="row.phone" class="input" type="tel" inputmode="tel" :placeholder="t('kiosk.pickup.phone')" />
                <button type="button" class="btn btn-secondary btn-sm" @click="inlinePickups.splice(idx, 1)">{{ t('kiosk.pickup.remove') }}</button>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" @click="inlinePickups.push({ name: '', relationship: '', phone: '' })">
                {{ t('kiosk.pickup.addAnother') }}
              </button>
              <div v-if="inlinePickupError" class="error-box ek-checkin-err">{{ inlinePickupError }}</div>
              <div class="ek-pickup-inline-actions">
                <button type="button" class="btn btn-secondary btn-sm" @click="closeInlinePickups">{{ t('kiosk.pickup.cancelEdit') }}</button>
                <button type="button" class="btn btn-primary btn-sm" :disabled="inlinePickupSaving" @click="saveInlinePickups">
                  {{ inlinePickupSaving ? t('kiosk.saving') : t('kiosk.pickup.saveContacts') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Formal waiver signing (guardian flow) -->
          <div v-if="canEditWaivers" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="requestWaiverEdit('pickup_authorization')">
              {{ t('kiosk.pickup.signFormal') }}
            </button>
          </div>
          <p v-else-if="!checkerIsGuardian" class="muted small ek-checkin-step-actions">
            {{ t('kiosk.pickup.linkGuardianRequired') }}
          </p>
        </section>

        <!-- Step: Walk-home -->
        <section v-else-if="currentStepId === 'walk_home'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">{{ t('kiosk.walkHome.heading') }}</h4>
          <div v-if="sheet.walkHome?.allowedToWalkHome" class="ek-checkin-ok">
            <strong>{{ t('kiosk.walkHome.authorizedAlone') }}</strong>
            <p v-if="sheet.walkHome.allowedWindow" class="small muted">{{ t('kiosk.walkHome.window', { window: sheet.walkHome.allowedWindow }) }}</p>
            <p v-if="sheet.walkHome.route" class="small muted">{{ t('kiosk.walkHome.route', { route: sheet.walkHome.route }) }}</p>
            <p v-if="sheet.walkHome.conditions" class="small muted">{{ sheet.walkHome.conditions }}</p>
          </div>
          <p v-else class="muted small">{{ t('kiosk.walkHome.notAuthorized') }}</p>
          <div v-if="checkerIsGuardian" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="requestWaiverEdit('walk_home_authorization')">
              {{ t('kiosk.walkHome.addOrChange') }}
            </button>
          </div>
          <p v-else class="muted small ek-checkin-step-actions">{{ t('kiosk.walkHome.signInToEdit') }}</p>
        </section>

        <!-- Step: Who is checking in (identity first) -->
        <section v-if="currentStepId === 'checker'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">{{ t('kiosk.checker.heading', { name: clientLabel }) }}</h4>
          <p class="muted small">{{ t('kiosk.checker.tapYourName') }}</p>

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
                <span v-if="opt.kind === 'guardian'" class="ek-guardian-badge">{{ t('kiosk.checker.mainGuardian') }}</span>
              </div>
              <span v-if="checkerSelectedKey === opt.key" class="ek-checker-tick">✓</span>
            </li>
            <li
              class="ek-checker-opt"
              :class="{ 'ek-checker-opt--sel': checkerSelectedKey === 'other' }"
              @click="selectSomeoneElse"
            >
              <div>
                <strong>{{ t('kiosk.checker.someoneElse') }}</strong>
                <span class="muted small"> · {{ t('kiosk.checker.notListedAbove') }}</span>
              </div>
              <span v-if="checkerSelectedKey === 'other'" class="ek-checker-tick">✓</span>
            </li>
          </ul>

          <!-- Guardian identity confirmation -->
          <div v-if="checkerKind === 'guardian'" class="ek-guardian-confirm">
            <label class="ek-checkin-check-row">
              <input v-model="guardianIdentityConfirmed" type="checkbox" />
              <span>{{ t('kiosk.checker.iConfirm', { name: selectedCheckerName }) }}</span>
            </label>
            <p class="muted small ek-guardian-confirm-note">{{ t('kiosk.checker.asGuardianNote') }}</p>
          </div>

          <div v-if="checkerKind === 'other'" class="ek-checker-other">
            <div class="ek-checkin-field">
              <label class="ek-checkin-lbl">{{ t('kiosk.checker.yourName') }}</label>
              <input v-model="otherCheckerName" class="input" type="text" :placeholder="t('kiosk.checker.yourNamePlaceholder')" />
            </div>
            <div class="ek-checkin-field">
              <label class="ek-checkin-lbl">{{ t('kiosk.checker.relationship', { name: clientLabel }) }}</label>
              <input v-model="otherCheckerRelationship" class="input" type="text" :placeholder="t('kiosk.checker.relationshipPlaceholder')" />
            </div>
            <label class="ek-checkin-lbl">{{ t('kiosk.checker.signToCheckin') }}</label>
            <SignaturePad compact @signed="(d) => (otherCheckerSig = d)" />
            <p class="muted small">{{ t('kiosk.checker.noPhotoRequired') }}</p>
          </div>
        </section>

        <!-- Step: Allergies & snacks (one page) -->
        <section v-else-if="currentStepId === 'allergies'" class="ek-checkin-step">
          <h4 class="ek-checkin-h4">{{ t('kiosk.allergies.heading') }}</h4>
          <template v-if="sheet.allergies">
            <div v-if="allergyText" class="ek-checkin-banner ek-checkin-banner--warn">
              <strong>Allergies / medical:</strong> {{ allergyText }}
            </div>
            <p v-else-if="sheet.allergies.applyNone" class="muted small">{{ t('kiosk.allergies.noMedical') }}</p>
            <p v-else class="muted small">{{ t('kiosk.allergies.noKnown') }}</p>
            <p v-if="sheet.allergies.notes" class="small">
              <strong>{{ t('kiosk.allergies.notes') }}</strong> {{ sheet.allergies.notes }}
            </p>
            <div class="ek-checkin-snack-block">
              <strong>{{ t('kiosk.allergies.approvedSnacks') }}</strong>
              <p v-if="sheet.allergies.noSnacks" class="ek-checkin-banner ek-checkin-banner--warn small">
                {{ t('kiosk.allergies.doNotGiveSnacks') }}
              </p>
              <p v-else-if="snacksSummary" class="small">{{ snacksSummary }}</p>
              <p v-else class="muted small">{{ t('kiosk.allergies.noneOnFile') }}</p>
            </div>
          </template>
          <p v-else class="muted small">{{ t('kiosk.allergies.noInfo') }}</p>
          <div v-if="canEditWaivers" class="ek-checkin-step-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="requestWaiverEdit('allergies_snacks')">
              {{ t('kiosk.allergies.addOrChange') }}
            </button>
          </div>
          <p v-else-if="sheet.waiversEnabled && !attributionGuardianId" class="muted small ek-checkin-step-actions">
            {{ t('kiosk.allergies.signInToEdit') }}
          </p>
          <label class="ek-checkin-check-row">
            <input v-model="allergiesConfirmed" type="checkbox" />
            <span>{{ t('kiosk.allergies.confirmCorrect') }}</span>
          </label>
        </section>

        <footer class="ek-checkin-footer">
          <button v-if="stepIndex > 0" type="button" class="btn btn-secondary" @click="prevStep">{{ t('kiosk.back') }}</button>
          <button type="button" class="btn btn-secondary" @click="emitClose">{{ t('kiosk.cancel') }}</button>
          <template v-if="currentStepId !== 'photo_preference'">
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
              {{ submitting ? t('kiosk.checkingIn') : t('kiosk.completeCheckin') }}
            </button>
          </template>
        </footer>
      </template>
    </div>

    <!-- Waiver section editor -->
    <div v-if="waiverEditOpen" class="ek-checkin-overlay ek-checkin-overlay--stack ek-checkin-overlay--fullscreen">
      <div class="ek-checkin-card ek-checkin-card--fullscreen">
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
            <span>{{ t('kiosk.waiver.iHaveRead') }}</span>
          </label>
          <label class="ek-checkin-check-row">
            <input v-model="waiverIntent" type="checkbox" />
            <span>{{ t('kiosk.waiver.iIntend') }}</span>
          </label>
        </div>
        <SignaturePad compact @signed="(d) => (waiverSig = d)" />
        <div v-if="waiverError" class="error-box ek-checkin-err">{{ waiverError }}</div>
        <footer class="ek-checkin-footer">
          <button type="button" class="btn btn-secondary" @click="closeWaiverEdit">{{ t('kiosk.waiver.cancel') }}</button>
          <button type="button" class="btn btn-primary" :disabled="waiverSaving" @click="saveWaiverEdit">
            {{ waiverSaving ? t('kiosk.saving') : t('kiosk.waiver.saveReturn') }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import api from '../../services/api';
import SignaturePad from '../SignaturePad.vue';
import GwvFieldsEsign from '../../views/guardian/waivers/GwvFieldsEsign.vue';
import GwvFieldsPickup from '../../views/guardian/waivers/GwvFieldsPickup.vue';
import GwvFieldsEmergency from '../../views/guardian/waivers/GwvFieldsEmergency.vue';
import GwvFieldsWalkHome from '../../views/guardian/waivers/GwvFieldsWalkHome.vue';
import GwvFieldsAllergies from '../../views/guardian/waivers/GwvFieldsAllergies.vue';

const { t } = useI18n();

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

const STEP_IDS = ['checker', 'photo_preference', 'emergency', 'pickup', 'walk_home', 'allergies'];
const steps = computed(() => STEP_IDS.map((id) => ({
  id,
  title: t(`kiosk.steps.${id}.title`),
  subtitle: t(`kiosk.steps.${id}.subtitle`)
})));

const WAIVER_FIELDS = {
  esignature_consent: GwvFieldsEsign,
  pickup_authorization: GwvFieldsPickup,
  emergency_contacts: GwvFieldsEmergency,
  walk_home_authorization: GwvFieldsWalkHome,
  allergies_snacks: GwvFieldsAllergies
};
const waiverTitle = computed(() =>
  t(`kiosk.waiver.titles.${waiverEditKey.value}`, t(`kiosk.waiver.titles.${waiverEditKey.value}`))
);

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

// Photo preference step
const photoPreferenceSaving = ref(false);
const photoPreferenceError = ref('');
const selfPrefDraft = ref(null);   // true | false | null (null = not yet chosen)
const othersPrefDraft = ref(null); // true | false | null
const photoPreferenceUrl = computed(() =>
  props.sheetUrl ? props.sheetUrl.replace(/\/sheet(\?.*)?$/, '/photo-preference') : ''
);
/**
 * Show the photo preference step only for confirmed guardians
 * and only when at least one preference hasn't been set yet.
 */
const showPhotoPreferenceStep = computed(() =>
  checkerIsGuardian.value &&
  (sheet.value?.pickupPhotoPreference == null || sheet.value?.guardianSelfPhotoPreference == null)
);

// Inline (no-signature) pickup editing
const inlinePickupOpen = ref(false);
const inlinePickups = ref([]);
const inlinePickupSaving = ref(false);
const inlinePickupError = ref('');

const clientLabel = computed(() => props.displayName(props.client));
const currentStepId = computed(() => steps.value[stepIndex.value]?.id || 'emergency');
const currentStepMeta = computed(() => steps.value[stepIndex.value] || steps.value[0]);
const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1);

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

const canAdvanceStep = computed(() => {
  const id = currentStepId.value;
  if (id === 'checker' && !checkerValid.value) return false;
  if (id === 'pickup' && pickupGateBlocked.value) return false;
  return true;
});

const advanceLabel = computed(() => {
  if (currentStepId.value === 'checker') return t('kiosk.next');
  if (currentStepId.value === 'emergency' && !sheet.value?.emergencyContacts?.length) {
    return t('kiosk.next');
  }
  return t('kiosk.next');
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
  photoPreferenceSaving.value = false;
  photoPreferenceError.value = '';
  selfPrefDraft.value = null;
  othersPrefDraft.value = null;
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

async function savePhotoPreference(selfValue, othersValue) {
  if (!photoPreferenceUrl.value || !props.client?.id) return;
  photoPreferenceSaving.value = true;
  photoPreferenceError.value = '';
  try {
    const res = await api.patch(photoPreferenceUrl.value, {
      selfPreference: selfValue,
      othersPreference: othersValue,
      guardianUserId: guardianUserId.value || null
    }, {
      headers: props.authHeaders(),
      skipGlobalLoading: true,
      skipAuthRedirect: true
    });
    if (sheet.value) {
      sheet.value = {
        ...sheet.value,
        guardianSelfPhotoPreference: res.data?.guardianSelfPhotoPreference ?? (selfValue === true ? 1 : selfValue === false ? 0 : null),
        pickupPhotoPreference: res.data?.pickupPhotoPreference ?? (othersValue === true ? 1 : othersValue === false ? 0 : null)
      };
      emit('sheet-updated', sheet.value);
    }
    // Advance past this step automatically
    if (stepIndex.value < steps.value.length - 1) stepIndex.value += 1;
  } catch (e) {
    photoPreferenceError.value = e.response?.data?.error?.message || 'Could not save preference. You can set it next time.';
    // Advance anyway — don't block check-in over a preference save failure
    if (stepIndex.value < steps.value.length - 1) stepIndex.value += 1;
  } finally {
    photoPreferenceSaving.value = false;
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
  if (stepIndex.value < steps.value.length - 1) {
    stepIndex.value += 1;
    // Skip photo_preference when it's already been answered or checker isn't a guardian
    if (steps.value[stepIndex.value]?.id === 'photo_preference' && !showPhotoPreferenceStep.value) {
      stepIndex.value += 1;
    }
  }
}

function prevStep() {
  if (stepIndex.value > 0) {
    stepIndex.value -= 1;
    if (steps.value[stepIndex.value]?.id === 'photo_preference' && !showPhotoPreferenceStep.value) {
      stepIndex.value -= 1;
    }
  }
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
      checkedInByRelationship: checker.checkedInByRelationship,
      guardianUserId: guardianUserId.value || null,
      guardianName: checkerKind.value === 'guardian'
        ? (checkerOptions.value.find((o) => o.key === checkerSelectedKey.value)?.name || null)
        : null
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
.ek-checkin-overlay--fullscreen {
  background: #fff;
  padding:
    max(16px, env(safe-area-inset-top, 0px))
    max(24px, env(safe-area-inset-right, 0px))
    max(16px, env(safe-area-inset-bottom, 0px))
    max(24px, env(safe-area-inset-left, 0px));
  justify-content: center;
  align-items: stretch;
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
.ek-checkin-card--fullscreen {
  width: min(600px, 100%);
  max-width: 600px;
  height: 100%;
  max-height: none;
  margin: 0 auto;
  border-radius: 0;
  box-shadow: none;
  padding: 8px 4px 16px;
  -webkit-overflow-scrolling: touch;
}
.ek-checkin-card--fullscreen .ek-checkin-step-label {
  text-align: center;
}
.ek-checkin-card--fullscreen .ek-checkin-h4 {
  text-align: center;
}
.ek-checkin-card--fullscreen .ek-checkin-footer {
  justify-content: center;
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
.ek-photo-pref-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
}
.ek-photo-pref-desc {
  max-width: 420px;
  line-height: 1.6;
  margin: 0 auto 4px;
}
.ek-photo-pref-note {
  margin: 0 auto;
  max-width: 380px;
}
.ek-photo-pref-btns {
  display: flex;
  gap: 16px;
  margin-top: 24px;
  flex-wrap: wrap;
  justify-content: center;
}
.ek-photo-pref-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 22px 28px;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  min-width: 140px;
  transition: border-color 0.15s, background 0.15s;
}
.ek-photo-pref-btn:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}
.ek-photo-pref-btn--yes:hover:not(:disabled) {
  border-color: #166534;
  background: #ecfdf5;
}
.ek-photo-pref-btn--no:hover:not(:disabled) {
  border-color: #64748b;
}
.ek-photo-pref-btn--selected {
  border-color: #2563eb;
  background: #eff6ff;
  outline: 2px solid #2563eb;
}
.ek-photo-pref-icon {
  font-size: 1.8rem;
  line-height: 1;
}
.ek-photo-pref-group {
  margin-bottom: 18px;
  padding: 14px 16px;
  background: #f8fafc;
  border-radius: 10px;
}
.ek-photo-pref-group-label {
  margin: 0 0 10px;
  font-size: 0.9rem;
  color: #334155;
}
.ek-photo-pref-save {
  margin-top: 8px;
  width: 100%;
  max-width: 320px;
}
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
