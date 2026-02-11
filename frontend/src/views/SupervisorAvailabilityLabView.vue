<template>
  <div class="provider-find-page">
    <header class="page-head">
      <div>
        <h1>Find a Provider</h1>
        <p class="muted">Active client-facing providers with intake availability (in-person and virtual).</p>
      </div>
      <button class="btn btn-secondary" type="button" :disabled="loading" @click="reloadAll">Refresh</button>
    </header>

    <section class="filters">
      <label class="field">
        <span>Agency</span>
        <select v-model="selectedAgencyId" @change="onAgencyChange">
          <option v-for="a in agencies" :key="a.id" :value="Number(a.id)">
            {{ a.name }}
          </option>
        </select>
      </label>

      <label class="field">
        <span>Week starting</span>
        <input v-model="weekStart" type="date" @change="loadCards" />
      </label>

      <label class="field field-wide">
        <span>Search provider</span>
        <input v-model="search" type="text" placeholder="Name..." />
      </label>

      <div class="week-actions">
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="shiftWeek(-7)">Previous week</button>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="shiftWeek(7)">Next week</button>
      </div>
    </section>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading provider intake availability...</div>
    <div v-else-if="filteredCards.length === 0" class="empty">No matching providers with intake openings.</div>

    <section v-else class="cards">
      <article v-for="card in filteredCards" :key="card.providerId" class="provider-card">
        <header class="provider-head">
          <div>
            <h2>{{ card.providerName }}</h2>
            <p class="meta-line">{{ card.availabilityLabel }}</p>
            <p class="meta-line">{{ card.bookedThroughLabel }}</p>
          </div>
          <button class="btn btn-success btn-sm" type="button" disabled title="Booking CTA will be wired next">
            Book intake
          </button>
        </header>

        <div class="slot-list">
          <div v-for="slot in card.displaySlots" :key="slot.key" class="slot-chip" :class="slot.modalityClass">
            <div class="slot-line">
              <span class="slot-time">{{ slot.when }}</span>
              <span class="slot-badge">Recurring {{ slot.frequency }}</span>
            </div>
            <div class="slot-meta">{{ slot.modality }}</div>
            <div v-if="slot.location" class="slot-loc">{{ slot.location }}</div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAgencyStore } from '../store/agency';
import api from '../services/api';

const CARD_SLOT_PREVIEW_LIMIT = 6;
const FETCH_CONCURRENCY = 4;

const agencyStore = useAgencyStore();
const loading = ref(false);
const error = ref('');
const agencies = ref([]);
const providers = ref([]);
const cards = ref([]);
const providerWeekErrors = ref([]);
const publicFinderInfoByAgencyId = ref({});
let loadCardsRequestSeq = 0;
const selectedAgencyId = ref(null);
const weekStart = ref(getWeekStartYmd(new Date()));
const search = ref('');

const filteredCards = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  if (!q) return cards.value;
  return cards.value.filter((c) => String(c.providerName || '').toLowerCase().includes(q));
});

