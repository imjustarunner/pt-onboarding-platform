<template>
  <div class="pi-gw">
    <div v-for="(label, cIdx) in clientLabels" :key="cIdx" class="pi-gw-client-block">
      <h4 class="pi-gw-client-title">{{ label }}</h4>
      <div v-if="showPackLunchNotice" class="pi-gw-card pi-gw-card--notice">
        <div class="pi-gw-card-head"><h5>Meals</h5></div>
        <p class="muted small">This program does not provide meals. Please plan to bring your own lunch or snacks as needed.</p>
      </div>
      <div
        v-for="def in activeSectionDefs"
        :key="`${cIdx}-${def.key}`"
        class="pi-gw-card"
        :class="{ 'pi-gw-card--error': !!sectionError(cIdx, def.key) }"
        :ref="(el) => registerSectionRef(cIdx, def.key, el)"
        :data-gw-section="`${cIdx}:${def.key}`"
      >
        <div class="pi-gw-card-head">
          <h5>{{ def.title }}</h5>
        </div>
        <p v-if="def.blurb" class="muted small">{{ def.blurb }}</p>
        <div v-if="sectionError(cIdx, def.key) && typeof sectionError(cIdx, def.key) === 'string'" class="pi-gw-section-error">
          {{ sectionError(cIdx, def.key) }}
        </div>

        <component
          :is="def.fields"
          :model-value="sectionPayload(cIdx, def.key)"
          v-bind="{
            ...(def.extraProps ? def.extraProps(eventWaiverContext) : {}),
            ...(def.key === 'emergency_contacts' ? { pulse: pulseEmergency } : {}),
            validationError: sectionError(cIdx, def.key)
          }"
          @update:model-value="(v) => setSectionPayload(cIdx, def.key, v)"
        />

        <!--
          For child #2+ on the contact-style sections (pickup + emergency
          contacts), surface a "Copy from [previous child]" button so the
          parent doesn't have to retype the same handful of names/phones
          for every sibling. Only shows when the previous child has data
          to copy and the current child's section is still empty/default
          (so we don't silently clobber edits).
        -->
        <div
          v-if="cIdx > 0 && canCopyFromPrevious(cIdx, def.key)"
          class="pi-gw-copy-prev"
        >
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            @click="copyFromPreviousChild(cIdx, def.key)"
          >
            Copy {{ sectionShortName(def.key) }} from {{ clientLabels[cIdx - 1] || `Child ${cIdx}` }}
          </button>
        </div>

        <div class="pi-gw-sig-action">
          <div v-if="sectionMeta(cIdx, def.key).signatureData" class="pi-gw-sig-applied-wrap">
            <div class="pi-gw-sig-applied">
              <span class="pi-gw-sig-check">&#10003;</span>
              <div class="pi-gw-sig-applied-text">
                <div>
                  <strong>Signed</strong>
                  <span v-if="sectionSignerName(cIdx, def.key)"> by {{ sectionSignerName(cIdx, def.key) }}</span>
                </div>
                <div class="pi-gw-sig-stamp muted small">
                  e-Signature applied {{ sectionSignedAtDisplay(cIdx, def.key) }} ·
                  source: {{ sectionSignatureSourceLabel(cIdx, def.key) }}
                </div>
              </div>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-sm pi-gw-sig-resign"
              @click="resignSection(cIdx, def.key)"
            >
              Sign again
            </button>
          </div>
          <template v-else>
            <div v-if="savedSignatureData" class="pi-gw-sig-btn-wrap">
              <button
                type="button"
                class="btn btn-primary btn-sm pi-gw-sig-apply pi-gw-sig-apply--pulse"
                @click="applySavedSignature(cIdx, def.key)"
              >
                Apply my signature to this section
              </button>
              <span class="muted small pi-gw-sig-hint">You must apply your signature here to record this waiver — it will be re-used from the signature you drew earlier.</span>
            </div>
            <div v-else class="muted small">
              Complete the earlier signature step to sign waivers.
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, toRef } from 'vue';
import GwvFieldsPickup from '../../views/guardian/waivers/GwvFieldsPickup.vue';
import GwvFieldsEmergency from '../../views/guardian/waivers/GwvFieldsEmergency.vue';
import GwvFieldsAllergies from '../../views/guardian/waivers/GwvFieldsAllergies.vue';
import GwvFieldsMeals from '../../views/guardian/waivers/GwvFieldsMeals.vue';
import GwvFieldsWalkHome from '../../views/guardian/waivers/GwvFieldsWalkHome.vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  sectionKeys: { type: Array, default: () => [] },
  clientLabels: { type: Array, default: () => [] },
  guardianDefaultPickup: { type: Object, default: () => ({}) },
  savedSignatureData: { type: String, default: '' },
  /**
   * Display name to attribute the signature to in the per-section confirmation
   * (e.g. "Signed by Alex Jordan"). Required for the e-sign attestation to
   * surface a recognizable signer; falls back to "the guardian" if blank.
   */
  signerDisplayName: { type: String, default: '' },
  /**
   * eventWaiverContext: { snacksAvailable: bool, snackOptions: string[], mealsAvailable: bool, mealOptions: string[] }
   * Passed down from PublicIntakeSigningView once a registration event is selected.
   */
  eventWaiverContext: { type: Object, default: () => ({}) },
  pulseEmergency: { type: Boolean, default: false },
  /**
   * Structured per-section validation errors from the parent step, shaped as:
   *   { [clientIndex]: { [sectionKey]: 'Error text' | { allergies: '...' } } }
   * Used both to decorate the offending card with a red border + message
   * banner, and to pass through `validationError` into the sub-field
   * components so the guardian sees the exact field they missed without
   * scrolling back to the top of the page.
   */
  validationErrors: { type: Object, default: () => ({}) }
});

