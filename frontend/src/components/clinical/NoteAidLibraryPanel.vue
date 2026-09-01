<template>
  <div class="nal">
    <aside class="nal-nav">
      <h2 class="nal-nav-title">Note Aid Library</h2>
      <nav class="nal-cats" aria-label="Aid families">
        <button
          type="button"
          class="nal-cat tone-goals"
          :class="{ active: clientRail === 'goals' }"
          @click="setClientRail('goals')"
        >
          <span class="nal-cat-icon" aria-hidden="true">◎</span>
          <span>Treatment Goals</span>
        </button>
        <button
          type="button"
          class="nal-cat tone-intake"
          :class="{ active: clientRail === 'intake' }"
          @click="setClientRail('intake')"
        >
          <span class="nal-cat-icon" aria-hidden="true">☰</span>
          <span>Intake</span>
        </button>
        <button
          v-for="cat in categories"
          :key="cat.id"
          type="button"
          class="nal-cat"
          :class="[`tone-${tone(cat.id)}`, { active: navCategory === cat.id && !clientRail }]"
          @click="pickCategory(cat.id)"
        >
          <span class="nal-cat-icon" aria-hidden="true">{{ catIcon(cat.id) }}</span>
          <span>{{ cat.label }}</span>
        </button>
      </nav>

      <section class="nal-block">
        <h3>Recently used</h3>
        <ul v-if="recentAids.length" class="nal-mini-list">
          <li v-for="aid in recentAids" :key="`r-${aid.id}`">
            <button type="button" class="nal-mini-btn" @click="pick(aid)">
              <span class="nal-clock" aria-hidden="true">⏱</span>
              {{ shortLabel(aid.label) }}
            </button>
          </li>
        </ul>
        <p v-else class="nal-empty">Aids you open will show up here.</p>
      </section>

      <section class="nal-block">
        <h3>Favorites</h3>
        <ul v-if="favoriteAids.length" class="nal-mini-list">
          <li v-for="aid in favoriteAids" :key="`f-${aid.id}`">
            <button type="button" class="nal-mini-btn" @click="pick(aid)">
              <span class="nal-star" aria-hidden="true">★</span>
              {{ shortLabel(aid.label) }}
            </button>
          </li>
        </ul>
        <p v-else class="nal-empty">Star an aid to pin it here.</p>
      </section>

      <section class="nal-block nal-filters">
        <h3>Filters</h3>
        <label>
          Service code
          <select v-model="filterCode">
            <option value="">All codes</option>
            <option v-for="code in codeOptions" :key="code" :value="code">{{ code }}</option>
          </select>
        </label>
        <label>
          Note type
          <select v-model="filterKind">
            <option v-for="k in kindFilters" :key="k.id" :value="k.id">{{ k.label }}</option>
          </select>
        </label>
        <label>
          Setting
          <select v-model="filterSetting">
            <option value="">All settings</option>
            <option value="individual">Individual</option>
            <option value="family">Family</option>
            <option value="group">Group / program</option>
          </select>
        </label>
        <button v-if="filtersDirty" type="button" class="nal-reset" @click="resetFilters">Clear filters</button>
      </section>
    </aside>

    <div class="nal-main">
      <slot name="before" />
      <header class="nal-head">
        <h1>Select a tool to get started</h1>
        <p>Same Gemini gems as before — pick a card, then stay in that aid to add transcript and generate.</p>
      </header>

      <div class="nal-pills" role="tablist" aria-label="Quick filters">
        <button
          v-for="pill in kindFilters"
          :key="`p-${pill.id}`"
          type="button"
          class="nal-pill"
          :class="[`kind-${pill.id}`, { active: filterKind === pill.id }]"
          @click="filterKind = pill.id"
        >
          {{ pill.label }}
        </button>
      </div>

      <section
        v-for="cat in visibleCategories"
        :key="cat.id"
        class="nal-section"
        :class="`tone-${tone(cat.id)}`"
      >
        <button type="button" class="nal-section-head" @click="toggleSection(cat.id)">
          <span class="nal-section-icon" aria-hidden="true">{{ catIcon(cat.id) }}</span>
          <strong>{{ cat.label }}</strong>
          <span class="nal-count">{{ cat.aids.length }}</span>
          <span class="nal-chevron" :class="{ open: !collapsed[cat.id] }">▾</span>
        </button>
        <div v-show="!collapsed[cat.id]" class="nal-cards">
          <article
            v-for="aid in cat.aids"
            :key="aid.id"
            class="nal-card"
          >
            <button type="button" class="nal-card-main" @click="pick(aid)">
              <span class="nal-doc" aria-hidden="true">📄</span>
              <span class="nal-card-copy">
                <strong>{{ aid.label }}</strong>
                <small v-if="aidServiceCodeLabel(aid)">{{ aidServiceCodeLabel(aid) }}</small>
              </span>
            </button>
            <button
              type="button"
              class="nal-fav"
              :class="{ on: isFav(aid.id) }"
              :aria-label="isFav(aid.id) ? 'Remove from favorites' : 'Add to favorites'"
              @click.stop="toggleFav(aid.id)"
            >
              {{ isFav(aid.id) ? '★' : '☆' }}
            </button>
          </article>
        </div>
      </section>

      <p v-if="!visibleCategories.length" class="nal-empty nal-empty--wide">
        No aids match those filters. Clear filters to see the full library.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import {
  NOTE_AID_CATEGORY_TONES,
  NOTE_AID_KIND_FILTERS,
  aidKind,
  aidSetting,
  aidServiceCodeDisplay,
  flattenNoteAids
} from '../../config/noteAidWorkspace.js';
import {
  isFavoriteAid,
  listFavoriteAidIds,
  listRecentAidIds,
  rememberRecentAid,
  toggleFavoriteAid
} from '../../utils/noteAidLibraryPrefs.js';

