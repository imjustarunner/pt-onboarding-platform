<template>
  <section class="billing-settings" aria-labelledby="billing-settings-title">
    <BillingSectionNav current="billing-settings" />
    <header>
      <p class="eyebrow">Claim identity</p>
      <h2 id="billing-settings-title">Billing settings</h2>
      <p>
        A claim bills from the office: its practice name, address, and NPI.
        A school, home, or telehealth site is the place of service. It is listed on the service line and is not the billing address.
      </p>
    </header>

    <p v-if="!agencyId" class="status">Select a practice to edit billing offices and places of service.</p>
    <p v-else-if="loading" class="status">Loading billing offices…</p>
    <p v-else-if="error" class="status error" role="alert">{{ error }}</p>

    <template v-else>
      <section class="panel" aria-labelledby="offices-title">
        <h3 id="offices-title">Billing offices</h3>
        <ul v-if="unassignedNpis.length" class="npi-list">
          <li v-for="npi in unassignedNpis" :key="npi.id">
            <strong>{{ npi.npi_number }}</strong>
            <span>{{ npiLabel(npi) }} This NPI is not tied to one office.</span>
          </li>
        </ul>
        <article v-for="office in offices" :key="office.id" class="office">
          <div class="office-title">
            <h4>{{ office.name || 'Office' }}</h4>
            <p v-if="!office.owned">This building is owned by another practice. Its billing identity is shown here and edited there.</p>
          </div>
          <div class="fields">
            <label>Office name <input v-model="office.name" :disabled="!office.owned || saving" /></label>
            <label>Practice name on the claim <input v-model="office.practiceName" :disabled="!office.owned || saving" /></label>
            <label>Service-facility name on the claim
              <input v-model="office.claimFacilityName" maxlength="35" :placeholder="office.practiceName" :disabled="!office.owned || saving" />
              <small>CCHA claims send this name, the billing NPI, and this office’s street, city, state, and ZIP as the service facility. Leave blank to use the practice name. Maximum 35 characters.</small>
            </label>
            <label>Street <input v-model="office.streetAddress" :disabled="!office.owned || saving" /></label>
            <label>City <input v-model="office.city" :disabled="!office.owned || saving" /></label>
            <label>State <input v-model="office.state" :disabled="!office.owned || saving" /></label>
            <label>Postal code <input v-model="office.postalCode" :disabled="!office.owned || saving" /><small>Use the enrolled office ZIP, including ZIP+4 when available.</small></label>
            <label>Phone <input v-model="office.phone" :disabled="!office.owned || saving" /></label>
            <label>Practice NPI <input v-model="office.practiceNpi" inputmode="numeric" maxlength="10" :disabled="!office.owned || saving" /></label>
            <label>Taxonomy <input v-model="office.taxonomyCode" :disabled="!office.owned || saving" /></label>
          </div>
          <ul v-if="npisFor(office.id).length" class="npi-list">
            <li v-for="npi in npisFor(office.id)" :key="npi.id">
              <strong>{{ npi.npi_number }}</strong>
              <span>{{ npiLabel(npi) }}</span>
            </li>
          </ul>
          <button v-if="office.owned" type="button" :disabled="saving" @click="saveOffice(office)">Save office</button>
          <p v-if="office.message" class="save-note">{{ office.message }}</p>
        </article>
        <p v-if="!offices.length" class="status">No billing office is on file for this practice.</p>
      </section>

      <section class="panel" aria-labelledby="pos-title">
        <div class="panel-heading">
          <div>
            <h3 id="pos-title">Places of service</h3>
            <p>Each place bills under the office you choose. The office address stays on the claim.</p>
          </div>
        </div>
        <article v-for="place in places" :key="place.id" class="place">
          <h4>{{ place.name || 'Place of service' }}</h4>
          <div class="fields">
            <label>Name <input v-model="place.name" :disabled="saving" /></label>
            <label>Place of service
              <input v-model="place.placeOfService" maxlength="2" :disabled="saving" />
            </label>
            <label>Bills from
              <select v-model.number="place.billingOfficeLocationId" :disabled="saving">
                <option :value="0">Choose an office</option>
                <option v-for="office in offices" :key="office.id" :value="office.id">{{ office.name }}</option>
              </select>
            </label>
          </div>
          <p class="kind">{{ placeKind(place) }}</p>
          <p v-if="place.streetAddress" class="site">Service site: {{ placeAddress(place) }}. This street is not the billing address.</p>
          <button type="button" :disabled="saving" @click="savePlace(place)">Save place of service</button>
          <p v-if="place.message" class="save-note">{{ place.message }}</p>
        </article>

        <form class="new-place" @submit.prevent="addPlace">
          <h4>Add a place of service</h4>
          <div class="fields">
            <label>Name <input v-model="draft.name" required /></label>
            <label>Place of service <input v-model="draft.placeOfService" maxlength="2" required /></label>
            <label>Bills from
              <select v-model.number="draft.billingOfficeLocationId" required>
                <option :value="0" disabled>Choose an office</option>
                <option v-for="office in offices" :key="office.id" :value="office.id">{{ office.name }}</option>
              </select>
            </label>
          </div>
          <button type="submit" :disabled="saving || !draft.billingOfficeLocationId">Add place</button>
        </form>
      </section>
    </template>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import BillingSectionNav from './BillingSectionNav.vue';

