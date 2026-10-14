<template>
  <section class="cpd" :class="[`cpd--${mode}`]">
    <header v-if="showHeader" class="cpd-header">
      <h2 class="cpd-title">{{ title }}</h2>
      <p v-if="lead" class="cpd-lead">{{ lead }}</p>
    </header>

    <p v-if="mode === 'intake'" class="cpd-intake-note">{{ preferenceDisclaimer }}</p>
    <p v-if="mode === 'intake'" class="cpd-selection-count" role="status">Choose up to three provider preferences · {{ selectedCount }} selected<span v-if="atSelectionLimit">. Remove a preference to choose someone else.</span></p>
    <button
      v-if="mode === 'intake' && allowSkip"
      type="button"
      class="cpd-btn cpd-btn-secondary cpd-skip-top"
      @click="skipSelection"
    >Skip provider choice — let our team help</button>

    <div class="cpd-toolbar">
      <input
        v-model="search"
        type="search"
        class="cpd-search"
        :placeholder="searchPlaceholder"
        aria-label="Search providers"
      />
      <select v-model="sortKey" class="cpd-sort" aria-label="Sort providers">
        <option v-if="mode === 'intake'" value="bestFit">Best fit</option>
        <option value="openSlots">Openings first</option>
        <option value="name">Name A–Z</option>
        <option value="waitlist">Waitlist size</option>
      </select>
      <label v-if="mode === 'intake'" class="cpd-rank-toggle">
        <input v-model="rankMode" type="checkbox" />
        Choose and rank my top 3
      </label>
    </div>

    <p v-if="loading" class="cpd-muted">Loading providers…</p>
    <p v-else-if="error" class="cpd-error">{{ error }}</p>
    <p v-else-if="!filtered.length" class="cpd-muted">No providers match your search right now.</p>

    <div v-else-if="mode === 'intake'" class="cpd-compact-list">
      <article v-for="p in filtered" :key="p.id" class="cpd-compact-row" :class="{ 'cpd-card--selected': isSelected(p.id) }" :data-provider-id="p.id">
        <img v-if="providerPhoto(p) && !photoFailures[p.id]" class="cpd-avatar" :src="providerPhoto(p)" alt="" loading="lazy" @error="photoFailures[p.id] = true" />
        <span v-else class="cpd-avatar cpd-avatar-fallback" aria-hidden="true">{{ providerInitials(p) }}</span>
        <div class="cpd-compact-summary">
          <div class="cpd-compact-name"><h3 class="cpd-name">{{ p.displayName || p.name }}</h3><span class="cpd-badge" :class="isWaitlist(p) ? 'cpd-badge--wait' : 'cpd-badge--open'">{{ isWaitlist(p) ? 'Waitlist' : 'Open' }}</span></div>
          <p v-if="p.credential || p.title || p.credentials" class="cpd-meta">{{ p.credential || p.title || p.credentials }}</p>
          <p v-if="providerSessionFormats(p, modality).length" class="cpd-meta">{{ providerSessionFormats(p, modality).join(' · ') }}</p>
          <p v-if="providerHighlights(p).length" class="cpd-compact-focus">{{ providerHighlights(p).join(' · ') }}</p>
        </div>
        <div class="cpd-compact-actions">
          <button type="button" class="cpd-btn cpd-btn-secondary cpd-view-profile" :aria-label="`View ${p.displayName || p.name}’s profile`" @click="profileProvider = p">View profile</button>
          <button type="button" class="cpd-btn cpd-select-provider" :class="isSelected(p.id) ? 'cpd-btn-primary' : 'cpd-btn-secondary'" :aria-pressed="isSelected(p.id)" :disabled="atSelectionLimit && !isSelected(p.id)" :aria-label="`${isSelected(p.id) ? 'Remove' : 'Select'} ${p.displayName || p.name}${isWaitlist(p) ? ' waitlist preference' : ' preference'}`" @click="toggleMulti(p)">
            {{ rankMode && rankOf(p.id) ? `#${rankOf(p.id)} Selected` : isSelected(p.id) ? 'Selected ✓' : isWaitlist(p) ? 'Choose waitlist' : 'Prefer provider' }}
          </button>
        </div>
      </article>
    </div>

    <div v-else class="cpd-grid">
      <article
        v-for="p in filtered"
        :key="p.id"
        class="cpd-card"
        :class="{
          'cpd-card--selected': isSelected(p.id),
          'cpd-card--waitlist': p.waitlist
        }"
      >
        <div class="cpd-card-top">
          <div>
            <h3 class="cpd-name">{{ p.displayName || p.name }}</h3>
            <p v-if="p.credential || p.title || p.credentials" class="cpd-meta">
              {{ p.credential || p.title || p.credentials }}
            </p>
          </div>
          <span class="cpd-badge" :class="p.waitlist ? 'cpd-badge--wait' : 'cpd-badge--open'">
            {{ p.waitlist ? 'Waitlist' : 'Accepting' }}
          </span>
        </div>

        <p v-if="p.tutoringProfile" class="cpd-meta">{{p.tutoringProfile.hourlyRateCents!=null?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(p.tutoringProfile.hourlyRateCents/100)+' / hour':'Contact us for pricing'}} · Grades {{p.tutoringProfile.gradeLevels?.join(', ')}}</p><p v-if="p.availability?.nextAvailableAt" class="cpd-meta">Next opening: {{new Date(p.availability.nextAvailableAt).toLocaleString()}}</p><p v-if="p.nextAvailable" class="cpd-meta">
          First available: <strong>{{ p.nextAvailable }}</strong>
        </p>
        <p v-if="p.openSlots" class="cpd-meta">
          {{ p.openSlots }} open slot{{ p.openSlots === 1 ? '' : 's' }}
          <template v-if="p.openOfficeSlots || p.openVirtualSlots">
            ({{ [
              p.openOfficeSlots ? `${p.openOfficeSlots} office` : null,
              p.openVirtualSlots ? `${p.openVirtualSlots} virtual` : null
            ].filter(Boolean).join(' · ') }})
          </template>
        </p>
        <p v-if="p.waitlistCount" class="cpd-meta">{{ p.waitlistCount }} on their office waitlist</p>

        <ul v-if="p.slots?.length" class="cpd-slots">
          <li v-for="(slot, idx) in p.slots.slice(0, 4)" :key="`${p.id}-${idx}`">
            {{ slot.weekdayLabel }} {{ slot.hourLabel }}
            <span v-if="slot.frequency" class="cpd-freq">· {{ formatFreq(slot.frequency) }}</span>
          </li>
        </ul>

        <a
          v-if="psychologyTodayHref(p.psychologyTodayUrl)"
          class="cpd-pt"
          :href="psychologyTodayHref(p.psychologyTodayUrl)"
          target="_blank"
          rel="noopener noreferrer"
        >
          Psychology Today profile
        </a>

        <p class="cpd-disclaimer">{{ preferenceDisclaimer }}</p>

        <div class="cpd-actions">
          <template v-if="mode === 'public'">
            <button
              v-if="!p.waitlist"
              type="button"
              class="cpd-btn cpd-btn-primary"
              @click="emitPrefer(p)"
            >
              Prefer this provider
            </button>
            <button
              type="button"
              class="cpd-btn cpd-btn-secondary"
              @click="emitWaitlist(p)"
            >
              Add me to their waitlist
            </button>
          </template>

          <template v-else-if="mode === 'join'">
            <button
              type="button"
              class="cpd-btn"
              :class="isSelected(p.id) ? 'cpd-btn-primary' : 'cpd-btn-secondary'"
              @click="selectSingle(p)"
            >
              {{ isSelected(p.id) ? 'Preferred ✓' : 'Choose' }}
            </button>
          </template>

          <template v-else>
            <button
              type="button"
              class="cpd-btn"
              :class="isSelected(p.id) ? 'cpd-btn-primary' : 'cpd-btn-secondary'"
              @click="toggleMulti(p)"
            >
              <span v-if="rankMode && rankOf(p.id)">#{{ rankOf(p.id) }}</span>
              <span v-else>{{ isSelected(p.id) ? 'Selected ✓' : 'Select' }}</span>
            </button>
          </template>
        </div>
      </article>
    </div>

    <EnrollmentProviderDetailsDialog
      v-if="profileProvider && mode === 'intake'"
      :provider="profileProvider"
      :agency-slug="agencySlug"
      :service-type="serviceType"
      :modality="modality"
      :selected="isSelected(profileProvider.id)"
      :selection-disabled="atSelectionLimit && !isSelected(profileProvider.id)"
      :disclaimer="preferenceDisclaimer"
      @close="profileProvider = null"
      @select="toggleMulti(profileProvider); profileProvider = null"
    />

    <button
      v-if="mode === 'join' && allowSkip"
      type="button"
      class="cpd-btn cpd-btn-secondary cpd-skip"
      @click="$emit('skip')"
    >
      Let the team choose / first available
    </button>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { psychologyTodayHref } from '../../utils/psychologyTodayUrl.js';
