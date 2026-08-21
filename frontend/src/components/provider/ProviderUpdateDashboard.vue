<template>
  <div class="pu-hub" data-tour="provider-update-hub" :style="brandStyle">
    <header class="pu-top">
      <div class="pu-brand">
        <img v-if="tenantLogo" class="pu-logo-img" :src="tenantLogo" :alt="tenantName" />
        <span v-else class="pu-logo" aria-hidden="true">◆</span>
        <div class="pu-brand-copy">
          <strong>{{ tenantName }}</strong>
          <span>Provider Update</span>
        </div>
      </div>
      <div class="pu-secure">
        <span class="pu-secure-icon" aria-hidden="true">🛡</span>
        <div>
          <div class="pu-secure-title">Secure token access</div>
          <div class="pu-secure-sub">Scoped update link</div>
        </div>
      </div>
      <div class="pu-user">
        <div class="pu-user-name">{{ displayName }}</div>
        <div class="pu-user-role">External Staff</div>
      </div>
    </header>

    <div class="pu-layout">
      <aside class="pu-side">
        <div class="pu-side-brand">
          <img v-if="tenantLogo" :src="tenantLogo" :alt="tenantName" />
          <div>
            <strong>{{ tenantName }}</strong>
            <span>Update hub</span>
          </div>
        </div>
        <nav class="pu-nav">
          <button
            v-for="p in pages"
            :key="p.key"
            type="button"
            class="pu-nav-item"
            :class="{ active: activePageKey === p.key, done: p.completed }"
            @click="openPage(p.key)"
          >
            <span class="pu-nav-check" :class="statusClass(p)">{{ p.completed ? '✓' : '○' }}</span>
            <span class="pu-nav-label">{{ p.shortTitle }}</span>
            <span class="pu-nav-status">{{ statusLabel(p) }}</span>
          </button>
        </nav>
        <div class="pu-side-progress">
          <div class="pu-side-progress-label">{{ pageProgress.completed }} of {{ pageProgress.total }} pages complete</div>
          <div class="pu-bar"><i :style="{ width: pageProgress.percent + '%' }" /></div>
        </div>
        <div class="pu-help">
          <strong>Need help?</strong>
          <p>Contact {{ tenantName }} support<br />technology@itsco.health</p>
        </div>
      </aside>

      <main class="pu-main">
        <template v-if="!activePageKey">
          <div class="pu-hero">
            <img v-if="tenantLogo" class="pu-hero-logo" :src="tenantLogo" :alt="tenantName" />
            <div>
              <p class="pu-hero-kicker">{{ tenantName }}</p>
              <h1>Update Overview</h1>
              <p class="pu-sub">Each card opens a page — some are one full step; others group a few related items together.</p>
            </div>
          </div>
          <div class="pu-grid">
            <article
              v-for="p in pages"
              :key="'card-' + p.key"
              class="pu-card"
              :class="{ active: p.status === 'in_progress', done: p.completed }"
            >
              <div class="pu-card-top">
                <span class="pu-card-icon">{{ iconFor(p.icon) }}</span>
                <span class="pu-pill" :class="statusClass(p)">{{ statusLabel(p) }}</span>
              </div>
              <h2>{{ p.title }}</h2>
              <p>{{ p.description }}</p>
              <ul>
                <li v-for="(c, i) in (p.checklist || [])" :key="i">{{ c }}</li>
              </ul>
              <p v-if="!p.alone" class="pu-card-meta">
                {{ p.sectionsCompleted }}/{{ p.sectionsTotal }} items on this page
              </p>
              <button type="button" class="pu-btn" :class="p.completed ? 'ghost' : 'primary'" @click="openPage(p.key)">
                {{ p.completed ? 'Review →' : p.status === 'in_progress' ? 'Continue →' : 'Open Page →' }}
              </button>
            </article>
          </div>

          <div class="pu-bottom">
            <div class="pu-next">
              <div class="eyebrow">Next Step</div>
              <strong>{{ nextPage?.title || 'All pages complete' }}</strong>
              <p v-if="nextPage">{{ nextPage.description }}</p>
              <button v-if="nextPage" type="button" class="pu-btn light" @click="openPage(nextPage.key)">
                Open Next Page →
              </button>
              <button
                v-else-if="!recipient.finalizedAt"
                type="button"
                class="pu-btn light"
                :disabled="finalizing"
                @click="finalize"
              >
                {{ finalizing ? 'Submitting…' : 'Mark Provider Update complete' }}
              </button>
            </div>
            <div class="pu-overall">
              <div class="eyebrow">Overall Progress</div>
              <div class="pu-overall-row">
                <span>{{ pageProgress.completed }} of {{ pageProgress.total }} pages complete</span>
                <strong>{{ pageProgress.percent }}%</strong>
              </div>
              <div class="pu-bar"><i :style="{ width: pageProgress.percent + '%' }" /></div>
              <div class="pu-legend">
                <span><i class="done" /> Completed</span>
                <span><i class="todo" /> Not Started</span>
                <span><i class="progress" /> In Progress</span>
              </div>
            </div>
            <div class="pu-eta">
              <div class="eyebrow">Estimated Time Remaining</div>
              <strong>{{ etaLabel }}</strong>
              <p>Estimated time remaining to complete open update pages.</p>
            </div>
          </div>
        </template>

        <template v-else>
          <button type="button" class="pu-back" @click="activePageKey = ''">← Back to overview</button>
          <ProviderUpdatePagePanel
            v-if="activePage"
            :page="activePage"
            :mode="accessMode"
            :token="token"
            :agency-id="agencyId || recipient.agencyId"
            :recipient="recipient"
            @saved="onSectionSaved"
            @close="activePageKey = ''"
          />
        </template>

        <p v-if="error" class="pu-error">{{ error }}</p>
        <p v-if="success" class="pu-success">{{ success }}</p>
      </main>
    </div>

    <footer class="pu-foot">
      <img v-if="tenantLogo" :src="tenantLogo" :alt="tenantName" />
      <span>{{ tenantName }} · Provider Update</span>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { buildPagesFromSections } from '../../utils/providerUpdate';
