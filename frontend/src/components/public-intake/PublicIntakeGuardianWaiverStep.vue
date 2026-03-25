<template>
  <div class="pi-gw">
    <p class="muted pi-gw-intro">
      Complete waivers for each child listed below. Start with <strong>Electronic signature consent</strong>, then complete
      the other sections. Each section needs your checkboxes, signature, and saved data before you can continue.
    </p>

    <div v-for="(label, cIdx) in clientLabels" :key="cIdx" class="pi-gw-client-block">
      <h4 class="pi-gw-client-title">{{ label }}</h4>
      <div v-for="def in activeSectionDefs" :key="`${cIdx}-${def.key}`" class="pi-gw-card">
        <div class="pi-gw-card-head">
          <h5>{{ def.title }}</h5>
        </div>
        <p class="muted small">{{ def.blurb }}</p>

        <component
          :is="def.fields"
          :model-value="sectionPayload(cIdx, def.key)"
          :disabled="fieldsDisabled(cIdx, def.key)"
          @update:model-value="(v) => setSectionPayload(cIdx, def.key, v)"
        />

        <div class="pi-gw-legal">
          <label class="pi-gw-check">
            <input v-model="sectionMeta(cIdx, def.key).consentAcknowledged" type="checkbox" />
            I have read this section and consent to sign.
          </label>
          <label class="pi-gw-check">
            <input v-model="sectionMeta(cIdx, def.key).intentToSign" type="checkbox" />
            I intend my electronic signature to have the same effect as a handwritten signature.
          </label>
        </div>

        <div class="pi-gw-sig">
          <div class="pi-gw-sig-label">Signature (required)</div>
          <SignaturePad
            :key="`sig-${cIdx}-${def.key}`"
            compact
            @signed="(dataUrl) => onSigned(cIdx, def.key, dataUrl)"
          />
          <div v-if="sectionMeta(cIdx, def.key).signatureData" class="muted small">Signature captured.</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SignaturePad from '../SignaturePad.vue';
import GwvFieldsEsign from '../../views/guardian/waivers/GwvFieldsEsign.vue';
import GwvFieldsPickup from '../../views/guardian/waivers/GwvFieldsPickup.vue';
import GwvFieldsEmergency from '../../views/guardian/waivers/GwvFieldsEmergency.vue';
import GwvFieldsAllergies from '../../views/guardian/waivers/GwvFieldsAllergies.vue';
import GwvFieldsMeals from '../../views/guardian/waivers/GwvFieldsMeals.vue';

const ESIGN_KEY = 'esignature_consent';

const props = defineProps({
  modelValue: { type: Object, required: true },
  sectionKeys: { type: Array, default: () => [] },
  clientLabels: { type: Array, default: () => [] }
});

const sectionCatalog = [
  {
    key: 'esignature_consent',
    title: 'Electronic signature consent',
    blurb: 'Required before other waiver sections can be signed.',
    fields: GwvFieldsEsign
  },
  {
    key: 'pickup_authorization',
    title: 'Pickup authorization',
    blurb: 'Who may pick up your child besides you, if applicable.',
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
    title: 'Allergies & snacks',
    blurb: 'Allergies and snacks you approve for your child.',
    fields: GwvFieldsAllergies
  },
  {
    key: 'meal_preferences',
    title: 'Meals',
    blurb: 'Meals or foods you approve or want restricted.',
    fields: GwvFieldsMeals
  }
];

const activeSectionDefs = computed(() => {
  const want = new Set((props.sectionKeys || []).map((k) => String(k || '').trim()));
  const ordered = [];
  for (const def of sectionCatalog) {
    if (want.has(def.key)) ordered.push(def);
  }
  return ordered;
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
    case 'esignature_consent':
      return { consented: false, understoodElectronicRecords: false };
    case 'pickup_authorization':
      return { authorizedPickups: [{ name: '', relationship: '', phone: '' }] };
    case 'emergency_contacts':
      return { contacts: [{ name: '', phone: '', relationship: '' }] };
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
      signatureData: '',
      consentAcknowledged: false,
      intentToSign: false
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

function fieldsDisabled(idx, key) {
  if (key === ESIGN_KEY) return false;
  const es = ensureSection(idx, ESIGN_KEY);
  const p = es.payload && typeof es.payload === 'object' ? es.payload : {};
  const esignOk = !!(p.consented && p.understoodElectronicRecords && String(es.signatureData || '').length >= 80);
  return !esignOk;
}

function onSigned(idx, key, dataUrl) {
  const sec = ensureSection(idx, key);
  sec.signatureData = dataUrl || '';
}
</script>

<style scoped>
.pi-gw {
  text-align: left;
}
.pi-gw-intro {
  margin-bottom: 16px;
  line-height: 1.5;
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
.pi-gw-card-head h5 {
  margin: 0 0 6px;
  font-size: 1rem;
}
.small {
  font-size: 13px;
}
.pi-gw-legal {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0 8px;
  font-size: 14px;
}
.pi-gw-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.pi-gw-sig-label {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
}
</style>
