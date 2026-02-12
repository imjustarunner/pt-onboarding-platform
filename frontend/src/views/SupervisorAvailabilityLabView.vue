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
        <select v-model="selectedAgencyKey" @change="onAgencyChange">
          <option value="ALL">All agencies</option>
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
        <div class="provider-layout">
          <div class="provider-identity">
            <div class="avatar-fallback">{{ initialsFor(card.providerName) }}</div>
            <div class="identity-copy">
              <h2>{{ card.providerName }}</h2>
              <p class="meta-line">{{ card.availabilityLabel }}</p>
              <p class="meta-line">{{ card.bookedThroughLabel }}</p>
              <p v-if="card.locationSummary" class="meta-line location-line">{{ card.locationSummary }}</p>
            </div>
          </div>

          <div class="week-columns">
            <div v-for="day in card.dayColumns" :key="`${card.providerId}-${day.key}`" class="day-col">
              <div class="day-head">{{ day.label }}</div>
              <div v-if="day.slots.length" class="day-slots">
                <div
                  v-for="slot in day.slots"
                  :key="slot.key"
                  class="time-pill"
                  :class="slot.modalityClass"
                  :title="slot.tooltip"
                >
                  <span class="pill-time">{{ slot.timeRange }}</span>
                  <span class="pill-tag">{{ slot.shortModality }}</span>
                </div>
              </div>
              <div v-else class="day-empty">-</div>
            </div>
          </div>

          <button class="book-rail" type="button" disabled title="Booking CTA will be wired next">
            Book
          </button>
        </div>
        <div class="card-foot">Click book to see the exact date</div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import api from '../services/api';

const CARD_SLOT_PREVIEW_LIMIT_PER_DAY = 6;
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat'
};

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const loading = ref(false);
const error = ref('');
const agencies = ref([]);
const cards = ref([]);
const selectedAgencyKey = ref('ALL');
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function providerName(p) {
  return `${p.last_name || ''}, ${p.first_name || ''}`.replace(/^,\s*/, '').trim();
}

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => (p[0] || '').toUpperCase()).join('') || 'PR';
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