defineExpose({
  scrollToSection
});

const eventWaiverContext = toRef(props, 'eventWaiverContext');

const sectionCatalog = [
  {
    key: 'pickup_authorization',
    title: 'Pickup authorization',
    blurb: null,
    fields: GwvFieldsPickup
  },
  {
    key: 'walk_home_authorization',
    title: 'Walk-home authorization',
    blurb: 'Use this section ONLY if you authorize your child to walk home alone after this program.',
    fields: GwvFieldsWalkHome
  },
  {
    key: 'emergency_contacts',
    title: 'Emergency contacts',
    blurb: 'People we may contact if we cannot reach you.',
    fields: GwvFieldsEmergency
  },
  {
    key: 'allergies_snacks',
    title: 'Medical information & allergies',
    blurb: null,
    fields: GwvFieldsAllergies,
    // Pass event snack options into GwvFieldsAllergies
    extraProps: (ctx) => ({
      snackOptions: ctx?.snackOptions || []
    })
  },
  {
    key: 'meal_preferences',
    title: 'Meals',
    blurb: null,
    fields: GwvFieldsMeals
  }
];

const activeSectionDefs = computed(() => {
  const ctx = eventWaiverContext.value || {};
  const want = new Set((props.sectionKeys || []).map((k) => String(k || '').trim()));
  const ordered = [];
  for (const def of sectionCatalog) {
    if (!want.has(def.key)) continue;
    // Meal preferences: only show when the event has meals; else guardian will see a notice instead
    if (def.key === 'meal_preferences' && ctx.mealsAvailable === false) continue;
    ordered.push(def);
  }
  return ordered;
});

// Whether to show the "no meals / pack your own" notice in place of the meals section
const showPackLunchNotice = computed(() => {
  const ctx = eventWaiverContext.value || {};
  const want = new Set((props.sectionKeys || []).map((k) => String(k || '').trim()));
  return want.has('meal_preferences') && ctx.mealsAvailable === false;
});

function ensureClientSlot(idx) {
  const root = props.modelValue;
  if (!root.clients) root.clients = [];
  while (root.clients.length <= idx) {
    root.clients.push({ sections: {} });
  }
  const row = root.clients[idx];
  if (!row.sections) row.sections = {};
  return row;
}

function defaultPayload(key) {
  const guardianName = String(props.guardianDefaultPickup?.name || '').trim();
  const guardianRelationship = String(props.guardianDefaultPickup?.relationship || '').trim();
  const guardianPhone = String(props.guardianDefaultPickup?.phone || '').trim();
  const defaultGuardianPickupRow = guardianName
    ? [{
        name: guardianName,
        relationship: guardianRelationship || 'Parent/Guardian',
        phone: guardianPhone
      }]
    : [{ name: '', relationship: '', phone: '' }];
  switch (key) {
    case 'pickup_authorization':
      return {
        declinePickupAuthorization: false,
        authorizedPickups: defaultGuardianPickupRow
      };
    case 'walk_home_authorization':
      // Default to "not authorized" so the parent has to make an explicit
      // affirmative choice before they can sign — matches the legal weight
      // of releasing an unaccompanied minor.
      return {
        allowedToWalkHome: false,
        allowedWindow: '',
        route: '',
        conditions: '',
        attestation: false
      };
    case 'emergency_contacts':
      return {
        declineEmergencyContacts: false,
        contacts: [{ name: '', phone: '', relationship: '' }]
      };
    case 'allergies_snacks':
      return { allergies: '', approvedSnacks: '', notes: '' };
    case 'meal_preferences':
      return { allowedMeals: '', restrictedMeals: '', notes: '' };
    default:
      return {};
  }
}

function ensureSection(idx, key) {
  const row = ensureClientSlot(idx);
  if (!row.sections[key]) {
    row.sections[key] = {
      payload: defaultPayload(key),
      signatureData: ''
    };
  }
  return row.sections[key];
}

