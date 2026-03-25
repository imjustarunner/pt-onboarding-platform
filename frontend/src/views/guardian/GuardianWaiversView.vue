<template>
  <div class="gwv">
    <div class="gwv-head">
      <router-link class="btn btn-secondary btn-sm" :to="backTo">← Back</router-link>
      <div>
        <h1 class="gwv-title">Waivers &amp; safety</h1>
        <p class="gwv-sub muted">
          Sign and update pickup rules, emergency contacts, allergies, meals, and e-signature consent. Each save or revoke
          requires your signature.
        </p>
      </div>
    </div>

    <div v-if="loadingClients" class="muted">Loading children…</div>
    <div v-else-if="clientsError" class="error-box">{{ clientsError }}</div>
    <div v-else-if="!clients.length" class="hint">No children are linked to your guardian account yet.</div>
    <template v-else>
      <div class="gwv-row">
        <label class="gwv-label">Child</label>
        <select v-model.number="selectedClientId" class="input gwv-select" @change="onClientChange">
          <option v-for="c in clients" :key="c.client_id" :value="c.client_id">
            {{ childLabel(c) }}
          </option>
        </select>
      </div>

      <div v-if="profileLoading" class="muted">Loading waivers…</div>
      <div v-else-if="profileError" class="error-box">{{ profileError }}</div>
      <div v-else-if="profile && !profile.enabled" class="hint gwv-disabled">
        Guardian waivers are not enabled for this child’s organization. Ask your administrator to turn on
        <code>guardianWaiversEnabled</code> for the agency.
      </div>

      <div v-else-if="profile?.enabled" class="gwv-sections">
        <p v-if="!esignActive" class="gwv-banner">
          Start with <strong>Electronic signature consent</strong> before other sections can be saved.
        </p>

        <div v-for="def in sectionDefs" :key="def.key" class="gwv-card">
          <div class="gwv-card-head">
            <h2>{{ def.title }}</h2>
            <span class="gwv-status" :class="statusClass(sectionState(def.key))">
              {{ statusLabel(sectionState(def.key)) }}
            </span>
          </div>
          <p class="muted small">{{ def.blurb }}</p>

          <component
            :is="def.fields"
            :key="`${selectedClientId}-${def.key}`"
            :model-value="drafts[def.key]"
            :disabled="fieldsDisabled(def.key)"
            @update:model-value="(v) => (drafts[def.key] = v)"
          />

          <div class="gwv-legal">
            <label class="gwv-check">
              <input v-model="consentAck[def.key]" type="checkbox" />
              I have read this section and consent to sign.
            </label>
            <label class="gwv-check">
              <input v-model="intentAck[def.key]" type="checkbox" />
              I intend my electronic signature to have the same effect as a handwritten signature.
            </label>
          </div>

          <div class="gwv-sig">
            <div class="gwv-sig-label">Signature (required for save / revoke)</div>
            <SignaturePad :key="`sig-${selectedClientId}-${def.key}`" :compact="true" @signed="(dataUrl) => onSectionSigned(def.key, dataUrl)" />
          </div>

          <div class="gwv-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="savingKey === def.key || !canSaveSection(def.key)"
              @click="saveSection(def.key)"
            >
              {{ savingKey === def.key ? 'Saving…' : sectionSaveLabel(def.key) }}
            </button>
            <button
              v-if="sectionState(def.key)?.status === 'active'"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="savingKey === def.key || !canRevokeSection(def.key)"
              @click="revokeSection(def.key)"
            >
              {{ savingKey === def.key ? 'Working…' : 'Revoke with signature' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import SignaturePad from '../../components/SignaturePad.vue';
import GwvFieldsEsign from './waivers/GwvFieldsEsign.vue';
import GwvFieldsPickup from './waivers/GwvFieldsPickup.vue';
import GwvFieldsEmergency from './waivers/GwvFieldsEmergency.vue';
import GwvFieldsAllergies from './waivers/GwvFieldsAllergies.vue';
import GwvFieldsMeals from './waivers/GwvFieldsMeals.vue';

const route = useRoute();

const backTo = computed(() =>
  route.params.organizationSlug ? `/${route.params.organizationSlug}/guardian` : '/guardian'
);

const clients = ref([]);
const loadingClients = ref(true);
const clientsError = ref('');

const selectedClientId = ref(null);
const profile = ref(null);
const profileLoading = ref(false);
const profileError = ref('');
const savingKey = ref('');

const drafts = reactive({
  esignature_consent: { consented: false, understoodElectronicRecords: false },
  pickup_authorization: { authorizedPickups: [{ name: '', relationship: '', phone: '' }] },
  emergency_contacts: { contacts: [{ name: '', phone: '', relationship: '' }] },
  allergies_snacks: { allergies: '', approvedSnacks: '', notes: '' },
  meal_preferences: { allowedMeals: '', restrictedMeals: '', notes: '' }
});

const consentAck = reactive({});
const intentAck = reactive({});
const signatures = reactive({});

const sectionDefs = [
  {
    key: 'esignature_consent',
    title: 'Electronic signature consent',
    blurb: 'Required before other waivers. You may revoke this consent at any time (other sections will be locked until renewed).',
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
    blurb: 'Meals or foods you approve or want restricted (general preferences, not per-event).',
    fields: GwvFieldsMeals
  }
];

for (const d of sectionDefs) {
  consentAck[d.key] = false;
  intentAck[d.key] = false;
  signatures[d.key] = '';
}

const esignActive = computed(() => profile.value?.sections?.esignature_consent?.status === 'active');

function childLabel(c) {
  const name = (c.full_name || '').trim();
  return name || c.initials || `Child #${c.client_id}`;
}

function sectionState(key) {
  return profile.value?.sections?.[key] || null;
}

function statusLabel(row) {
  if (!row) return 'Not started';
  if (row.status === 'active') return 'Active';
  if (row.status === 'revoked') return 'Revoked';
  return 'Not started';
}

function statusClass(row) {
  if (row?.status === 'active') return 'ok';
  if (row?.status === 'revoked') return 'rev';
  return 'muted';
}

function fieldsDisabled(key) {
  if (key === 'esignature_consent') return false;
  return !esignActive.value;
}

function sectionSaveLabel(key) {
  const row = sectionState(key);
  if (!row || row.status === 'revoked') return 'Save & sign (first time)';
  return 'Save changes & sign';
}

function hydrateDraftsFromProfile() {
  const sec = profile.value?.sections || {};
  for (const d of sectionDefs) {
    const payload = sec[d.key]?.payload;
    if (payload && typeof payload === 'object') {
      drafts[d.key] = JSON.parse(JSON.stringify({ ...drafts[d.key], ...payload }));
    }
  }
}

function resetDraftsToEmpty() {
  drafts.esignature_consent = { consented: false, understoodElectronicRecords: false };
  drafts.pickup_authorization = { authorizedPickups: [{ name: '', relationship: '', phone: '' }] };
  drafts.emergency_contacts = { contacts: [{ name: '', phone: '', relationship: '' }] };
  drafts.allergies_snacks = { allergies: '', approvedSnacks: '', notes: '' };
  drafts.meal_preferences = { allowedMeals: '', restrictedMeals: '', notes: '' };
}

function onSectionSigned(key, dataUrl) {
  signatures[key] = dataUrl || '';
}

function canSaveSection(key) {
  if (!consentAck[key] || !intentAck[key]) return false;
  const sig = String(signatures[key] || '').trim();
  if (sig.length < 80) return false;
  if (key === 'esignature_consent') {
    return !!(drafts.esignature_consent?.consented && drafts.esignature_consent?.understoodElectronicRecords);
  }
  return true;
}

function canRevokeSection(key) {
  return canSaveSection(key);
}

async function loadClients() {
  loadingClients.value = true;
  clientsError.value = '';
  try {
    const { data } = await api.get('/guardian-portal/clients');
    const rows = (data || []).filter(
      (c) => String(c.relationship_type || '').toLowerCase() !== 'self' && !c.guardian_portal_locked
    );
    clients.value = rows;
    if (rows.length && !selectedClientId.value) {
      selectedClientId.value = rows[0].client_id;
    }
  } catch (e) {
    clientsError.value = e.response?.data?.error?.message || 'Failed to load children';
  } finally {
    loadingClients.value = false;
  }
}

async function loadProfile() {
  const cid = Number(selectedClientId.value);
  if (!cid) return;
  profileLoading.value = true;
  profileError.value = '';
  try {
    resetDraftsToEmpty();
    const { data } = await api.get(`/guardian-portal/waivers/clients/${cid}`);
    profile.value = data;
    hydrateDraftsFromProfile();
  } catch (e) {
    profileError.value = e.response?.data?.error?.message || 'Failed to load waivers';
    profile.value = null;
  } finally {
    profileLoading.value = false;
  }
}

function onClientChange() {
  for (const d of sectionDefs) {
    consentAck[d.key] = false;
    intentAck[d.key] = false;
    signatures[d.key] = '';
  }
  loadProfile();
}

async function saveSection(key) {
  const cid = Number(selectedClientId.value);
  if (!cid) return;
  const row = sectionState(key);
  const isCreate = !row || row.status !== 'active';
  savingKey.value = key;
  profileError.value = '';
  try {
    const body = {
      payload: drafts[key],
      signatureData: signatures[key],
      consentAcknowledged: true,
      intentToSign: true
    };
    const url = `/guardian-portal/waivers/clients/${cid}/sections/${key}`;
    if (isCreate) {
      await api.post(url, body);
    } else {
      await api.put(url, body);
    }
    signatures[key] = '';
    consentAck[key] = false;
    intentAck[key] = false;
    await loadProfile();
  } catch (e) {
    profileError.value = e.response?.data?.error?.message || 'Save failed';
  } finally {
    savingKey.value = '';
  }
}

async function revokeSection(key) {
  const cid = Number(selectedClientId.value);
  if (!cid) return;
  savingKey.value = key;
  profileError.value = '';
  try {
    await api.post(`/guardian-portal/waivers/clients/${cid}/sections/${key}/revoke`, {
      signatureData: signatures[key],
      consentAcknowledged: true,
      intentToSign: true
    });
    signatures[key] = '';
    consentAck[key] = false;
    intentAck[key] = false;
    await loadProfile();
  } catch (e) {
    profileError.value = e.response?.data?.error?.message || 'Revoke failed';
  } finally {
    savingKey.value = '';
  }
}

watch(selectedClientId, () => {
  if (selectedClientId.value) loadProfile();
});

loadClients().then(() => loadProfile());
</script>

<style scoped>
.gwv {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.gwv-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}
.gwv-title {
  margin: 0;
  font-size: 1.5rem;
}
.gwv-sub {
  margin: 4px 0 0;
  font-size: 14px;
}
.gwv-row {
  margin-bottom: 16px;
}
.gwv-label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
.gwv-select {
  max-width: 420px;
}
.gwv-sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.gwv-banner {
  padding: 10px 12px;
  background: var(--bg-muted, #f0f4f8);
  border-radius: 8px;
  font-size: 14px;
}
.gwv-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg, #fff);
}
.gwv-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.gwv-card-head h2 {
  margin: 0;
  font-size: 1.1rem;
}
.gwv-status {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 6px;
}
.gwv-status.ok {
  color: #0d6b3e;
  background: #e6f7ef;
}
.gwv-status.rev {
  color: #8a3a1f;
  background: #fdeee8;
}
.gwv-status.muted {
  color: #64748b;
  background: #f1f5f9;
}
.gwv-legal {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.gwv-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.gwv-sig {
  margin-top: 12px;
}
.gwv-sig-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.gwv-actions {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.error-box {
  color: #b42318;
  background: #fef3f2;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.gwv-disabled code {
  font-size: 12px;
}
</style>
