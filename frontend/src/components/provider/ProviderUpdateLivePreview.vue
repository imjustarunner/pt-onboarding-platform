<template>
  <div class="pu-live" :style="brandStyle">
    <div class="pu-live-chrome">
      <div class="pu-live-dots" aria-hidden="true"><i /><i /><i /></div>
      <div class="pu-live-url">{{ urlLabel }}</div>
      <div class="pu-live-pill">{{ view === 'card' ? 'Full overview' : 'Opened page' }}</div>
    </div>

    <div class="pu-live-window">
      <header class="pu-top">
        <div class="pu-brand">
          <img v-if="logoUrl" class="pu-logo-img" :src="logoUrl" :alt="tenantName" />
          <span v-else class="pu-logo-mark" aria-hidden="true">◆</span>
          <div class="pu-brand-copy">
            <strong>{{ tenantName }}</strong>
            <span>Provider Update</span>
          </div>
        </div>
        <div class="pu-secure">
          <div class="pu-secure-title">Secure token access</div>
          <div class="pu-secure-sub">Scoped update link</div>
        </div>
        <div class="pu-user">
          <div class="pu-user-name">Alex Provider</div>
          <div class="pu-user-role">External Staff</div>
        </div>
      </header>

      <div class="pu-layout">
        <aside class="pu-side">
          <div class="pu-side-brand">
            <img v-if="logoUrl" :src="logoUrl" :alt="tenantName" />
            <strong>{{ tenantName }}</strong>
          </div>
          <button
            v-for="p in displayPages"
            :key="p.key"
            type="button"
            class="pu-nav-item"
            :class="{ active: view === 'section' && focusedPageKey === p.key }"
            @click="openPage(p)"
          >
            <span class="pu-nav-check">○</span>
            <span>{{ p.shortTitle }}</span>
            <span class="pu-nav-status">Not Started</span>
          </button>
          <div class="pu-side-progress">
            <div class="pu-side-progress-label">0 of {{ displayPages.length }} pages complete</div>
            <div class="pu-bar"><i style="width: 0%" /></div>
          </div>
        </aside>

        <main class="pu-main">
          <template v-if="view === 'card'">
            <div class="pu-hero">
              <img v-if="logoUrl" class="pu-hero-logo" :src="logoUrl" :alt="tenantName" />
              <div>
                <p class="pu-hero-kicker">{{ tenantName }}</p>
                <h1>Update Overview</h1>
                <p class="pu-sub">Click a card or sidebar item to open that page in this preview.</p>
              </div>
            </div>
            <div class="pu-grid">
              <article
                v-for="p in displayPages"
                :key="'c-' + p.key"
                class="pu-card"
                :class="{ active: focusedPageKey === p.key }"
                role="button"
                tabindex="0"
                @click="openPage(p)"
                @keydown.enter.prevent="openPage(p)"
              >
                <div class="pu-card-top">
                  <span>{{ iconFor(p.icon) }}</span>
                  <span class="pu-pill">Not Started</span>
                </div>
                <h2>{{ p.title }}</h2>
                <p>{{ p.description }}</p>
                <ul>
                  <li v-for="(c, i) in (p.checklist || []).slice(0, 4)" :key="i">{{ c }}</li>
                </ul>
                <button type="button" class="pu-btn primary" @click.stop="openPage(p)">
                  Open Page →
                </button>
              </article>
            </div>
          </template>

          <template v-else>
            <button type="button" class="pu-back" @click="view = 'card'">← Back to overview</button>
            <header class="pu-section-head">
              <p class="pu-hero-kicker">{{ tenantName }} · Provider Update</p>
              <h1>{{ activePage?.title }}</h1>
              <p>{{ activePage?.description }}</p>
            </header>

            <div v-if="activePage && !activePage.alone" class="demo-panel">
              <p class="muted">Items on this page (provider completes these together):</p>
              <ul>
                <li v-for="s in activePage.sections" :key="s.key">
                  <strong>{{ s.meta?.title || s.title || s.key }}</strong>
                  <span class="muted"> — {{ s.meta?.previewHint || s.previewHint || 'Included on this page' }}</span>
                </li>
              </ul>
              <button type="button" class="pu-btn primary" @click="view = 'card'">Return to overview</button>
            </div>
            <ProviderUpdateAdminUpdateEmbed
              v-else-if="soleKey === 'admin_update'"
              preview-mode
              mode="auth"
              :agency-id="agencyId"
              :update-id="adminUpdateId"
            />
            <WorkplaceHandbookReader
              v-else-if="soleKey === 'handbook'"
              preview-mode
              access-mode="auth"
              :agency-id="agencyId"
              :admin-update-id="adminUpdateId"
            />
            <div v-else class="demo-panel">
              <ul>
                <li v-for="(c, i) in (activePage?.checklist || [])" :key="i">{{ c }}</li>
              </ul>
              <button type="button" class="pu-btn primary" @click="view = 'card'">Return to overview</button>
            </div>
          </template>
        </main>
      </div>

      <footer class="pu-foot">
        <img v-if="logoUrl" :src="logoUrl" :alt="tenantName" />
        <span>{{ tenantName }} Provider Update</span>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  buildPagesFromSections,
  PROVIDER_UPDATE_PAGES,
  PROVIDER_UPDATE_SECTIONS
} from '../../utils/providerUpdate';
import { agencyDisplayName, logoSrc, parseAgencyPalette } from '../../utils/schoolReinit';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import ProviderUpdateAdminUpdateEmbed from './ProviderUpdateAdminUpdateEmbed.vue';
import WorkplaceHandbookReader from '../handbook/WorkplaceHandbookReader.vue';

