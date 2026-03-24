<template>
  <div class="sbes-directory" :class="{ 'sbes-directory--page': variant === 'page' }">
    <div v-if="variant === 'modal'" class="sbes-header">
      <div>
        <h2 id="sbes-title" class="sbes-title">Skill Builders events</h2>
        <p class="sbes-sub">Open an event portal by school or browse all program events.</p>
      </div>
      <button v-if="showClose" type="button" class="sbes-close" aria-label="Close" @click="$emit('close')">
        ×
      </button>
    </div>

    <div class="sbes-mode" role="tablist">
      <button
        type="button"
        role="tab"
        :class="['sbes-mode-btn', { active: mode === 'school' }]"
        :aria-selected="mode === 'school'"
        @click="mode = 'school'"
      >
        School
      </button>
      <button
        type="button"
        role="tab"
        :class="['sbes-mode-btn', { active: mode === 'all' }]"
        :aria-selected="mode === 'all'"
        @click="mode = 'all'"
      >
        All
      </button>
    </div>

    <div v-if="loading" class="sbes-muted" style="padding: 16px;">Loading…</div>
    <div v-else-if="error" class="sbes-error" style="padding: 16px;">{{ error }}</div>
    <div v-else-if="!events.length" class="sbes-muted" style="padding: 16px;">No Skill Builders events found for this agency.</div>

    <div v-else class="sbes-body">
      <div v-show="mode === 'school'" class="sbes-school-panel">
        <label class="sbes-label" for="sbes-school-select">Select an event</label>
        <select id="sbes-school-select" v-model.number="selectedEventId" class="input sbes-select">
          <option :value="0" disabled>Choose…</option>
          <option v-for="e in schoolSelectOptions" :key="`opt-${e.companyEventId}`" :value="e.companyEventId">
            {{ schoolOptionLabel(e) }}
          </option>
        </select>
        <button
          type="button"
          class="btn btn-primary btn-sm sbes-go"
          :disabled="!selectedEventId"
          @click="openPortalFromSelect()"
        >
          Open event portal
        </button>
      </div>

      <div v-show="mode === 'all'" class="sbes-all-panel">
        <div class="sbes-controls">
          <div class="sbes-control">
            <label class="sbes-label">Search</label>
            <input v-model.trim="searchQuery" type="search" class="input" placeholder="Event, school, provider…" />
          </div>
          <div class="sbes-control">
            <label class="sbes-label">Sort</label>
            <select v-model="sortBy" class="input">
              <option value="school-asc">School (A–Z)</option>
              <option value="start-desc">Start date (newest)</option>
              <option value="start-asc">Start date (oldest)</option>
              <option value="title-asc">Event title (A–Z)</option>
            </select>
          </div>
        </div>

        <section v-if="upcomingFiltered.length" class="sbes-section">
          <h3 class="sbes-section-title">Current &amp; upcoming</h3>
          <div class="sbes-cards-grid">
            <button
              v-for="e in upcomingFiltered"
              :key="`up-${e.companyEventId}`"
              type="button"
              class="sbes-card"
              @click="openPortal(e)"
            >
              <div class="sbes-card-logo">
                <img
                  v-if="logoUrl(e) && !failedLogos.has(String(e.schoolOrganizationId))"
                  :src="logoUrl(e)"
                  :alt="''"
                  class="sbes-card-logo-img"
                  @error="onLogoError(e.schoolOrganizationId)"
                />
                <div v-else class="sbes-card-logo-fallback">{{ schoolInitials(e.schoolName) }}</div>
              </div>
              <div class="sbes-card-body">
                <div class="sbes-card-name">{{ e.title }}</div>
                <div class="sbes-card-type">School · {{ e.schoolName }}</div>
                <div class="sbes-card-meta">{{ formatDateRange(e.startsAt, e.endsAt) }}</div>
                <div class="sbes-card-meta"><strong>Days</strong> {{ e.weekdaysShort }}</div>
                <div class="sbes-card-providers"><strong>Providers</strong> {{ providerLine(e) }}</div>
              </div>
              <div class="sbes-card-cta">Open portal</div>
            </button>
          </div>
        </section>

        <section v-if="pastFiltered.length" class="sbes-section sbes-past-section">
          <h3 class="sbes-section-title sbes-past-title">
            Past events
            <span class="sbes-past-hint">— archived, still accessible</span>
          </h3>
          <div class="sbes-cards-grid sbes-cards-past">
            <button
              v-for="e in pastFiltered"
              :key="`past-${e.companyEventId}`"
              type="button"
              class="sbes-card sbes-card-past"
              @click="openPortal(e)"
            >
              <div class="sbes-card-logo">
                <div class="sbes-card-logo-fallback">{{ schoolInitials(e.schoolName) }}</div>
              </div>
              <div class="sbes-card-body">
                <div class="sbes-card-name">{{ e.title }}</div>
                <div class="sbes-card-type">{{ e.schoolName }}</div>
                <div class="sbes-card-meta">{{ formatDateRange(e.startsAt, e.endsAt) }}</div>
                <div class="sbes-card-meta">{{ e.weekdaysShort }}</div>
                <div class="sbes-card-providers">{{ providerLine(e) }}</div>
              </div>
              <div class="sbes-card-cta">View</div>
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  agencyId: { type: Number, required: true },
  /** When set (e.g. agency picker on admin page), portal links use this slug before route/store. */
  portalSlug: { type: String, default: '' },
  /** 'modal' shows title row; 'page' is embedded on a full page (parent supplies page title). */
  variant: { type: String, default: 'modal' },
  showClose: { type: Boolean, default: false }
});