import { agencyDisplayName, logoSrc, parseAgencyPalette } from '../../utils/schoolReinit';
import { useBrandingStore } from '../../store/branding';
import { useProviderUpdateSession } from '../../composables/useProviderUpdateSession';
import ProviderUpdatePagePanel from './ProviderUpdatePagePanel.vue';

const props = defineProps({
  accessMode: { type: String, default: 'token' },
  token: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  agencyName: { type: String, default: 'ITSCO' }
});

const brandingStore = useBrandingStore();
const sections = ref([]);
const progress = ref({ completed: 0, total: 0, percent: 0 });
const recipient = ref({});
const agencyInfo = ref(null);
const activePageKey = ref('');
const loading = ref(false);
const error = ref('');
const success = ref('');
const finalizing = ref(false);

const pages = computed(() => buildPagesFromSections(sections.value));
const tenantName = computed(() =>
  agencyDisplayName(agencyInfo.value, props.agencyName || 'ITSCO')
);
const tenantLogo = computed(() => {
  const full = logoSrc(agencyInfo.value, { allowIcon: false });
  if (full) return full;
  const icon = logoSrc(agencyInfo.value, { allowIcon: true });
  if (icon) return icon;
  return brandingStore.displayLogoUrl || null;
});
const brandStyle = computed(() => {
  const p = parseAgencyPalette(agencyInfo.value);
  return {
    '--pu-green': p.primary || '#3d6b4f',
    '--pu-green-soft': 'color-mix(in srgb, var(--pu-green) 14%, transparent)',
    '--pu-green-deep': p.secondary || '#2f5540',
    '--pu-accent': p.accent || '#0e7490'
  };
});
const pageProgress = computed(() => {
  const list = pages.value;
  const total = list.length;
  const completed = list.filter((p) => p.completed).length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0
  };
});
const displayName = computed(() =>
  [recipient.value.firstName, recipient.value.lastName].filter(Boolean).join(' ') || 'Provider'
);
const activePage = computed(() => pages.value.find((p) => p.key === activePageKey.value) || null);
const nextPage = computed(() => pages.value.find((p) => !p.completed) || null);
const etaLabel = computed(() => {
  const remaining = Math.max(0, pageProgress.value.total - pageProgress.value.completed);
  if (!remaining) return 'Done';
  return `${remaining * 2}–${remaining * 4} minutes`;
});