const props = defineProps({
  section: { type: Object, default: null },
  sections: { type: Array, default: () => [] },
  overviewMode: { type: Boolean, default: false },
  /** When set, open this page immediately (used by per-page compose preview). */
  initialPageKey: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  adminUpdateId: { type: [Number, String], default: null }
});

const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const view = ref('card');
const focusedPageKey = ref('');

const agency = computed(() => {
  const list = agencyStore.userAgencies?.value || agencyStore.userAgencies || [];
  const id = Number(props.agencyId || 0);
  if (id) {
    const hit = (list || []).find((a) => Number(a.id) === id);
    if (hit) return hit;
  }
  return agencyStore.currentAgency?.value || agencyStore.currentAgency || null;
});

const tenantName = computed(() => agencyDisplayName(agency.value, 'ITSCO'));
const logoUrl = computed(() => {
  const fromAgency = logoSrc(agency.value, { allowIcon: false }) || logoSrc(agency.value, { allowIcon: true });
  if (fromAgency) return fromAgency;
  return brandingStore.displayLogoUrl || null;
});
const brandStyle = computed(() => {
  const p = parseAgencyPalette(agency.value);
  return {
    '--pu-green': p.primary || '#3d6b4f',
    '--pu-green-deep': p.secondary || '#2f5540',
    '--pu-accent': p.accent || '#0e7490'
  };
});

const rawSections = computed(() => {
  const source = props.sections?.length
    ? props.sections
    : props.section
      ? [props.section]
      : PROVIDER_UPDATE_SECTIONS;
  return source.map((s) => ({
    key: s.key,
    meta: s.meta || s,
    completed: false,
    status: 'not_started',
    ...s
  }));
});

const displayPages = computed(() => {
  const built = buildPagesFromSections(rawSections.value);
  if (built.length) return built;
  if (props.section) {
    const page = PROVIDER_UPDATE_PAGES.find((p) => p.sectionKeys.includes(props.section.key));
    if (page) {
      return [{
        ...page,
        alone: page.sectionKeys.length === 1,
        sections: [{ key: props.section.key, meta: props.section, ...props.section }],
        completed: false,
        status: 'not_started'
      }];
    }
  }
  return [];
});