function sectionPayload(idx, key) {
  const sec = ensureSection(idx, key);
  if (!sec.payload || typeof sec.payload !== 'object') {
    sec.payload = defaultPayload(key);
  } else if (key === 'pickup_authorization') {
    const rows = Array.isArray(sec.payload.authorizedPickups) ? sec.payload.authorizedPickups : [];
    const hasAnyEntry = rows.some((row) =>
      [row?.name, row?.relationship, row?.phone].some((v) => String(v || '').trim().length > 0)
    );
    if (!hasAnyEntry) {
      sec.payload = defaultPayload(key);
    }
  }
  return sec.payload;
}

function setSectionPayload(idx, key, v) {
  const sec = ensureSection(idx, key);
  sec.payload = v && typeof v === 'object' ? v : defaultPayload(key);
}

function sectionMeta(idx, key) {
  return ensureSection(idx, key);
}

function applySavedSignature(idx, key) {
  const sig = String(props.savedSignatureData || '').trim();
  if (!sig) return;
  const sec = ensureSection(idx, key);
  sec.signatureData = sig;
  // Capture per-section e-signature audit metadata at the moment the
  // guardian explicitly applied their signature. The server will stamp
  // ip / user_agent / submission_id at finalize, but the timestamp +
  // source method must be recorded here so we can prove the signature
  // wasn't silently auto-applied by validation as it used to be.
  sec.signatureMeta = {
    signedAt: new Date().toISOString(),
    signerName: String(props.signerDisplayName || '').trim() || null,
    sourceMethod: 'reused_guardian_signature',
    consentAcknowledged: true,
    intentToSign: true,
    sectionKey: String(key || ''),
    clientIndex: Number(idx)
  };
}

function resignSection(idx, key) {
  // "Sign again" clears the applied signature on this section so the
  // parent can re-apply it (or, in the future, draw a new one). We
  // intentionally don't auto-re-apply — the next click of the Apply
  // button records a fresh signedAt timestamp, which is the whole
  // point of giving the parent a way to "sign again".
  const sec = ensureSection(idx, key);
  sec.signatureData = '';
  sec.signatureMeta = null;
}

function sectionSignerName(idx, key) {
  const sec = ensureSection(idx, key);
  return String(sec?.signatureMeta?.signerName || props.signerDisplayName || '').trim();
}

function sectionSignedAtDisplay(idx, key) {
  const sec = ensureSection(idx, key);
  const iso = sec?.signatureMeta?.signedAt;
  if (!iso) return 'just now';
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return 'just now';
    return d.toLocaleString();
  } catch {
    return 'just now';
  }
}

function sectionSignatureSourceLabel(idx, key) {
  const sec = ensureSection(idx, key);
  const src = String(sec?.signatureMeta?.sourceMethod || 'reused_guardian_signature');
  if (src === 'reused_guardian_signature') return 'reused signature drawn earlier in this session';
  if (src === 'redrawn_for_section') return 'newly drawn for this section';
  return src.replace(/_/g, ' ');
}

// Map of section refs for scroll-to-first-error behavior. Key format is
// `${clientIndex}:${sectionKey}` matching the data-gw-section attribute on the
// card so we can find it either via the map or via a DOM query from the parent.
const sectionRefs = new Map();
function registerSectionRef(cIdx, key, el) {
  const k = `${cIdx}:${key}`;
  if (el) sectionRefs.set(k, el);
  else sectionRefs.delete(k);
}

function sectionError(cIdx, key) {
  const map = props.validationErrors || {};
  const perClient = map[cIdx] || map[String(cIdx)] || {};
  return perClient[key] || '';
}