const session = useProviderUpdateSession({
  agencyId: computed(() => props.agencyId),
  mode: props.accessMode,
  token: computed(() => props.token)
});

function statusLabel(p) {
  if (p.completed) return 'Complete';
  if (p.status === 'in_progress') return 'In Progress';
  return 'Not Started';
}
function statusClass(p) {
  if (p.completed) return 'done';
  if (p.status === 'in_progress') return 'progress';
  return 'todo';
}
function iconFor(icon) {
  const map = {
    admin: '👤',
    amendment: '✍',
    handbook: '📘',
    pin: '🔢',
    hours: '⏱',
    office: '🏢',
    clients: '🏫',
    license: '🪪',
    blurb: '✎',
    specialties: '★',
    contact: '☎',
    credential: '🎓',
    school: '🏫',
    preferred: '📅',
    photo: '🖼',
    training: '📚',
    pay: '💳',
    notify: '🔔'
  };
  return map[icon] || '•';
}

function openPage(key) {
  activePageKey.value = key;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    let data;
    if (props.accessMode === 'token') {
      const res = await api.get(`/public/provider-update/${encodeURIComponent(props.token)}`);
      data = res.data;
    } else {
      const res = await api.get('/provider-update/me', { params: { agencyId: props.agencyId } });
      data = res.data;
    }
    recipient.value = data.recipient || {};
    agencyInfo.value = data.agency || null;
    sections.value = data.sections || [];
    progress.value = data.progress || { completed: 0, total: 0, percent: 0 };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load Provider Update';
  } finally {
    loading.value = false;
  }
}

async function onSectionSaved(bundle) {
  if (bundle?.sections) {
    sections.value = bundle.sections;
    progress.value = bundle.progress || progress.value;
    recipient.value = bundle.recipient || recipient.value;
  } else {
    await load();
  }
  success.value = 'Saved.';
  setTimeout(() => {
    success.value = '';
  }, 1500);
}

async function finalize() {
  finalizing.value = true;
  error.value = '';
  try {
    if (props.accessMode === 'token') {
      await api.post(`/public/provider-update/${encodeURIComponent(props.token)}/finalize`);
    } else {
      await api.post('/provider-update/me/finalize', { agencyId: props.agencyId });
    }
    success.value = 'Provider Update marked complete.';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not finalize';
  } finally {
    finalizing.value = false;
  }
}

onMounted(async () => {
  await load();
  session.start();
});

watch(
  () => [props.token, props.agencyId],
  () => load()
);
</script>