import { publishedFocus } from '../../navigation/providerFocus.js';
import EnrollmentProviderDetailsDialog from './EnrollmentProviderDetailsDialog.vue';
import { intakeProviderStatus, providerInitials, providerPhoto, providerSessionFormats } from './intakeProviderPresentation.js';

const props = defineProps({
  mode: { type: String, default: 'public' }, // public | join | intake
  title: { type: String, default: 'Choose a provider' },
  agencySlug: { type: String, default: '' },
  serviceType: { type: String, default: 'counseling' },
  modality: { type: String, default: 'ALL' },
  lead: {
    type: String,
    default:
      'Browse providers by openings and fit. Selecting someone is a preference — not a held appointment.'
  },
  showHeader: { type: Boolean, default: true },
  providers: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  selectedIds: { type: Array, default: () => [] },
  selectedId: { type: [Number, String, null], default: null },
  allowSkip: { type: Boolean, default: true },
  searchPlaceholder: { type: String, default: 'Search by name or credential…' },
  preferenceDisclaimer: {
    type: String,
    default:
      'Selecting a provider is optional and does not guarantee placement or book an appointment. Our support team or a care coordinator will reach out to review your preferences and coordinate care. Choosing a waitlisted provider requests their waitlist when you submit enrollment.'
  }
});

