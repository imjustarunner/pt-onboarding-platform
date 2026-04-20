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

        <div class="pi-gw-sig-action">
          <div v-if="sectionMeta(cIdx, def.key).signatureData" class="pi-gw-sig-applied">
            <span class="pi-gw-sig-check">&#10003;</span> Signature applied for this section.
          </div>
          <template v-else>
            <div v-if="savedSignatureData" class="pi-gw-sig-btn-wrap">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                @click="applySavedSignature(cIdx, def.key)"
              >
                Use saved signature for this section
              </button>
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

const props = defineProps({
  modelValue: { type: Object, required: true },
  sectionKeys: { type: Array, default: () => [] },
  clientLabels: { type: Array, default: () => [] },
  guardianDefaultPickup: { type: Object, default: () => ({}) },
  savedSignatureData: { type: String, default: '' },
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
.pi-gw-sig-applied {
  font-size: 14px;
  color: var(--success, #166534);
  display: flex;
  align-items: center;
  gap: 6px;
}
.pi-gw-sig-check {
  font-size: 18px;
  line-height: 1;
}
.pi-gw-sig-btn-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