<style scoped>
.pu-hub {
  --pu-green: #3d6b4f;
  --pu-green-soft: rgba(61, 107, 79, 0.12);
  --pu-green-deep: #2f5540;
  --pu-accent: #0e7490;
  --pu-ink: #0f172a;
  --pu-muted: #64748b;
  --pu-line: rgba(15, 23, 42, 0.08);
  min-height: 100vh;
  background:
    radial-gradient(1000px 420px at 0% -10%, color-mix(in srgb, var(--pu-green) 18%, transparent), transparent 55%),
    radial-gradient(900px 360px at 100% 0%, color-mix(in srgb, var(--pu-accent) 14%, transparent), transparent 50%),
    #f4f7f5;
  color: var(--pu-ink);
  font-family: 'Segoe UI', system-ui, sans-serif;
}
.pu-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  background: rgba(255, 255, 255, 0.72);
  border-bottom: 1px solid var(--pu-line);
  backdrop-filter: blur(14px);
}
.pu-brand { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
.pu-logo { color: var(--pu-green); font-size: 1.25rem; }
.pu-logo-img {
  width: 44px; height: 44px; object-fit: contain; border-radius: 10px;
  background: #fff; border: 1px solid var(--pu-line); padding: 3px;
}
.pu-brand-copy { display: grid; line-height: 1.15; }
.pu-brand-copy strong { font-size: 1rem; }
.pu-brand-copy span { font-size: 0.75rem; color: var(--pu-muted); }
.pu-side-brand {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.25rem 0.35rem 0.75rem; margin-bottom: 0.35rem;
  border-bottom: 1px solid var(--pu-line);
}
.pu-side-brand img {
  width: 32px; height: 32px; object-fit: contain; border-radius: 8px; background: #fff;
}
.pu-side-brand strong { display: block; font-size: 0.88rem; }
.pu-side-brand span { font-size: 0.72rem; color: var(--pu-muted); }
.pu-hero {
  display: flex; gap: 0.9rem; align-items: center; margin-bottom: 1.1rem;
}
.pu-hero-logo {
  width: 72px; height: 72px; object-fit: contain; border-radius: 16px;
  background: #fff; border: 1px solid var(--pu-line); padding: 8px; flex-shrink: 0;
}
.pu-hero-kicker {
  margin: 0 0 0.15rem; font-size: 0.78rem; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase; color: var(--pu-green);
}
.pu-foot {
  display: flex; align-items: center; justify-content: center; gap: 0.55rem;
  padding: 0.75rem 1rem; border-top: 1px solid var(--pu-line);
  background: rgba(255,255,255,0.65); color: var(--pu-muted); font-size: 0.85rem;
}
.pu-foot img { width: 24px; height: 24px; object-fit: contain; }
.pu-secure { display: flex; align-items: center; gap: 0.5rem; color: var(--pu-muted); font-size: 0.85rem; }
.pu-secure-title { color: var(--pu-ink); font-weight: 600; }
.pu-user { text-align: right; }
.pu-user-name { font-weight: 600; }
.pu-user-role { font-size: 0.8rem; color: var(--pu-muted); }
.pu-layout { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 64px); }
.pu-side {
  background: rgba(255, 255, 255, 0.55);
  border-right: 1px solid var(--pu-line);
  padding: 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  backdrop-filter: blur(12px);
}
.pu-nav { display: grid; gap: 0.25rem; }
.pu-nav-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.4rem;
  align-items: center;
  border: 0;
  background: transparent;
  border-radius: 10px;
  padding: 0.55rem 0.55rem;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}
