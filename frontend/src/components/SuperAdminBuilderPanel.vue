<template>
  <div v-if="isSuperAdmin && store.panelOpen" class="builder-wrap" @click.stop>
    <div class="builder-head">
      <div class="builder-title">Builder</div>
      <button class="builder-close" type="button" @click="store.setPanelOpen(false)" aria-label="Close builder">×</button>
    </div>

    <div class="builder-subtitle">
      Route: <span class="mono">{{ routeName || '—' }}</span>
    </div>

    <div class="builder-subtitle" v-if="currentAgencyId">
      Org ID: <span class="mono">{{ currentAgencyId }}</span>
    </div>

    <div class="builder-tabs">
      <button
        type="button"
        class="tab"
        :class="{ active: store.mode === 'tutorial' }"
        @click="store.setMode('tutorial')"
      >Tutorial</button>
      <button
        type="button"
        class="tab"
        :class="{ active: store.mode === 'helper' }"
        @click="store.setMode('helper')"
      >Helper</button>
    </div>

    <div v-if="store.mode === 'tutorial'" class="builder-body">
      <div class="status">
        <div class="status-row">
          <div class="status-label">Published tutorial</div>
          <div class="status-val">
            <span v-if="publishedTutorialSummary">{{ publishedTutorialSummary }}</span>
            <span v-else class="dim">None</span>
          </div>
        </div>
        <div class="status-row">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!routeName || !currentAgencyId"
            @click="refreshPublished()"
          >
            Refresh published
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!publishedTutorialConfig"
            @click="loadPublishedTutorialIntoDraft"
          >
            Load published into draft
          </button>
        </div>
      </div>

      <div class="row">
        <label class="chk">
          <input type="checkbox" :checked="store.captureClicks" @change="store.setCaptureClicks($event.target.checked)" />
          Click-to-select an element
        </label>
      </div>

      <div v-if="store.captureClicks" class="hint">
        Click any element on the page to target a bubble. (This will not trigger the page action.)
      </div>

      <div class="field">
        <label>Target selector</label>
        <input v-model="draft.selector" placeholder='e.g. [data-tour="dash-rail"]' />
        <div class="help">We auto-fill this when you click an element. You can edit it.</div>
      </div>

      <div class="grid2">
        <div class="field">
          <label>Title</label>
          <input v-model="draft.title" placeholder="Step title" />
        </div>
        <div class="field">
          <label>Side</label>
          <select v-model="draft.side">
            <option value="top">top</option>
            <option value="right">right</option>
            <option value="bottom">bottom</option>
            <option value="left">left</option>
            <option value="over">over</option>
          </select>
        </div>
      </div>

      <div class="grid2">
        <div class="field">
          <label>Align</label>
          <select v-model="draft.align">
            <option value="start">start</option>
            <option value="center">center</option>
            <option value="end">end</option>
          </select>
        </div>
        <div class="field">
          <label>Tour id (optional)</label>
          <input v-model="draft.tourId" placeholder="dashboard" />
        </div>
      </div>

      <div class="field">
        <label>Description</label>
        <textarea v-model="draft.description" rows="3" placeholder="What should this bubble say?" />
      </div>

      <div class="actions">
        <button type="button" class="btn btn-primary" :disabled="!canAdd" @click="addStep">
          Add step to draft
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!routeName || !currentAgencyId || draftSteps.length === 0"
          @click="publishTutorialDraft"
        >
          Publish tutorial (this org)
        </button>
        <button type="button" class="btn btn-secondary" :disabled="!canCopy" @click="copyStepJson">
          Copy step JSON
        </button>
      </div>

      <div class="draft">
        <div class="draft-head">
          <div class="draft-title">Draft steps (this page)</div>
          <div class="draft-actions">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="draftSteps.length === 0" @click="copyTourJson">
              Copy full tour JSON
            </button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="draftSteps.length === 0" @click="clearDraft">
              Clear draft
            </button>
          </div>
        </div>

        <ol v-if="draftSteps.length > 0" class="step-list">
          <li v-for="(s, idx) in draftSteps" :key="idx" class="step-item">
            <div class="step-line">
              <span class="mono">{{ s.element }}</span>
            </div>
            <div class="step-line dim">
              <strong>{{ s.popover?.title || 'Untitled' }}</strong> — {{ s.popover?.description || '' }}
            </div>
            <div class="step-row">
              <button type="button" class="btn btn-secondary btn-sm" @click="removeStep(idx)">Remove</button>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="idx === 0" @click="move(idx, -1)">Up</button>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="idx === draftSteps.length - 1" @click="move(idx, +1)">Down</button>
            </div>
          </li>
        </ol>

        <div v-else class="empty">No steps yet. Turn on click-to-select and click something.</div>
      </div>
    </div>

    <div v-else class="builder-body">
      <div class="status">
        <div class="status-row">
          <div class="status-label">Published helper</div>
          <div class="status-val">
            <span v-if="publishedHelperSummary">{{ publishedHelperSummary }}</span>
            <span v-else class="dim">None</span>
          </div>
        </div>
        <div class="status-row">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!routeName || !currentAgencyId"
            @click="refreshPublished()"
          >
            Refresh published
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!publishedHelperConfig"
            @click="loadPublishedHelperIntoDraft"
          >
            Load published into draft
          </button>
        </div>
      </div>

      <div class="field">
        <label>Helper image URL</label>
        <input v-model="helperDraft.imageUrl" placeholder="https://.../helper.png" />
      </div>
      <div class="field">
        <label>Helper message (this page)</label>
        <textarea v-model="helperDraft.message" rows="3" placeholder="What should the helper say on this page?" />
      </div>
      <div class="grid2">
        <div class="field">
          <label>Position</label>
          <select v-model="helperDraft.position">
            <option value="bottom_right">bottom_right</option>
            <option value="bottom_left">bottom_left</option>
          </select>
        </div>
        <label class="chk" style="align-self:end; padding-bottom: 6px;">
          <input type="checkbox" v-model="helperDraft.enabled" />
          Enabled
        </label>
      </div>

      <div class="actions">
        <button type="button" class="btn btn-primary" :disabled="!routeName" @click="saveHelperDraft">
          Save helper draft (this page)
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!routeName || !currentAgencyId"
          @click="publishHelperDraft"
        >
          Publish helper (this org)
        </button>
        <button type="button" class="btn btn-secondary" :disabled="!routeName" @click="clearHelperDraft">
          Clear helper draft
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useSuperadminBuilderStore } from '../store/superadminBuilder';
import { useAgencyStore } from '../store/agency';
import { useOverlaysStore } from '../store/overlays';