defineEmits(['close']);

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();

const mode = ref('school');
const loading = ref(false);
const error = ref('');
const events = ref([]);
const selectedEventId = ref(0);
const searchQuery = ref('');
const sortBy = ref('school-asc');
const failedLogos = ref(new Set());

function orgSlug() {
  const fromProp = String(props.portalSlug || '').trim();
  if (fromProp) return fromProp;
  return (
    String(route.params?.organizationSlug || '').trim() ||
    String(agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || '').trim()
  );
}

function openPortal(eventOrId) {
  let id;
  let slugFromEvent = '';
  if (eventOrId && typeof eventOrId === 'object' && eventOrId.companyEventId != null) {
    id = Number(eventOrId.companyEventId);
    slugFromEvent = String(eventOrId.programPortalSlug || '').trim().toLowerCase();
  } else {
    id = Number(eventOrId);
    const ev = (events.value || []).find((x) => Number(x.companyEventId) === id);
    if (ev) slugFromEvent = String(ev.programPortalSlug || '').trim().toLowerCase();
  }
  const slug = slugFromEvent || orgSlug();
  if (!slug || !Number.isFinite(id) || id <= 0) return;
  router.push(`/${slug}/skill-builders/event/${id}`);
}

function openPortalFromSelect() {
  openPortal(selectedEventId.value);
}

function onLogoError(schoolOrganizationId) {
  const k = String(schoolOrganizationId || '');
  failedLogos.value = new Set([...failedLogos.value, k]);
}

function formatDateRange(startsAt, endsAt) {
  const a = new Date(startsAt || 0);
  const b = new Date(endsAt || 0);
  if (!Number.isFinite(a.getTime())) return '';
  const dOpt = { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    const left = a.toLocaleDateString(undefined, dOpt);
    const right = Number.isFinite(b.getTime()) ? b.toLocaleDateString(undefined, dOpt) : '';
    return right ? `${left} – ${right}` : left;
  } catch {
    return '';
  }
}

function schoolOptionLabel(e) {
  const range = formatDateRange(e.startsAt, e.endsAt);
  return `${e.schoolName} — ${e.title}${range ? ` · ${range}` : ''}`;
}

function schoolInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'SB';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function logoUrl(e) {
  const raw = String(e.schoolLogoUrl || e.schoolLogoPath || '').trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return toUploadsUrl(raw);
}

function providerLine(e) {
  const list = e.providers || [];
  if (!list.length) return '—';
  return list.map((p) => `${p.firstName || ''} ${p.lastName || ''}`.trim()).join(', ');
}

const schoolSelectOptions = computed(() => {
  const list = [...(events.value || [])];
  list.sort((a, b) => {
    const s = String(a.schoolName || '').localeCompare(String(b.schoolName || ''), undefined, { sensitivity: 'base' });
    if (s !== 0) return s;
    return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
  });
  return list;
});

