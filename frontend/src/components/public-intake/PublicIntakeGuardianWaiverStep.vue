<template>
  <div class="pi-gw">
    <div v-for="(label, cIdx) in clientLabels" :key="cIdx" class="pi-gw-client-block">
      <h4 class="pi-gw-client-title">{{ label }}</h4>
      <div v-if="showPackLunchNotice" class="pi-gw-card pi-gw-card--notice">
        <div class="pi-gw-card-head"><h5>Meals</h5></div>
        <p class="muted small">This program does not provide meals. Please plan to bring your own lunch or snacks as needed.</p>
      </div>
      <div v-for="def in activeSectionDefs" :key="`${cIdx}-${def.key}`" class="pi-gw-card">
        <div class="pi-gw-card-head">
          <h5>{{ def.title }}</h5>
        </div>
        <p v-if="def.blurb" class="muted small">{{ def.blurb }}</p>

        <component
          :is="def.fields"
          :model-value="sectionPayload(cIdx, def.key)"
          v-bind="def.extraProps ? def.extraProps(eventWaiverContext) : {}"
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
  savedSignatureData: { type: String, default: '' },
  /**
   * eventWaiverContext: { snacksAvailable: bool, snackOptions: string[], mealsAvailable: bool, mealOptions: string[] }
   * Passed down from PublicIntakeSigningView once a registration event is selected.
   */
  eventWaiverContext: { type: Object, default: () => ({}) }
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
  switch (key) {
    case 'pickup_authorization':
      return {
        declinePickupAuthorization: false,
        authorizedPickups: [{ name: '', relationship: '', phone: '' }]
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