const props = defineProps({
  categories: { type: Array, required: true },
  userId: { type: [Number, String], default: null }
});

const emit = defineEmits(['select', 'client-rail']);

const navCategory = ref('all');
const clientRail = ref('');
const filterKind = ref('all');
const filterCode = ref('');
const filterSetting = ref('');
const favoriteIds = ref(listFavoriteAidIds(props.userId));
const recentIds = ref(listRecentAidIds(props.userId));
const collapsed = reactive({});
const kindFilters = NOTE_AID_KIND_FILTERS;

function setClientRail(which) {
  clientRail.value = clientRail.value === which ? '' : which;
  if (clientRail.value === 'goals') {
    filterKind.value = 'plan';
    navCategory.value = 'all';
  } else if (clientRail.value === 'intake') {
    filterKind.value = 'intake';
    navCategory.value = 'all';
  }
  emit('client-rail', clientRail.value || null);
}

function pickCategory(id) {
  clientRail.value = '';
  navCategory.value = navCategory.value === id ? 'all' : id;
}

const allAids = computed(() => flattenNoteAids(props.categories));

const codeOptions = computed(() => {
  const set = new Set();
  for (const aid of allAids.value) {
    if (aid.serviceCode) set.add(String(aid.serviceCode).toUpperCase());
  }
  return [...set].sort();
});

const filtersDirty = computed(
  () => filterKind.value !== 'all' || !!filterCode.value || !!filterSetting.value || navCategory.value !== 'all'
);

function matchesFilters(aid) {
  if (navCategory.value !== 'all' && aid.categoryId !== navCategory.value) return false;
  const kind = aidKind(aid);
  if (filterKind.value !== 'all' && kind !== filterKind.value) return false;
  if (filterCode.value && String(aid.serviceCode || '').toUpperCase() !== filterCode.value) return false;
  if (filterSetting.value && aidSetting(aid) !== filterSetting.value) return false;
  return true;
}

const visibleCategories = computed(() => {
  return (props.categories || [])
    .map((cat) => ({
      ...cat,
      aids: (cat.aids || []).filter((aid) => matchesFilters({ ...aid, categoryId: cat.id }))
    }))
    .filter((cat) => cat.aids.length);
});

const recentAids = computed(() => {
  const map = new Map(allAids.value.map((a) => [a.id, a]));
  return recentIds.value.map((id) => map.get(id)).filter(Boolean).slice(0, 5);
});

const favoriteAids = computed(() => {
  const map = new Map(allAids.value.map((a) => [a.id, a]));
  return favoriteIds.value.map((id) => map.get(id)).filter(Boolean).slice(0, 6);
});

function tone(categoryId) {
  return NOTE_AID_CATEGORY_TONES[categoryId] || 'slate';
}

function catIcon(categoryId) {
  if (categoryId === 'psychotherapy') return '🧠';
  if (categoryId === 'skill_builder') return '⚙️';
  if (categoryId === 'therapy_tutoring') return '📋';
  if (categoryId === 'additional') return '＋';
  return '👥';
}

function shortLabel(label) {
  const s = String(label || '');
  return s.length > 42 ? `${s.slice(0, 40)}…` : s;
}

function aidServiceCodeLabel(aid) {
  return aidServiceCodeDisplay(aid);
}

function isFav(aidId) {
  return favoriteIds.value.includes(String(aidId));
}

function toggleFav(aidId) {
  favoriteIds.value = toggleFavoriteAid(props.userId, aidId);
}

function toggleSection(id) {
  collapsed[id] = !collapsed[id];
}

function resetFilters() {
  navCategory.value = 'all';
  filterKind.value = 'all';
  filterCode.value = '';
  filterSetting.value = '';
}

function pick(aid) {
  const catId = aid.categoryId || props.categories.find((c) => (c.aids || []).some((a) => a.id === aid.id))?.id;
  recentIds.value = rememberRecentAid(props.userId, aid.id);
  emit('select', { aid, categoryId: catId });
}
</script>