const filteredEvents = computed(() => {
  const q = String(searchQuery.value || '').trim().toLowerCase();
  let list = [...(events.value || [])];
  if (q) {
    list = list.filter((e) => {
      const blob = [
        e.title,
        e.schoolName,
        e.skillsGroupName,
        ...(e.providers || []).map((p) => `${p.firstName} ${p.lastName}`)
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }
  const sb = sortBy.value;
  list.sort((a, b) => {
    if (sb === 'school-asc') {
      const c = String(a.schoolName || '').localeCompare(String(b.schoolName || ''), undefined, { sensitivity: 'base' });
      return c !== 0 ? c : String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    }
    if (sb === 'title-asc') {
      return String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    }
    const ta = new Date(a.startsAt || 0).getTime();
    const tb = new Date(b.startsAt || 0).getTime();
    if (sb === 'start-desc') return tb - ta;
    return ta - tb;
  });
  return list;
});

const upcomingFiltered = computed(() => filteredEvents.value.filter((e) => !e.isPast));
const pastFiltered = computed(() => filteredEvents.value.filter((e) => e.isPast));

async function load() {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/skill-builders/events/directory', {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    events.value = Array.isArray(res.data?.events) ? res.data.events : [];
    selectedEventId.value = 0;
    failedLogos.value = new Set();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load';
    events.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.agencyId,
  () => load(),
  { immediate: true }
);
</script>

<style scoped>
.sbes-directory {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.sbes-directory--page {
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}
.sbes-directory--page .sbes-body {
  padding-left: 0;
  padding-right: 0;
}
.sbes-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.sbes-title {
  margin: 0;
  font-size: 1.35rem;
  color: var(--primary, #15803d);
}
.sbes-sub {
  margin: 6px 0 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #64748b);
}
.sbes-close {
  border: none;
  background: transparent;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
}
.sbes-mode {
  display: flex;
  gap: 8px;
  padding: 10px 18px 0;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.sbes-directory--page .sbes-mode {
  padding-left: 0;
  padding-right: 0;
}
.sbes-mode-btn {
  border: none;
  background: transparent;
  padding: 10px 14px;
  font-size: 0.9rem;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.sbes-mode-btn.active {
  color: var(--primary, #15803d);
  font-weight: 600;
  border-bottom-color: var(--primary, #15803d);
}
.sbes-body {
  padding: 14px 18px 18px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.sbes-school-panel {
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sbes-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
}
.sbes-select {
  max-width: 100%;
}
.sbes-go {
  align-self: flex-start;
}
.sbes-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin-bottom: 16px;
  align-items: flex-end;
}
.sbes-control {
  flex: 1 1 200px;
  min-width: 0;
}
.sbes-section {
  margin-top: 8px;
}
.sbes-section-title {
  margin: 0 0 10px;
  font-size: 1rem;
}
.sbes-past-section {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px dashed var(--border, #e2e8f0);
}
.sbes-past-title {
  color: var(--text-secondary, #64748b);
  font-weight: 600;
}
.sbes-past-hint {
  font-weight: 400;
  font-size: 0.85rem;
}
.sbes-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.sbes-card {
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 10px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.sbes-card:hover {
  border-color: var(--primary, #15803d);
  box-shadow: var(--shadow, 0 4px 12px rgba(0, 0, 0, 0.08));
}
.sbes-card-past {
  opacity: 0.72;
  background: #f8fafc;
}
.sbes-card-past:hover {
  opacity: 0.9;
}
.sbes-card-logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--bg-alt, #f1f5f9);
  border: 1px solid var(--border, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.sbes-card-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sbes-card-logo-fallback {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary, #64748b);
}
.sbes-card-body {
  min-width: 0;
}
.sbes-card-name {
  font-weight: 600;
  color: var(--primary, #15803d);
  line-height: 1.25;
}
.sbes-card-type {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
  margin-top: 2px;
}
.sbes-card-meta,
.sbes-card-providers {
  font-size: 0.8rem;
  color: var(--text-secondary, #475569);
  margin-top: 4px;
  line-height: 1.35;
}
.sbes-card-cta {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary, #15803d);
  white-space: nowrap;
}
.sbes-muted {
  color: var(--text-secondary, #64748b);
}
.sbes-error {
  color: #b91c1c;
}
</style>