.pu-nav-item.active { background: var(--pu-green-soft); }
.pu-nav-item.done .pu-nav-label { color: var(--pu-muted); }
.pu-nav-check {
  width: 1.25rem; height: 1.25rem; border-radius: 999px;
  display: grid; place-items: center; font-size: 0.75rem; font-weight: 700;
}
.pu-nav-check.done { background: var(--pu-green); color: #fff; }
.pu-nav-check.progress { background: #f59e0b; color: #fff; }
.pu-nav-check.todo { border: 1.5px dashed #94a3b8; color: #94a3b8; }
.pu-nav-label { font-weight: 600; font-size: 0.88rem; }
.pu-nav-status { font-size: 0.7rem; color: var(--pu-muted); }
.pu-side-progress-label { font-size: 0.8rem; color: var(--pu-muted); margin-bottom: 0.35rem; }
.pu-bar { height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
.pu-bar i { display: block; height: 100%; background: linear-gradient(90deg, #3d6b4f, #2f5540); }
.pu-help { font-size: 0.85rem; color: var(--pu-muted); margin-top: auto; }
.pu-help strong { color: var(--pu-ink); }
.pu-main { padding: 1.25rem 1.5rem 2.5rem; }
.pu-main h1 { margin: 0 0 0.25rem; letter-spacing: -0.03em; font-size: 1.75rem; }
.pu-sub { color: var(--pu-muted); margin: 0 0 1.25rem; }
.pu-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}
.pu-card {
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid var(--pu-line);
  border-radius: 16px;
  padding: 1rem 1.05rem;
  display: grid;
  gap: 0.55rem;
  backdrop-filter: blur(10px);
}
.pu-card.active { border-color: rgba(61, 107, 79, 0.45); box-shadow: 0 0 0 1px rgba(61, 107, 79, 0.12); }
.pu-card.done { opacity: 0.92; }
.pu-card-top { display: flex; justify-content: space-between; align-items: center; }
.pu-card-icon { font-size: 1.25rem; }
.pu-pill {
  font-size: 0.72rem; font-weight: 700; border-radius: 999px;
  padding: 0.15rem 0.55rem;
}
.pu-pill.done { background: var(--pu-green-soft); color: var(--pu-green); }
.pu-pill.progress { background: #ffedd5; color: #c2410c; }
.pu-pill.todo { background: #f1f5f9; color: #64748b; }
.pu-card h2 { margin: 0; font-size: 1.1rem; }
.pu-card p { margin: 0; color: var(--pu-muted); font-size: 0.9rem; }
.pu-card ul { margin: 0; padding-left: 1.1rem; color: #475569; font-size: 0.88rem; }
.pu-card-meta { font-size: 0.8rem; font-weight: 600; color: var(--pu-green); }
.pu-btn {
  justify-self: start;
  border: 1px solid rgba(61, 107, 79, 0.35);
  background: #fff;
  color: var(--pu-green);
  border-radius: 10px;
  padding: 0.45rem 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.pu-btn.primary { background: linear-gradient(135deg, var(--pu-green), var(--pu-green-deep)); color: #fff; border-color: transparent; }
.pu-btn.ghost { background: transparent; }
.pu-btn.light { background: rgba(255,255,255,0.18); color: #fff; border-color: rgba(255,255,255,0.35); }
.pu-bottom {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1fr;
  gap: 1rem;
  margin-top: 1.25rem;
}
.pu-next, .pu-overall, .pu-eta {
  border-radius: 16px;
  padding: 1rem 1.1rem;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid var(--pu-line);
}
.pu-next {
  background: linear-gradient(145deg, #2f5540, #3d6b4f);
  color: #fff;
  border: 0;
}
.pu-next p { opacity: 0.9; }
.eyebrow { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.85; margin-bottom: 0.35rem; }
.pu-overall-row { display: flex; justify-content: space-between; margin-bottom: 0.4rem; }
.pu-legend { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.65rem; font-size: 0.78rem; color: var(--pu-muted); }
.pu-legend i {
  display: inline-block; width: 0.65rem; height: 0.65rem; border-radius: 999px; margin-right: 0.25rem;
}
.pu-legend i.done { background: var(--pu-green); }
.pu-legend i.todo { border: 1.5px dashed #94a3b8; background: transparent; }
.pu-legend i.progress { background: #f59e0b; }
.pu-back {
  border: 0; background: transparent; color: var(--pu-muted); cursor: pointer;
  margin-bottom: 0.75rem; font: inherit; padding: 0;
}
.pu-error { color: #b91c1c; }
.pu-success { color: var(--pu-green); }
@media (max-width: 1100px) {
  .pu-grid, .pu-bottom { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 860px) {
  .pu-layout { grid-template-columns: 1fr; }
  .pu-side { border-right: 0; border-bottom: 1px solid var(--pu-line); }
  .pu-grid, .pu-bottom { grid-template-columns: 1fr; }
}
</style>