const activePage = computed(
  () => displayPages.value.find((p) => p.key === focusedPageKey.value) || displayPages.value[0] || null
);
const soleKey = computed(() => activePage.value?.sections?.[0]?.key || '');

const urlLabel = computed(() =>
  view.value === 'card'
    ? '/provider-update/{token} · overview'
    : `/provider-update/{token} · ${activePage.value?.key || 'page'}`
);

function iconFor(icon) {
  const map = {
    admin: '👤', amendment: '✍', handbook: '📘', pin: '🔢', hours: '⏱', office: '🏢',
    clients: '🏫', license: '🪪', blurb: '✎', specialties: '★', contact: '☎', credential: '🎓',
    school: '🏫', preferred: '📅', photo: '🖼', training: '📚', pay: '💳', notify: '🔔'
  };
  return map[icon] || '•';
}

function openPage(p) {
  if (!p?.key) return;
  focusedPageKey.value = p.key;
  view.value = 'section';
}

function syncInitialView() {
  const pages = displayPages.value;
  const want = props.initialPageKey || (!props.overviewMode ? pages[0]?.key : '');
  if (want && pages.some((p) => p.key === want)) {
    focusedPageKey.value = want;
    view.value = 'section';
  } else {
    focusedPageKey.value = pages[0]?.key || '';
    view.value = 'card';
  }
}

onMounted(() => {
  syncInitialView();
});

watch(
  () => [props.section?.key, props.sections?.length, props.overviewMode, props.initialPageKey],
  () => syncInitialView()
);
</script>