function scrollToSection(cIdx, key) {
  const k = `${cIdx}:${key}`;
  const el = sectionRefs.get(k)
    || document.querySelector(`[data-gw-section="${k}"]`);
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Sections that benefit from a "copy from previous child" shortcut.
 * Most multi-kid families use the same pickup contacts and the same
 * emergency contacts across siblings; the medical/allergy and meal
 * sections are intentionally NOT copyable because they're per-child.
 */
const COPYABLE_SECTION_KEYS = new Set(['pickup_authorization', 'emergency_contacts']);

function sectionShortName(key) {
  if (key === 'pickup_authorization') return 'pickup contacts';
  if (key === 'emergency_contacts') return 'emergency contacts';
  return 'this section';
}

/** Deep clone via JSON. The payloads here are plain string/bool/array
 *  shapes so this is safe and avoids any reactive proxy entanglement
 *  between the source child and the destination child. */
function clonePayload(p) {
  if (!p || typeof p !== 'object') return p;
  try { return JSON.parse(JSON.stringify(p)); } catch { return p; }
}

/** Returns true if the previous child has at least one populated row in
 *  the given section AND the current child's section is still empty /
 *  default. We deliberately bail out when the current child already has
 *  any user-entered values so a stray button click can't wipe their work. */
function canCopyFromPrevious(cIdx, key) {
  if (cIdx <= 0) return false;
  if (!COPYABLE_SECTION_KEYS.has(key)) return false;
  const prev = ensureSection(cIdx - 1, key);
  const cur = ensureSection(cIdx, key);
  if (key === 'pickup_authorization') {
    const prevRows = Array.isArray(prev?.payload?.authorizedPickups) ? prev.payload.authorizedPickups : [];
    const curRows = Array.isArray(cur?.payload?.authorizedPickups) ? cur.payload.authorizedPickups : [];
    const prevHasContent = prevRows.some((r) =>
      [r?.name, r?.phone, r?.relationship].some((v) => String(v || '').trim().length > 0)
    );
    const curHasUserContent = curRows.some((r) =>
      [r?.name, r?.phone, r?.relationship].some((v) => String(v || '').trim().length > 0)
    );
    return prevHasContent && (!curHasUserContent || curRows.length === 1);
  }
  if (key === 'emergency_contacts') {
    const prevRows = Array.isArray(prev?.payload?.contacts) ? prev.payload.contacts : [];
    const curRows = Array.isArray(cur?.payload?.contacts) ? cur.payload.contacts : [];
    const prevHasContent = prevRows.some((r) =>
      [r?.name, r?.phone, r?.relationship].some((v) => String(v || '').trim().length > 0)
    );
    const curHasUserContent = curRows.some((r) =>
      [r?.name, r?.phone, r?.relationship].some((v) => String(v || '').trim().length > 0)
    );
    return prevHasContent && (!curHasUserContent || curRows.length === 1);
  }
  return false;
}

function copyFromPreviousChild(cIdx, key) {
  if (!canCopyFromPrevious(cIdx, key)) return;
  const prev = ensureSection(cIdx - 1, key);
  const cur = ensureSection(cIdx, key);
  const cloned = clonePayload(prev.payload);
  // Preserve the per-section opt-out state if the parent already toggled
  // it on the current child — copying contacts shouldn't silently re-enable
  // the section.
  if (key === 'pickup_authorization' && cur.payload?.declinePickupAuthorization) {
    cloned.declinePickupAuthorization = true;
    cloned.authorizedPickups = [{ name: '', relationship: '', phone: '' }];
  }
  if (key === 'emergency_contacts' && cur.payload?.declineEmergencyContacts) {
    cloned.declineEmergencyContacts = true;
    cloned.contacts = [{ name: '', phone: '', relationship: '' }];
  }
  setSectionPayload(cIdx, key, cloned);
}
</script>

<style scoped>
.pi-gw {
  text-align: left;
}
.pi-gw-client-block {
  margin-bottom: 28px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.pi-gw-client-title {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
.pi-gw-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 14px;
  background: var(--bg, #fff);
}
.pi-gw-card--notice {
  background: var(--bg-alt, #f8fafc);
}
.pi-gw-card--error {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.08);
  background: #fff8f8;
}
.pi-gw-section-error {
  margin: 6px 0 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 13px;
  line-height: 1.4;
  border: 1px solid #fecaca;
}
.pi-gw-card-head h5 {
  margin: 0 0 6px;
  font-size: 1rem;
}
.small {
  font-size: 13px;
}
.pi-gw-sig-action {
  margin-top: 14px;
}
.pi-gw-sig-applied-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  background: #ecfdf5;
  border: 1px solid #86efac;
  border-radius: 8px;
  padding: 8px 12px;
}
.pi-gw-sig-applied {
  font-size: 14px;
  color: var(--success, #166534);
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.pi-gw-sig-applied-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pi-gw-sig-stamp {
  font-size: 11.5px;
}
.pi-gw-sig-check {
  font-size: 18px;
  line-height: 1.1;
}
.pi-gw-sig-resign {
  align-self: flex-start;
  font-size: 12px;
}
.pi-gw-sig-btn-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
.pi-gw-sig-hint {
  max-width: 480px;
}
.pi-gw-sig-apply--pulse {
  animation: piGwSigPulse 1.6s ease-in-out infinite;
  box-shadow: 0 0 0 0 rgba(15, 118, 110, 0.55);
}
@keyframes piGwSigPulse {
  0%   { box-shadow: 0 0 0 0   rgba(15, 118, 110, 0.55); transform: translateY(0); }
  50%  { box-shadow: 0 0 0 10px rgba(15, 118, 110, 0);    transform: translateY(-1px); }
  100% { box-shadow: 0 0 0 0   rgba(15, 118, 110, 0);    transform: translateY(0); }
}
.pi-gw-copy-prev {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}
</style>