const route = useRoute();
const authStore = useAuthStore();
const store = useSuperadminBuilderStore();
const agencyStore = useAgencyStore();
const overlaysStore = useOverlaysStore();

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');
const routeName = computed(() => String(route.name || ''));
const currentAgencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const draft = reactive({
  selector: '',
  title: '',
  description: '',
  side: 'bottom',
  align: 'start',
  tourId: ''
});

const helperDraft = reactive({
  enabled: true,
  imageUrl: '',
  message: '',
  position: 'bottom_right'
});

const draftTour = computed(() => {
  if (!routeName.value) return null;
  return store.getTutorialDraftForRouteName(routeName.value);
});
const draftSteps = computed(() => draftTour.value?.steps || []);

const published = computed(() => {
  if (!currentAgencyId.value || !routeName.value) return null;
  return overlaysStore.getCached(currentAgencyId.value, routeName.value);
});

const publishedTutorialConfig = computed(() => {
  const cfg = published.value?.tutorial?.config || null;
  if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.steps)) return null;
  return cfg;
});

const publishedHelperConfig = computed(() => {
  const cfg = published.value?.helper?.config || null;
  if (!cfg || typeof cfg !== 'object') return null;
  return cfg;
});

const publishedTutorialSummary = computed(() => {
  if (!publishedTutorialConfig.value) return null;
  const enabled = published.value?.tutorial?.enabled !== false ? 'on' : 'off';
  const v = Number(published.value?.tutorial?.version || publishedTutorialConfig.value?.version || 1);
  const n = (publishedTutorialConfig.value?.steps || []).length;
  return `${enabled} · v${v} · ${n} step${n === 1 ? '' : 's'}`;
});

const publishedHelperSummary = computed(() => {
  if (!publishedHelperConfig.value) return null;
  const enabled = published.value?.helper?.enabled !== false ? 'on' : 'off';
  const pos = String(publishedHelperConfig.value?.position || 'bottom_right');
  return `${enabled} · ${pos}`;
});