function getWeekStartYmd(dateLike) {
  const d = new Date(dateLike);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function providerName(p) {
  return `${p.last_name || ''}, ${p.first_name || ''}`.replace(/^,\s*/, '').trim();
}

function toDate(dateLike) {
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateTimeLabel(dateLike) {
  const d = toDate(dateLike);
  if (!d) return '';
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function toDateLabel(dateLike) {
  const d = toDate(dateLike);
  if (!d) return '';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function slotLocation(slot) {
  const office = String(slot?.buildingName || slot?.officeName || slot?.office_name || '').trim();
  const room = String(slot?.roomLabel || slot?.room_label || slot?.roomName || '').trim();
  if (office && room) return `${office} • ${room}`;
  return office || room || '';
}

function normalizeSlots(data) {
  const inPerson = (Array.isArray(data?.inPersonSlots) ? data.inPersonSlots : []).map((s) => ({
    ...s,
    modality: 'In-person intake',
    modalityClass: 'modality-office'
  }));
  const virtual = (Array.isArray(data?.virtualSlots) ? data.virtualSlots : []).map((s) => ({
    ...s,
    modality: 'Virtual intake',
    modalityClass: 'modality-virtual'
  }));
  return [...inPerson, ...virtual].sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
}

function mapDisplaySlots(providerId, slots) {
  return slots.slice(0, CARD_SLOT_PREVIEW_LIMIT).map((slot, idx) => {
    const start = slot.startAt || slot.start_at;
    const end = slot.endAt || slot.end_at;
    const frequency = String(slot.frequency || 'WEEKLY').toUpperCase() === 'WEEKLY' ? 'weekly' : String(slot.frequency || '').toLowerCase();
    return {
      key: `${providerId}-${idx}-${String(start || '')}-${String(end || '')}`,
      when: `${toDateTimeLabel(start)} - ${toDateTimeLabel(end).split(', ').slice(-1)[0] || ''}`,
      modality: slot.modality,
      modalityClass: slot.modalityClass,
      frequency,
      location: slotLocation(slot)
    };
  });
}

async function fetchProviderWeek(providerId, requestedWeekStart) {
  try {
    const { data } = await api.get(`/availability/providers/${providerId}/week`, {
      params: {
        agencyId: selectedAgencyId.value,
        weekStart: requestedWeekStart,
        includeGoogleBusy: true,
        intakeOnly: true,
        intakeLab: true
      }
    });
    return {
      weekStart: requestedWeekStart,
      slots: normalizeSlots(data)
    };
  } catch (e) {
    providerWeekErrors.value.push({
      providerId: Number(providerId),
      weekStart: requestedWeekStart,
      message: e?.response?.data?.error?.message || e?.message || 'Failed to load provider week'
    });
    return {
      weekStart: requestedWeekStart,
      slots: []
    };
  }
}

function buildCardFromSlots(provider, slots) {
  if (!slots?.length) return null;
  const firstSlot = slots[0];
  const firstStart = firstSlot.startAt || firstSlot.start_at;
  const firstDate = toDate(firstStart);
  const bookedThroughDate = firstDate ? addDaysYmd(firstDate.toISOString().slice(0, 10), -1) : null;

  return {
    providerId: Number(provider.id),
    providerName: providerName(provider),
    availabilityLabel: `Available this week (${slots.length} intake slot${slots.length === 1 ? '' : 's'})`,
    bookedThroughLabel: bookedThroughDate ? `Booked through: ${toDateLabel(bookedThroughDate)}` : 'Booked through: currently open this week',
    displaySlots: mapDisplaySlots(provider.id, slots)
  };
}

function normalizePublicProgramSlots(slots, modalityClass) {
  return (Array.isArray(slots) ? slots : []).map((s) => ({
    ...s,
    modalityClass,
    modality: modalityClass === 'modality-virtual' ? 'Virtual intake' : 'In-person intake'
  }));
}

function mergePublicProviderCards(inPersonProviders, virtualProviders) {
  const map = new Map();
  const put = (provider, modalityClass) => {
    const id = Number(provider?.providerId || 0);
    if (!id) return;
    const existing = map.get(id) || {
      id,
      first_name: String(provider?.firstName || '').trim(),
      last_name: String(provider?.lastName || '').trim()
    };
    const availability = provider?.availability || {};
    const progSlots = normalizePublicProgramSlots(availability?.slots, modalityClass);
    existing._slots = [...(existing._slots || []), ...progSlots];
    map.set(id, existing);
  };
  (inPersonProviders || []).forEach((p) => put(p, 'modality-office'));
  (virtualProviders || []).forEach((p) => put(p, 'modality-virtual'));

  const out = [];
  for (const provider of map.values()) {
    const slots = (provider._slots || []).sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
    const card = buildCardFromSlots(provider, slots);
    if (card) out.push(card);
  }
  return out.sort((a, b) => String(a.providerName || '').localeCompare(String(b.providerName || '')));
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, Number(limit || 1)) }).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      // eslint-disable-next-line no-await-in-loop
      const out = await worker(item);
      if (out) results.push(out);
    }
  });
  await Promise.all(runners);
  return results;
}

async function loadAgencies() {
  await agencyStore.fetchUserAgencies();
  agencies.value = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  if (!selectedAgencyId.value && agencies.value.length > 0) {
    selectedAgencyId.value = Number(agencies.value[0].id);
  }
}

async function loadProviders() {
  if (!selectedAgencyId.value) {
    providers.value = [];
    return;
  }
  const { data } = await api.get('/availability/admin/providers', {
    params: { agencyId: selectedAgencyId.value, scope: 'intake', intakeLab: true }
  });
  providers.value = Array.isArray(data) ? data : [];
}

async function getPublicFinderInfoForAgency(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return { key: null, enabled: false };
  const existing = publicFinderInfoByAgencyId.value?.[aid] || null;
  if (existing && Object.prototype.hasOwnProperty.call(existing, 'key')) {
    return {
      key: String(existing.key || '').trim() || null,
      enabled: !!existing.enabled
    };
  }
  const { data } = await api.get('/availability/admin/public-provider-link', {
    params: { agencyId: aid }
  });
  const key = String(data?.publicAvailabilityAccessKey || '').trim();
  const enabled = !!data?.publicAvailabilityEnabled;
  publicFinderInfoByAgencyId.value = {
    ...(publicFinderInfoByAgencyId.value || {}),
    [aid]: { key: key || null, enabled }
  };
  return { key: key || null, enabled };
}