<style scoped>
.pu-live {
  --pu-green: #3d6b4f;
  --pu-green-deep: #2f5540;
  --pu-accent: #0e7490;
  --pu-line: rgba(15, 23, 42, 0.08);
  margin-top: 0.5rem;
  border: 1px solid rgba(15, 23, 42, 0.2);
  border-radius: 18px;
  overflow: hidden;
  background: #0f172a;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}
.pu-live-chrome {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.55rem 0.85rem;
  background: rgba(30, 41, 59, 0.95);
  color: #cbd5e1;
  font-size: 0.78rem;
}
.pu-live-dots { display: flex; gap: 0.35rem; }
.pu-live-dots i { width: 9px; height: 9px; border-radius: 50%; display: block; }
.pu-live-dots i:nth-child(1) { background: #f87171; }
.pu-live-dots i:nth-child(2) { background: #fbbf24; }
.pu-live-dots i:nth-child(3) { background: #34d399; }
.pu-live-url {
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pu-live-pill {
  background: rgba(51, 65, 85, 0.9);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
}
.pu-live-window {
  background:
    radial-gradient(800px 280px at 0% 0%, color-mix(in srgb, var(--pu-green) 18%, transparent), transparent 55%),
    radial-gradient(700px 240px at 100% 0%, color-mix(in srgb, var(--pu-accent) 14%, transparent), transparent 50%),
    #f4f7f5;
  color: #0f172a;
  min-height: 420px;
  max-height: 720px;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.pu-top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
  background: rgba(255, 255, 255, 0.82);
  border-bottom: 1px solid var(--pu-line);
  backdrop-filter: blur(10px);
}
.pu-brand { display: flex; gap: 0.55rem; align-items: center; min-width: 0; }
.pu-logo-img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--pu-line);
  padding: 3px;
}
.pu-logo-mark { color: var(--pu-green); font-size: 1.4rem; }
.pu-brand-copy { display: grid; line-height: 1.15; }
.pu-brand-copy strong { font-size: 0.95rem; }
.pu-brand-copy span { font-size: 0.72rem; color: #64748b; }
.pu-secure-title { font-weight: 600; font-size: 0.82rem; }
.pu-secure-sub, .pu-user-role { font-size: 0.72rem; color: #64748b; }
.pu-user { text-align: right; }
.pu-layout { display: grid; grid-template-columns: 210px 1fr; min-height: 360px; flex: 1; }
.pu-side {
  border-right: 1px solid var(--pu-line);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: rgba(255, 255, 255, 0.5);
}
.pu-side-brand {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.25rem 0.65rem;
  border-bottom: 1px solid var(--pu-line);
  margin-bottom: 0.35rem;
}
.pu-side-brand img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 6px;
  background: #fff;
}
.pu-side-brand strong { font-size: 0.82rem; }
.pu-nav-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.35rem;
  align-items: center;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 10px;
  padding: 0.45rem;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  text-align: left;
  color: inherit;
}
.pu-nav-item.active, .pu-nav-item:hover {
  background: color-mix(in srgb, var(--pu-green) 12%, transparent);
  border-color: color-mix(in srgb, var(--pu-green) 22%, transparent);
}
.pu-nav-status { font-size: 0.68rem; color: #64748b; }
.pu-side-progress { margin-top: auto; padding-top: 0.75rem; }
.pu-side-progress-label { font-size: 0.75rem; color: #64748b; margin-bottom: 0.3rem; }
.pu-bar { height: 7px; background: rgba(15, 23, 42, 0.08); border-radius: 99px; overflow: hidden; }
.pu-bar > i { display: block; height: 100%; background: var(--pu-green); }
.pu-main { padding: 1rem 1.15rem 1.5rem; }
.pu-hero {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  margin-bottom: 1rem;
}
.pu-hero-logo {
  width: 64px;
  height: 64px;
  object-fit: contain;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--pu-line);
  padding: 6px;
  flex-shrink: 0;
}
.pu-hero-kicker {
  margin: 0 0 0.15rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--pu-green);
}
.pu-main h1 { margin: 0 0 0.2rem; font-size: 1.45rem; letter-spacing: -0.02em; }
.pu-sub { color: #64748b; margin: 0; }
.pu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.85rem;
}
.pu-card {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid var(--pu-line);
  border-radius: 16px;
  padding: 1rem;
  display: grid;
  gap: 0.45rem;
  backdrop-filter: blur(10px);
  cursor: pointer;
  text-align: left;
}
.pu-card:hover, .pu-card.active {
  border-color: color-mix(in srgb, var(--pu-green) 55%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--pu-green) 28%, transparent);
}
.pu-card h2 { margin: 0; font-size: 1.02rem; }
.pu-card p, .demo-panel li { font-size: 0.88rem; color: #64748b; }
.pu-card ul { margin: 0; padding-left: 1rem; font-size: 0.85rem; color: #475569; }
.pu-card-top { display: flex; justify-content: space-between; }
.pu-pill {
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border-radius: 99px;
  background: color-mix(in srgb, var(--pu-green) 12%, transparent);
  color: var(--pu-green);
}
.pu-btn {
  width: fit-content;
  border-radius: 10px;
  padding: 0.5rem 0.85rem;
  border: 0;
  background: linear-gradient(135deg, var(--pu-green), var(--pu-green-deep));
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.pu-back { border: 0; background: transparent; color: var(--pu-green); cursor: pointer; margin-bottom: 0.5rem; font: inherit; }
.pu-section-head h1 { margin: 0 0 0.2rem; }
.pu-section-head p { color: #64748b; margin: 0 0 0.85rem; }
.demo-panel {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid var(--pu-line);
  border-radius: 14px;
  padding: 1rem;
  display: grid;
  gap: 0.65rem;
}
.muted { color: #64748b; }
.pu-foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  border-top: 1px solid var(--pu-line);
  background: rgba(255, 255, 255, 0.7);
  font-size: 0.8rem;
  color: #64748b;
}
.pu-foot img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
@media (max-width: 900px) {
  .pu-layout { grid-template-columns: 1fr; }
  .pu-side { display: none; }
}
</style>