const props = defineProps({
  scopedAgencyId: { type: [Number, String], default: null }
});
const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(props.scopedAgencyId || agencyStore.currentAgency?.id || 0));

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const offices = ref([]);
const places = ref([]);
const groupNpis = ref([]);
const draft = reactive({ name: '', placeOfService: '', billingOfficeLocationId: 0 });

function officeDraft(office) {
  return {
    id: Number(office.id),
    agencyId: Number(office.agency_id),
    owned: Number(office.agency_id) === agencyId.value,
    name: office.name || '',
    practiceName: office.practice_name || '',
    claimFacilityName: office.claim_facility_name || '',
    streetAddress: office.street_address || '',
    city: office.city || '',
    state: office.state || '',
    postalCode: office.postal_code || '',
    phone: office.phone || '',
    practiceNpi: office.practice_npi || '',
    taxonomyCode: office.taxonomy_code || '',
    message: ''
  };
}

function placeDraft(place) {
  return {
    id: Number(place.id),
    name: place.name || '',
    placeOfService: place.place_of_service || '',
    billingOfficeLocationId: Number(place.billing_office_location_id || 0),
    locationKind: place.location_kind || 'custom',
    streetAddress: place.street_address || '',
    city: place.city || '',
    state: place.state || '',
    postalCode: place.postal_code || '',
    message: ''
  };
}

function npisFor(officeId) {
  return groupNpis.value.filter((npi) => Number(npi.office_location_id) === Number(officeId));
}

const unassignedNpis = computed(() => groupNpis.value.filter((npi) => !Number(npi.office_location_id)));

function npiLabel(npi) {
  const notes = String(npi.notes || npi.label || '');
  if (/payer override/i.test(notes)) return 'Payer override NPI. The office practice NPI stays the billing identity.';
  return npi.label || 'Group NPI';
}

function placeKind(place) {
  if (place.locationKind === 'office_pos') return 'Office place-of-service template';
  if (place.locationKind === 'school') return 'School service site. The claim still bills from the office.';
  return 'Service site';
}

function placeAddress(place) {
  return [place.streetAddress, place.city, place.state, place.postalCode].filter(Boolean).join(', ');
}

async function load() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/medical-billing/service-locations', { params: { agencyId: agencyId.value, includeInactive: '0' } });
    offices.value = (data?.billingOffices || []).map(officeDraft);
    places.value = (data?.items || []).map(placeDraft);
    groupNpis.value = data?.groupNpis || [];
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Billing offices could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function saveOffice(office) {
  saving.value = true;
  office.message = '';
  error.value = '';
  try {
    await api.patch(`/medical-billing/billing-offices/${office.id}`, {
      agencyId: agencyId.value,
      name: office.name,
      practiceName: office.practiceName,
      claimFacilityName: office.claimFacilityName,
      streetAddress: office.streetAddress,
      city: office.city,
      state: office.state,
      postalCode: office.postalCode,
      phone: office.phone,
      practiceNpi: office.practiceNpi,
      taxonomyCode: office.taxonomyCode
    });
    office.message = 'Saved.';
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'That office could not be saved.';
  } finally {
    saving.value = false;
  }
}

async function savePlace(place) {
  saving.value = true;
  place.message = '';
  error.value = '';
  try {
    await api.patch(`/medical-billing/service-locations/${place.id}`, {
      agencyId: agencyId.value,
      name: place.name,
      placeOfService: place.placeOfService,
      billingOfficeLocationId: place.billingOfficeLocationId || null
    });
    place.message = 'Saved.';
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'That place of service could not be saved.';
  } finally {
    saving.value = false;
  }
}

async function addPlace() {
  saving.value = true;
  error.value = '';
  try {
    await api.post('/medical-billing/service-locations', {
      agencyId: agencyId.value,
      name: draft.name,
      placeOfService: draft.placeOfService,
      billingOfficeLocationId: draft.billingOfficeLocationId
    });
    draft.name = '';
    draft.placeOfService = '';
    draft.billingOfficeLocationId = 0;
    await load();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'That place of service could not be added.';
  } finally {
    saving.value = false;
  }
}

watch(agencyId, load, { immediate: true });
</script>

<style scoped>
.billing-settings { color: var(--brand-ink, #1d2633); }
.eyebrow { color: var(--brand-red, #b80016); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; margin: 0 0 4px; text-transform: uppercase; }
header h2, .panel h3, .office h4, .new-place h4 { margin: 0 0 6px; }
header p, .panel-heading p, .office-title p, .kind, .site { color: #4d5968; line-height: 1.45; margin: 0; max-width: 78ch; }
.panel { background: #fff; border: 1px solid #e4e7ec; border-radius: 16px; margin-top: 18px; padding: 16px 18px; }
.office, .place, .new-place { border-top: 1px solid #eef1f4; margin-top: 16px; padding-top: 16px; }
.place h4, .new-place h4 { margin-bottom: 4px; }
.fields { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 12px 0; }
label { color: #4d5968; display: grid; font-size: 13px; gap: 6px; }
input, select, button { border: 1px solid #d5dbe3; border-radius: 10px; color: inherit; font: inherit; padding: 8px 10px; }
button { background: var(--brand-ink, #1d2633); color: #fff; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.55; }
.npi-list { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; margin: 0 0 12px; padding: 0; }
.npi-list li { background: #f7f4ef; border-radius: 12px; padding: 8px 10px; }
.npi-list span, .save-note { color: #4d5968; display: block; }
.status.error { color: var(--brand-red, #b80016); }
@media (max-width: 900px) {
  .fields { grid-template-columns: 1fr; }
}
</style>