const canAdd = computed(() => !!routeName.value && !!draft.selector && !!draft.title);
const canCopy = computed(() => !!draft.selector);

const toStep = () => ({
  element: String(draft.selector || '').trim(),
  popover: {
    title: String(draft.title || '').trim() || 'Untitled',
    description: String(draft.description || '').trim(),
    side: draft.side,
    align: draft.align
  }
});

const addStep = () => {
  if (!routeName.value) return;
  const tour = draftTour.value || { id: draft.tourId || `draft_${routeName.value.toLowerCase()}`, version: 1, steps: [] };
  const next = {
    id: String(draft.tourId || tour.id),
    version: tour.version || 1,
    steps: [...(tour.steps || []), toStep()]
  };
  store.setTutorialDraftForRouteName(routeName.value, next);
};

const publishTutorialDraft = async () => {
  if (!routeName.value || !currentAgencyId.value) return;
  const tour = draftTour.value;
  if (!tour) return;
  // IMPORTANT: publishing should bump the version so users who already completed
  // the previous tour will see the updated one.
  const toPublish = { ...tour, version: 0 };
  const next = await overlaysStore.publishTutorial({ agencyId: currentAgencyId.value, routeName: routeName.value, tour: toPublish });
  // Sync draft to published (so builder reflects the actual published version).
  const cfg = next?.tutorial?.config;
  if (cfg && typeof cfg === 'object' && Array.isArray(cfg.steps)) {
    store.setTutorialDraftForRouteName(routeName.value, cfg);
  }
};

const refreshPublished = async () => {
  if (!routeName.value || !currentAgencyId.value) return;
  await overlaysStore.fetchRouteOverlays(currentAgencyId.value, routeName.value);
};

const loadPublishedTutorialIntoDraft = async () => {
  if (!routeName.value || !currentAgencyId.value) return;
  const latest = await overlaysStore.fetchRouteOverlays(currentAgencyId.value, routeName.value);
  const cfg = latest?.tutorial?.config || null;
  if (cfg && typeof cfg === 'object' && Array.isArray(cfg.steps)) {
    store.setTutorialDraftForRouteName(routeName.value, cfg);
  }
};

const removeStep = (idx) => {
  if (!routeName.value) return;
  const tour = draftTour.value;
  if (!tour) return;
  const nextSteps = (tour.steps || []).filter((_, i) => i !== idx);
  store.setTutorialDraftForRouteName(routeName.value, { ...tour, steps: nextSteps });
};

const move = (idx, delta) => {
  if (!routeName.value) return;
  const tour = draftTour.value;
  if (!tour) return;
  const arr = [...(tour.steps || [])];
  const j = idx + delta;
  if (j < 0 || j >= arr.length) return;
  const tmp = arr[idx];
  arr[idx] = arr[j];
  arr[j] = tmp;
  store.setTutorialDraftForRouteName(routeName.value, { ...tour, steps: arr });
};

const clearDraft = () => {
  if (!routeName.value) return;
  store.clearTutorialDraftForRouteName(routeName.value);
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback best-effort
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    } catch {
      // ignore
    }
  }
};

const copyStepJson = async () => {
  await copyText(JSON.stringify(toStep(), null, 2));
};

const copyTourJson = async () => {
  const tour = draftTour.value || { id: draft.tourId || `draft_${routeName.value.toLowerCase()}`, version: 1, steps: [] };
  await copyText(JSON.stringify(tour, null, 2));
};

const saveHelperDraft = () => {
  if (!routeName.value) return;
  store.setHelperDraftForRouteName(routeName.value, {
    enabled: !!helperDraft.enabled,
    imageUrl: helperDraft.imageUrl || null,
    message: helperDraft.message || null,
    position: helperDraft.position || 'bottom_right'
  });
};

const publishHelperDraft = async () => {
  if (!routeName.value || !currentAgencyId.value) return;
  const helper = store.getHelperDraftForRouteName(routeName.value);
  if (!helper) return;
  const next = await overlaysStore.publishHelper({ agencyId: currentAgencyId.value, routeName: routeName.value, helper });
  // Sync draft to published
  const cfg = next?.helper?.config;
  if (cfg && typeof cfg === 'object') {
    store.setHelperDraftForRouteName(routeName.value, cfg);
  }
};