<style scoped>
.nal {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  min-height: 0;
  height: 100%;
  background: #f8fafc;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}
.nal-nav {
  background: #fff;
  border-right: 1px solid #e2e8f0;
  padding: 16px 14px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow: auto;
}
.nal-nav-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
}
.nal-cats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nal-cat {
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 10px;
  padding: 8px 10px;
  font-weight: 700;
  font-size: 0.82rem;
  color: #334155;
  cursor: pointer;
}
.nal-cat.active {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}
.nal-cat.tone-teal.active { background: #f0fdfa; border-color: #99f6e4; color: #0f766e; }
.nal-cat.tone-purple.active { background: #f5f3ff; border-color: #ddd6fe; color: #6d28d9; }
.nal-cat.tone-orange.active { background: #fff7ed; border-color: #fed7aa; color: #c2410c; }
.nal-cat.tone-goals.active { background: #ecfdf5; border-color: #86efac; color: #166534; }
.nal-cat.tone-intake.active { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
.nal-cat-icon { width: 1.4rem; text-align: center; }
.nal-block h3 {
  margin: 0 0 8px;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.nal-mini-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.nal-mini-btn {
  width: 100%;
  border: 0;
  background: #f8fafc;
  border-radius: 8px;
  padding: 7px 8px;
  text-align: left;
  font-size: 0.78rem;
  font-weight: 600;
  color: #0f172a;
  cursor: pointer;
}
.nal-mini-btn:hover { background: #eef2ff; }
.nal-star { color: #eab308; }
.nal-empty { margin: 0; font-size: 0.78rem; color: #94a3b8; }
.nal-empty--wide { padding: 24px; }
.nal-filters label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 8px;
}
.nal-filters select {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 0.82rem;
  background: #fff;
}
.nal-reset {
  border: 0;
  background: none;
  color: #0f766e;
  font-weight: 700;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
}
.nal-main { padding: 18px 20px 48px; min-width: 0; min-height: 0; overflow: auto; }
.nal-head h1 { margin: 0; font-size: 1.35rem; font-weight: 800; color: #0f172a; }
.nal-head p { margin: 6px 0 14px; color: #64748b; font-size: 0.9rem; }
.nal-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 18px;
}
.nal-pill {
  border: 1.5px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #334155;
  cursor: pointer;
}
.nal-pill.active { background: #2563eb; border-color: #2563eb; color: #fff; }
.nal-pill.kind-intake { border-color: #5eead4; }
.nal-pill.kind-progress { border-color: #86efac; }
.nal-pill.kind-plan { border-color: #fdba74; }
.nal-pill.kind-consultation { border-color: #fde047; }
.nal-pill.kind-summary { border-color: #93c5fd; }
.nal-pill.kind-termination { border-color: #fca5a5; }
.nal-section { margin-bottom: 14px; }
.nal-section-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  padding: 8px 2px;
  cursor: pointer;
  font-size: 0.95rem;
  color: #0f172a;
}
.nal-section.tone-blue .nal-section-head { color: #1d4ed8; }
.nal-section.tone-teal .nal-section-head { color: #0f766e; }
.nal-section.tone-purple .nal-section-head { color: #6d28d9; }
.nal-section.tone-orange .nal-section-head { color: #c2410c; }
.nal-count {
  font-size: 0.75rem;
  font-weight: 700;
  color: #94a3b8;
}
.nal-chevron { margin-left: auto; color: #94a3b8; transition: transform 0.15s; }
.nal-chevron.open { transform: rotate(180deg); }
.nal-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}
.nal-card {
  display: flex;
  align-items: stretch;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}
.nal-card:hover { border-color: #94a3b8; box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06); }
.nal-card-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 12px 10px 12px 12px;
  cursor: pointer;
  min-width: 0;
}
.nal-card-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.nal-card-copy strong {
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
}
.nal-card-copy small { font-size: 0.72rem; color: #64748b; font-weight: 700; }
.nal-fav {
  border: 0;
  background: #f8fafc;
  color: #94a3b8;
  width: 40px;
  cursor: pointer;
  font-size: 1rem;
}
.nal-fav.on { color: #eab308; background: #fffbeb; }

@media (max-width: 900px) {
  .nal { grid-template-columns: 1fr; }
  .nal-nav { border-right: 0; border-bottom: 1px solid #e2e8f0; }
}
:global([data-theme="dark"]) .nal { background: #1a1d21; border-color: #334155; }
:global([data-theme="dark"]) .nal-nav,
:global([data-theme="dark"]) .nal-card { background: #25282c; border-color: #334155; }
:global([data-theme="dark"]) .nal-head h1,
:global([data-theme="dark"]) .nal-nav-title,
:global([data-theme="dark"]) .nal-card-copy strong,
:global([data-theme="dark"]) .nal-mini-btn { color: #e2e8f0; }
:global([data-theme="dark"]) .nal-pill { background: #25282c; color: #cbd5e1; }
</style>