const emit = defineEmits([
  'update:selectedIds',
  'update:selectedId',
  'prefer',
  'waitlist',
  'skip',
  'rank-change'
]);

const search = ref('');
const sortKey = ref(props.mode === 'intake' ? 'bestFit' : 'openSlots');
const rankMode = ref(false);
const profileProvider = ref(null);
const photoFailures = ref({});
const selectedCount = computed(() => new Set((props.selectedIds || []).map(String)).size);
const atSelectionLimit = computed(() => props.mode === 'intake' && selectedCount.value >= 3);

function isWaitlist(provider) { return intakeProviderStatus(provider, props.modality) === 'waitlist'; }
function providerHighlights(provider) {
  const focus = provider.clinicalFocus || provider.details?.clinicalFocus || provider.profile?.details?.clinicalFocus;
  const specialties = provider.tutoringProfile?.subjectAreas || provider.specialties || [];
  return publishedFocus('specialties', focus, Array.isArray(specialties) ? specialties : []).top.slice(0, 3);
}
function skipSelection() {
  emit('skip');
}

watch(
  () => props.mode,
  (m) => {
    sortKey.value = m === 'intake' ? 'bestFit' : 'openSlots';
    if (m !== 'intake') rankMode.value = false;
  }
);

function formatFreq(raw) {
  return String(raw || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isSelected(id) {
  if (props.mode === 'join') return Number(props.selectedId) === Number(id);
  return (props.selectedIds || []).map(String).includes(String(id));
}

function rankOf(id) {
  const idx = (props.selectedIds || []).map(String).indexOf(String(id));
  return idx >= 0 ? idx + 1 : 0;
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  let rows = [...(props.providers || [])];
  if (props.mode === 'intake') rows = rows.filter(p => intakeProviderStatus(p, props.modality) !== 'closed');
  if (q) {
    rows = rows.filter((p) => {
      const blob = [p.name, p.displayName, p.credential, p.title, p.credentials, ...providerHighlights(p)]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return blob.includes(q);
    });
  }
  rows.sort((a, b) => {
    if (props.mode === 'intake' && isWaitlist(a) !== isWaitlist(b)) return isWaitlist(a) ? 1 : -1;
    if (sortKey.value === 'bestFit') return 0;
    if (sortKey.value === 'name') return String(a.displayName || a.name || '').localeCompare(String(b.displayName || b.name || ''));
    if (sortKey.value === 'waitlist') return (b.waitlistCount || 0) - (a.waitlistCount || 0);
    if (a.waitlist !== b.waitlist) return a.waitlist ? 1 : -1;
    return (b.openSlots || 0) - (a.openSlots || 0);
  });
  return rows;
});

function selectSingle(p) {
  emit('update:selectedId', p.id);
}

function toggleMulti(p) {
  if (!p || (props.mode === 'intake' && intakeProviderStatus(p, props.modality) === 'closed')) return;
  const id = String(p.id);
  if (atSelectionLimit.value && !isSelected(id)) return;
  let next = [...(props.selectedIds || []).map(String)];
  if (rankMode.value) {
    if (next.includes(id)) {
      next = next.filter((x) => x !== id);
    } else if (next.length >= 3) {
      next = [...next.slice(0, 2), id];
    } else {
      next.push(id);
    }
  } else if (next.includes(id)) {
    next = next.filter((x) => x !== id);
  } else {
    next.push(id);
  }
  emit('update:selectedIds', next);
  emit('rank-change', next);
}

function emitPrefer(p) {
  emit('prefer', p);
}

function emitWaitlist(p) {
  emit('waitlist', p);
}
</script>

<style scoped>
.cpd {
  font-family: 'Montserrat', system-ui, -apple-system, sans-serif;
  color: #1f2937;
}
.cpd-header { margin-bottom: 1rem; }
.cpd-title {
  margin: 0 0 0.35rem;
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.cpd-lead { margin: 0; color: #4b5563; font-size: 0.95rem; line-height: 1.45; }
.cpd-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  margin-bottom: 1rem;
}
.cpd-search, .cpd-sort {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  font: inherit;
  background: #fff;
}
.cpd-search { flex: 1 1 220px; min-width: 180px; }
.cpd-rank-toggle {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  font-size: 0.85rem;
  color: #374151;
}
.cpd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.85rem;
}
.cpd-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 0.9rem 1rem;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cpd-card--selected {
  border-color: #0f766e;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.15);
}
.cpd-card--waitlist { background: #fafafa; }
.cpd-card-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: flex-start;
}
.cpd-name { margin: 0; font-size: 1.05rem; font-weight: 700; }
.cpd-meta { margin: 0; font-size: 0.82rem; color: #6b7280; }
.cpd-badge {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
}
.cpd-badge--open { background: #ecfdf5; color: #065f46; }
.cpd-badge--wait { background: #f3f4f6; color: #4b5563; }
.cpd-slots {
  margin: 0.25rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  color: #374151;
}
.cpd-freq { color: #6b7280; }
.cpd-pt {
  font-size: 0.82rem;
  color: #0f766e;
  font-weight: 600;
  text-decoration: none;
}
.cpd-pt:hover { text-decoration: underline; }
.cpd-disclaimer {
  margin: 0.25rem 0 0;
  font-size: 0.72rem;
  color: #9ca3af;
  line-height: 1.35;
}
.cpd-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.45rem;
}
.cpd-btn {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.4rem 0.7rem;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  background: #fff;
  color: #111827;
}
.cpd-btn-primary {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.cpd-btn-secondary { background: #f9fafb; }
.cpd-skip { margin-top: 1rem; }
.cpd-muted { color: #6b7280; }
.cpd-error { color: #b91c1c; }
.cpd-intake-note { margin: 0 0 0.8rem; max-width: 78ch; color: #425766; font-size: 0.88rem; line-height: 1.6; }
.cpd-skip-top { margin-bottom: 1rem; }
.cpd-selection-count { color: #425766; font-size: 0.85rem; margin: 0 0 0.8rem; }
.cpd-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.cpd-compact-list { display: grid; gap: 0.6rem; }
.cpd-compact-row { display: flex; align-items: center; gap: 0.85rem; border: 1px solid #dce6e1; border-radius: 12px; padding: 0.9rem; background: #fff; }
.cpd-avatar { width: 58px; height: 58px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.cpd-avatar-fallback { display: grid; place-items: center; background: #e8f2ee; color: #235749; font-size: 1.1rem; font-weight: 700; }
.cpd-compact-summary { flex: 1; min-width: 0; display: grid; gap: 0.25rem; }
.cpd-compact-name { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.cpd-compact-focus { margin: 0; color: #33594d; font-size: 0.82rem; line-height: 1.45; }
.cpd-compact-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
.cpd--intake .cpd-btn { min-height: 40px; }
.cpd--intake .cpd-sort { max-width: 190px; }
.cpd :focus-visible { outline: 3px solid #218970; outline-offset: 3px; }
@media (max-width: 650px) {
  .cpd-compact-row { flex-wrap: wrap; align-items: flex-start; }
  .cpd-compact-actions { width: 100%; justify-content: flex-start; }
  .cpd-avatar { width: 46px; height: 46px; }
  .cpd-search { min-width: 0; width: 100%; }
}
</style>
