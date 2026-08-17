<template>
  <section class="cpd" :class="[`cpd--${mode}`]">
    <header v-if="showHeader" class="cpd-header">
      <h2 class="cpd-title">{{ title }}</h2>
      <p v-if="lead" class="cpd-lead">{{ lead }}</p>
    </header>

    <div class="cpd-toolbar">
      <input
        v-model="search"
        type="search"
        class="cpd-search"
        :placeholder="searchPlaceholder"
        aria-label="Search providers"
      />
      <select v-model="sortKey" class="cpd-sort" aria-label="Sort providers">
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

        <p v-if="p.nextAvailable" class="cpd-meta">
          First available: <strong>{{ p.nextAvailable }}</strong>
        </p>
        <p v-if="p.openSlots" class="cpd-meta">{{ p.openSlots }} open office slot{{ p.openSlots === 1 ? '' : 's' }}</p>
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

const props = defineProps({
  mode: { type: String, default: 'public' }, // public | join | intake
  title: { type: String, default: 'Choose a provider' },
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
      'First come first served; a slot is not held. Expect a callback in 24–48 hours from support and/or the provider. Goodness of fit still applies.'
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
const sortKey = ref('openSlots');
const rankMode = ref(false);

watch(
  () => props.mode,
  (m) => {
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
  if (q) {
    rows = rows.filter((p) => {
      const blob = [p.name, p.displayName, p.credential, p.title, p.credentials]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return blob.includes(q);
    });
  }
  rows.sort((a, b) => {
    if (sortKey.value === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
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
  const id = String(p.id);
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
</style>