async function loadCardsLegacyThisWeekOnly() {
  const built = await runWithConcurrency(providers.value, FETCH_CONCURRENCY, async (provider) => {
    const thisWeek = await fetchProviderWeek(provider.id, weekStart.value);
    return buildCardFromSlots(provider, thisWeek?.slots || []);
  });
  cards.value = built
    .filter(Boolean)
    .sort((a, b) => String(a.providerName || '').localeCompare(String(b.providerName || '')));
}

async function loadCards() {
  if (!selectedAgencyId.value) return;
  const requestSeq = ++loadCardsRequestSeq;
  loading.value = true;
  error.value = '';
  providerWeekErrors.value = [];
  try {
    const aid = Number(selectedAgencyId.value || 0);
    const publicInfo = await getPublicFinderInfoForAgency(aid);
    const key = String(publicInfo?.key || '').trim();
    const enabled = !!publicInfo?.enabled;
    if (enabled && key) {
      const [inPersonResp, virtualResp] = await Promise.all([
        api.get(`/public/provider-availability/${aid}/providers`, {
          params: { key, weekStart: weekStart.value, bookingMode: 'NEW_CLIENT', programType: 'IN_PERSON' },
          skipAuthRedirect: true
        }),
        api.get(`/public/provider-availability/${aid}/providers`, {
          params: { key, weekStart: weekStart.value, bookingMode: 'NEW_CLIENT', programType: 'VIRTUAL' },
          skipAuthRedirect: true
        })
      ]);
      if (requestSeq !== loadCardsRequestSeq) return;
      const inPersonProviders = Array.isArray(inPersonResp?.data?.providers) ? inPersonResp.data.providers : [];
      const virtualProviders = Array.isArray(virtualResp?.data?.providers) ? virtualResp.data.providers : [];
      cards.value = mergePublicProviderCards(inPersonProviders, virtualProviders);
    } else {
      await loadCardsLegacyThisWeekOnly();
    }

    if (!cards.value.length && providerWeekErrors.value.length) {
      error.value = 'No provider availability could be loaded for this week. Please refresh.';
    }
  } catch (e) {
    if (requestSeq !== loadCardsRequestSeq) return;
    console.error('Failed to load provider availability cards', e);
    error.value = e?.response?.data?.error?.message || 'Failed to load provider availability.';
    cards.value = [];
  } finally {
    if (requestSeq === loadCardsRequestSeq) loading.value = false;
  }
}

async function onAgencyChange() {
  await loadProviders();
  await loadCards();
}

async function reloadAll() {
  loading.value = true;
  error.value = '';
  try {
    await loadAgencies();
    await loadProviders();
    await loadCards();
  } finally {
    loading.value = false;
  }
}

async function shiftWeek(days) {
  weekStart.value = addDaysYmd(weekStart.value, days);
  await loadCards();
}

onMounted(async () => {
  await reloadAll();
});
</script>

<style scoped>
.provider-find-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 18px;
  display: grid;
  gap: 14px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.page-head h1 {
  margin: 0;
}

.muted {
  color: rgba(15, 23, 42, 0.66);
}

.filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(160px, 1fr));
  gap: 10px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.field-wide {
  grid-column: span 2;
}

.field input,
.field select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
}

.week-actions {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 10px 12px;
}

.loading,
.empty {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 18px;
}

.cards {
  display: grid;
  gap: 12px;
}

.provider-card {
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #dbeafe;
  border-radius: 14px;
  padding: 12px;
  display: grid;
  gap: 10px;
}

.provider-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.provider-head h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.meta-line {
  margin: 2px 0;
  font-size: 13px;
  color: #334155;
}

.slot-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.slot-chip {
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 8px 10px;
}

.slot-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.slot-time {
  font-size: 13px;
  font-weight: 700;
}

.slot-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  background: rgba(255, 255, 255, 0.6);
}

.slot-meta,
.slot-loc {
  margin-top: 2px;
  font-size: 12px;
}

.modality-office {
  background: #dcfce7;
  border-color: #86efac;
}

.modality-virtual {
  background: #ede9fe;
  border-color: #c4b5fd;
}

@media (max-width: 960px) {
  .filters {
    grid-template-columns: 1fr 1fr;
  }

  .field-wide {
    grid-column: span 2;
  }

  .slot-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .filters {
    grid-template-columns: 1fr;
  }

  .field-wide {
    grid-column: span 1;
  }
}
</style>