function timeOnlyLabel(dateLike) {
  const d = toDate(dateLike);
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

function weekdayKey(dateLike) {
  const d = toDate(dateLike);
  if (!d) return null;
  return d.getDay();
}

function slotLocation(slot) {
  const office = String(slot?.buildingName || slot?.officeName || slot?.office_name || '').trim();
  const room = String(slot?.roomLabel || slot?.room_label || slot?.roomName || '').trim();
  if (office && room) return `${office} • ${room}`;
  return office || room || '';
}

function mapDisplaySlots(providerId, slots) {
  return (Array.isArray(slots) ? slots : []).map((slot, idx) => {
    const start = slot.startAt || slot.start_at;
    const end = slot.endAt || slot.end_at;
    const frequency = String(slot.frequency || 'WEEKLY').toUpperCase() === 'WEEKLY' ? 'weekly' : String(slot.frequency || '').toLowerCase();
    const startDay = weekdayKey(start);
    const endLabel = timeOnlyLabel(end);
    const startLabel = timeOnlyLabel(start);
    const location = slotLocation(slot);
    const modality = String(slot.modality || '').trim();
    return {
      key: `${providerId}-${idx}-${String(start || '')}-${String(end || '')}`,
      modality,
      modalityClass: slot.modalityClass,
      frequency,
      location,
      startAt: start,
      dayKey: startDay,
      timeRange: `${startLabel}${endLabel ? ` - ${endLabel}` : ''}`,
      shortModality: modality.toLowerCase().includes('virtual') ? 'VI' : 'IP',
      tooltip: `${toDateTimeLabel(start)}${endLabel ? ` - ${endLabel}` : ''}${location ? ` • ${location}` : ''}`
    };
  });
}

function buildDayColumns(displaySlots) {
  const byDay = new Map();
  for (const day of WEEKDAY_ORDER) byDay.set(day, []);
  for (const slot of Array.isArray(displaySlots) ? displaySlots : []) {
    if (!Number.isInteger(slot.dayKey)) continue;
    if (!byDay.has(slot.dayKey)) byDay.set(slot.dayKey, []);
    byDay.get(slot.dayKey).push(slot);
  }
  return WEEKDAY_ORDER.map((day) => {
    const slots = (byDay.get(day) || [])
      .sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')))
      .slice(0, CARD_SLOT_PREVIEW_LIMIT_PER_DAY);
    return {
      key: day,
      label: WEEKDAY_LABELS[day],
      slots
    };
  });
}

function buildCardFromSlots(provider, slots) {
  if (!slots?.length) return null;
  const sortedSlots = [...slots].sort((a, b) => String(a.startAt || a.start_at || '').localeCompare(String(b.startAt || b.start_at || '')));
  const firstSlot = sortedSlots[0];
  const firstStart = firstSlot.startAt || firstSlot.start_at;
  const firstDate = toDate(firstStart);
  const bookedThroughDate = firstDate ? addDaysYmd(firstDate.toISOString().slice(0, 10), -1) : null;
  const displaySlots = mapDisplaySlots(provider.id, sortedSlots);
  const locationSummary = Array.from(
    new Set(
      displaySlots
        .map((s) => String(s.location || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 2).join(' • ');

  return {
    providerId: Number(provider.id),
    providerName: providerName(provider),
    availabilityLabel: `Available this week (${sortedSlots.length} intake slot${sortedSlots.length === 1 ? '' : 's'})`,
    bookedThroughLabel: bookedThroughDate ? `Booked through: ${toDateLabel(bookedThroughDate)}` : 'Booked through: currently open this week',
    locationSummary,
    dayColumns: buildDayColumns(displaySlots)
  };
}

async function loadAgencies() {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin') {
    await agencyStore.fetchAgencies();
    agencies.value = (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
      .filter((a) => String(a?.organization_type || '').toLowerCase() === 'agency');
  } else {
    await agencyStore.fetchUserAgencies();
    agencies.value = (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [])
      .filter((a) => String(a?.organization_type || '').toLowerCase() === 'agency');
  }
  if (!agencies.value.length) {
    selectedAgencyKey.value = 'ALL';
    return;
  }
  if (
    selectedAgencyKey.value !== 'ALL' &&
    !agencies.value.some((a) => Number(a.id) === Number(selectedAgencyKey.value))
  ) {
    selectedAgencyKey.value = 'ALL';
  }
}

async function loadCards() {
  const selectedAgencyId = Number(selectedAgencyKey.value || 0) || null;
  const selectedAgencyIds = selectedAgencyKey.value === 'ALL'
    ? agencies.value.map((a) => Number(a.id)).filter((n) => Number.isFinite(n) && n > 0)
    : (selectedAgencyId ? [selectedAgencyId] : []);
  if (!selectedAgencyIds.length) {
    cards.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/availability/admin/intake-cards', {
      params: {
        ...(selectedAgencyIds.length === 1
          ? { agencyId: selectedAgencyIds[0] }
          : { agencyIds: selectedAgencyIds.join(',') }),
        weekStart: weekStart.value
      }
    });
    const providers = Array.isArray(data?.providers) ? data.providers : [];
    cards.value = providers
      .map((p) => {
        const merged = [
          ...(Array.isArray(p?.inPersonSlots) ? p.inPersonSlots.map((s) => ({ ...s, modality: 'In-person intake', modalityClass: 'modality-office' })) : []),
          ...(Array.isArray(p?.virtualSlots) ? p.virtualSlots.map((s) => ({ ...s, modality: 'Virtual intake', modalityClass: 'modality-virtual' })) : [])
        ].sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
        return buildCardFromSlots(
          { id: Number(p.providerId), first_name: p.firstName, last_name: p.lastName },
          merged
        );
      })
      .filter(Boolean);
  } catch (e) {
    console.error('Failed to load provider availability cards', e);
    error.value = e?.response?.data?.error?.message || 'Failed to load provider availability.';
    cards.value = [];
  } finally {
    loading.value = false;
  }
}

async function onAgencyChange() {
  await loadCards();
}

async function reloadAll() {
  loading.value = true;
  error.value = '';
  try {
    await loadAgencies();
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
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px;
  display: grid;
  gap: 16px;
  background: linear-gradient(180deg, #f2fbf7 0%, #eef4ff 100%);
  border-radius: 18px;
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
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 12px;
  padding: 14px;
  border: 1px solid #dbe7f5;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
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
  border: 1px solid #cfe0f2;
  border-radius: 10px;
  padding: 9px 11px;
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
  background: rgba(255, 255, 255, 0.8);
  border: 1px dashed #c6d6ea;
  border-radius: 12px;
  padding: 18px;
}

.cards {
  display: grid;
  gap: 14px;
}

.provider-card {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #d5e2f2;
  border-radius: 18px;
  padding: 14px;
  display: grid;
  gap: 8px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.provider-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 84px;
  align-items: stretch;
  gap: 14px;
}

.provider-identity {
  display: flex;
  gap: 12px;
  align-items: center;
}

.avatar-fallback {
  width: 78px;
  height: 78px;
  border-radius: 16px;
  background: linear-gradient(160deg, #3fd18f 0%, #66c2ff 100%);
  color: #fff;
  font-weight: 800;
  font-size: 26px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.identity-copy {
  min-width: 0;
}

.identity-copy h2 {
  margin: 0 0 5px;
  font-size: 34px;
  line-height: 1.05;
  color: #0f172a;
}

.meta-line {
  margin: 2px 0;
  font-size: 13px;
  color: #334155;
}

.location-line {
  font-weight: 600;
  color: #0f766e;
}

.week-columns {
  border: 1px solid #d6e0ed;
  border-radius: 14px;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.day-col {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid #e2e8f0;
  min-height: 130px;
  padding: 7px 6px;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 7px;
}

.day-head {
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  text-transform: lowercase;
}

.day-slots {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.day-empty {
  display: grid;
  place-items: center;
  color: #94a3b8;
  font-size: 18px;
}

.time-pill {
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 4px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.pill-time {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}

.pill-tag {
  font-size: 10px;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 6px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(15, 23, 42, 0.12);
}

.modality-office {
  background: #dbf6e7;
  border-color: #7bdca8;
}

.modality-virtual {
  background: #ebe8ff;
  border-color: #c6b8ff;
}

.book-rail {
  border: 0;
  border-radius: 14px;
  background: linear-gradient(180deg, #28cf83 0%, #23b86f 100%);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.02em;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
  cursor: not-allowed;
  opacity: 0.82;
}

.card-foot {
  text-align: center;
  color: #64748b;
  font-size: 12px;
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

@media (max-width: 960px) {
  .filters {
    grid-template-columns: 1fr 1fr;
  }

  .field-wide {
    grid-column: span 2;
  }
  .provider-layout {
    grid-template-columns: 1fr;
  }
  .provider-identity {
    align-items: flex-start;
  }
  .week-columns {
    overflow-x: auto;
  }
  .book-rail {
    writing-mode: horizontal-tb;
    transform: none;
    min-height: 40px;
    opacity: 1;
  }
}

@media (max-width: 680px) {
  .filters {
    grid-template-columns: 1fr;
  }

  .field-wide {
    grid-column: span 1;
  }
  .identity-copy h2 {
    font-size: 28px;
  }
  .week-columns {
    grid-template-columns: repeat(3, minmax(120px, 1fr));
  }
}
</style>