const loadPublishedHelperIntoDraft = async () => {
  if (!routeName.value || !currentAgencyId.value) return;
  const latest = await overlaysStore.fetchRouteOverlays(currentAgencyId.value, routeName.value);
  const cfg = latest?.helper?.config || null;
  if (cfg && typeof cfg === 'object') {
    store.setHelperDraftForRouteName(routeName.value, cfg);
  }
};

const clearHelperDraft = () => {
  if (!routeName.value) return;
  store.clearHelperDraftForRouteName(routeName.value);
};

// ----- element picking -----
const cssEscape = (s) => {
  try {
    return CSS.escape(String(s));
  } catch {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
};

const uniqueSelector = (sel) => {
  try {
    return document.querySelectorAll(sel).length === 1;
  } catch {
    return false;
  }
};

const buildCssPath = (el) => {
  if (!el || el.nodeType !== 1) return '';

  // Prefer stable selectors if present
  const dt = el.getAttribute?.('data-tour');
  if (dt) return `[data-tour="${dt}"]`;
  const id = el.getAttribute?.('id');
  if (id && uniqueSelector(`#${cssEscape(id)}`)) return `#${cssEscape(id)}`;

  const parts = [];
  let node = el;
  let guard = 0;
  while (node && node.nodeType === 1 && node !== document.body && guard++ < 8) {
    const tag = String(node.tagName || '').toLowerCase();
    const parent = node.parentElement;
    if (!parent) break;

    // Use nth-of-type to disambiguate without relying on classes.
    const siblings = Array.from(parent.children).filter((c) => String(c.tagName || '').toLowerCase() === tag);
    const idx = siblings.indexOf(node) + 1;
    parts.unshift(`${tag}:nth-of-type(${idx})`);
    node = parent;
  }

  const sel = parts.join(' > ');
  return sel;
};

const onDocumentClickCapture = (e) => {
  if (!store.panelOpen || store.mode !== 'tutorial') return;
  if (!store.captureClicks) return;

  // Don’t allow interacting with the builder itself.
  const builderRoot = e.target?.closest?.('.builder-wrap');
  if (builderRoot) return;

  e.preventDefault();
  e.stopPropagation();

  const el = e.target;
  const sel = buildCssPath(el);
  if (sel) draft.selector = sel;
};

onMounted(() => {
  document.addEventListener('click', onDocumentClickCapture, true);
  // Best-effort: preload published overlays for current route/org.
  refreshPublished();
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClickCapture, true);
});
</script>

<style scoped>
.builder-wrap {
  position: fixed;
  right: 16px;
  top: 110px;
  width: 380px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 140px);
  overflow: auto;
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  /* Must sit above app modals (some use z-index 10000). */
  z-index: 20000;
  padding: 14px;
}

.builder-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.builder-title {
  font-weight: 900;
  color: var(--text-primary);
}

.builder-close {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  color: var(--text-primary);
}

.builder-subtitle {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.builder-tabs {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.tab {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  color: var(--text-primary);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  font-weight: 700;
}

.tab.active {
  background: white;
  border-color: var(--accent);
}

.builder-body {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chk {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
  font-weight: 700;
}

.hint {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.status {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
}
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}
.status-row:first-child {
  margin-top: 0;
}
.status-label {
  font-weight: 800;
  font-size: 12px;
  color: var(--text-secondary);
}
.status-val {
  font-size: 12px;
  color: var(--text-primary);
}
.dim {
  color: var(--text-secondary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field label {
  font-weight: 800;
  font-size: 12px;
  color: var(--text-secondary);
}
.field input, .field textarea, .field select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-primary);
}
.help {
  font-size: 12px;
  color: var(--text-secondary);
}

.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.draft {
  margin-top: 6px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.draft-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.draft-title {
  font-weight: 900;
  color: var(--text-primary);
}
.draft-actions {
  display: inline-flex;
  gap: 8px;
}

.step-list {
  margin: 10px 0 0;
  padding-left: 18px;
}
.step-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.step-line {
  font-size: 12px;
  color: var(--text-primary);
}
.step-line.dim {
  color: var(--text-secondary);
  margin-top: 4px;
}
.step-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.empty {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>

