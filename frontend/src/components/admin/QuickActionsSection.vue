<template>
  <div class="quick-actions" :class="{ compact, dense }">
    <div class="header">
      <h2>{{ title }}</h2>
      <div class="header-controls">
        <button
          v-if="hasFrequencyData"
          class="btn-sort-freq"
          :class="{ active: sortByFreq }"
          type="button"
          :title="sortByFreq ? 'Restore custom order' : 'Sort by most used'"
          @click="sortByFreq = !sortByFreq"
        >
          {{ sortByFreq ? '↕ Custom order' : '🔥 Most used' }}
        </button>
        <button v-if="canCustomize" class="btn-customize" type="button" @click="showCustomizer = true">
          Customize
        </button>
      </div>
    </div>

    <!-- Heat legend -->
    <div v-if="hasFrequencyData" class="heat-legend">
      <span class="heat-legend-label">Usage this month:</span>
      <span
        v-for="level in HEAT_LEVELS"
        :key="level.level"
        class="heat-legend-swatch"
        :style="{ background: level.bg, borderColor: level.border, color: level.text }"
        :title="level.desc"
      >{{ level.label }}</span>
    </div>

    <div class="actions-grid">
      <router-link
        v-for="action in displayedActions"
        :key="action.id"
        :to="action.to"
        class="action-card"
        :class="`heat-${heatLevel(action.id)}`"
        :style="heatStyle(action.id)"
        @click="trackActionClick(action)"
      >
        <div class="action-icon-wrap">
          <img
            v-if="iconUrl(action) && !failedIconIds.has(String(action.id))"
            :src="iconUrl(action)"
            :alt="`${action.title} icon`"
            class="action-icon"
            @error="(e) => onIconError(action, e)"
          />
          <div v-else class="action-icon-placeholder">{{ action.emoji || '📌' }}</div>
          <span
            v-if="(badgeCounts[action.id] || 0) > 0"
            class="action-badge"
          >
            {{ badgeCounts[action.id] > 99 ? '99+' : badgeCounts[action.id] }}
          </span>
        </div>

        <div class="action-content">
          <h3>{{ action.title }}</h3>
          <p v-if="!compact">{{ action.description }}</p>
          <span v-if="heatLevel(action.id) > 0" class="heat-count-label">
            {{ frequencies[action.id] || 0 }}× this month
          </span>
        </div>
      </router-link>
    </div>

    <!-- Customizer modal -->
    <div v-if="showCustomizer" class="modal-overlay" @click.self="showCustomizer = false">
      <div class="modal">
        <div class="modal-header">
          <h3>Quick Actions</h3>
          <button class="btn-close" type="button" @click="showCustomizer = false" aria-label="Close">×</button>
        </div>

        <div class="modal-body">
          <div class="controls">
            <input v-model="search" class="input" type="text" placeholder="Search all available cards…" />
            <button class="btn-secondary" type="button" @click="resetDefaults">Reset defaults</button>
          </div>

          <div class="section-label">
            On your dashboard
            <span class="hint">Use ↑ ↓ to reorder</span>
          </div>
          <div v-if="!selectedActions.length" class="empty-selected">No actions selected yet.</div>
          <div v-else class="list selected-list">
            <div
              v-for="(action, index) in selectedActions"
              :key="`sel-${action.id}`"
              class="list-item selected-item"
            >
              <div class="reorder">
                <button
                  type="button"
                  class="reorder-btn"
                  :disabled="index === 0"
                  aria-label="Move up"
                  @click.stop="move(action.id, -1)"
                >↑</button>
                <button
                  type="button"
                  class="reorder-btn"
                  :disabled="index === selectedActions.length - 1"
                  aria-label="Move down"
                  @click.stop="move(action.id, 1)"
                >↓</button>
              </div>
              <span class="meta">
                <span class="name">{{ action.title }}</span>
                <span class="desc">{{ action.description }}</span>
              </span>
              <span class="tag">{{ action.category || 'General' }}</span>
              <button
                type="button"
                class="remove-btn"
                aria-label="Remove"
                @click.stop="toggle(action.id)"
              >Remove</button>
            </div>
          </div>

          <div class="section-label available-label">Available actions</div>
          <div class="list">
            <button
              v-for="action in filteredUnselectedActions"
              :key="action.id"
              type="button"
              class="list-item"
              @click="toggle(action.id)"
            >
              <span class="check add-mark">+</span>
              <span class="meta">
                <span class="name">{{ action.title }}</span>
                <span class="desc">{{ action.description }}</span>
              </span>
              <span class="tag">{{ action.category || 'General' }}</span>
            </button>
            <div v-if="!filteredUnselectedActions.length" class="empty-selected">
              {{ search ? 'No matching actions.' : 'All available actions are already selected.' }}
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-done" type="button" @click="showCustomizer = false">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { fireTabEvent } from '../../utils/tabEventBeacon.js';

// ── Heat-map level definitions ────────────────────────────────────────
// Level 0 = white (never / ≤1 click/month)
// Levels 1–5 = progressively darker greens
const HEAT_LEVELS = [
  { level: 0, min: 0,  max: 1,   label: '≤1×',    desc: 'Never or rarely used (0–1 clicks/month)',           bg: '#ffffff', border: '#e5e7eb', text: '#6b7280' },
  { level: 1, min: 2,  max: 5,   label: '2–5×',   desc: 'Occasional — a few times this month',               bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  { level: 2, min: 6,  max: 14,  label: '6–14×',  desc: 'Regular — roughly once or twice a week',            bg: '#bbf7d0', border: '#4ade80', text: '#15803d' },
  { level: 3, min: 15, max: 29,  label: '15–29×', desc: 'Frequent — multiple times per week',                bg: '#4ade80', border: '#16a34a', text: '#14532d' },
  { level: 4, min: 30, max: 59,  label: '30–59×', desc: 'Heavy use — daily or near-daily',                   bg: '#16a34a', border: '#14532d', text: '#ffffff' },
  { level: 5, min: 60, max: Infinity, label: '60+×', desc: 'Power tool — used constantly (60+ times/month)', bg: '#14532d', border: '#052e16', text: '#ffffff' },
];

const props = defineProps({
  title: { type: String, default: 'Quick Actions' },
  contextKey: { type: String, required: true },
  actions: { type: Array, required: true },
  defaultActionIds: { type: Array, default: () => [] },
  iconResolver: { type: Function, default: null },
  compact: { type: Boolean, default: false },
  dense: { type: Boolean, default: false },
  badgeCounts: { type: Object, default: () => ({}) },
  /** { actionId: clickCount } — drives heatmap coloring */
  frequencies: { type: Object, default: () => ({}) },
  /** Page key used when tracking clicks (e.g. 'admin-dashboard') */
  trackingPage: { type: String, default: 'admin-dashboard' },
});

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const showCustomizer = ref(false);
const search = ref('');

const userKey = computed(() => {
  const u = authStore.user || {};
  return String(u.id || u.email || 'unknown');
});

/** Per user + per tenant (or platform when no agency selected). */
const agencyKey = computed(() => {
  const id = agencyStore.currentAgency?.id;
  return id ? `agency-${id}` : 'platform';
});

const storageKey = computed(
  () => `quickActions:${props.contextKey}:${agencyKey.value}:${userKey.value}`
);

/** Legacy key (pre per-tenant) — used once as a fall-forward for the current tenant. */
const legacyStorageKey = computed(() => `quickActions:${props.contextKey}:${userKey.value}`);

const canCustomize = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return [
    'admin',
    'support',
    'super_admin',
    'superadmin',
    'staff',
    'provider_plus',
    'clinical_practice_assistant'
  ].includes(role);
});

const hasCapability = (key) => {
  // Super admins should never have UI hidden due to missing/false capability flags.
  if (String(authStore.user?.role || '').toLowerCase() === 'super_admin') return true;
  const caps = authStore.user?.capabilities;
  if (!caps || typeof caps !== 'object') return true; // backward-compat
  if (Object.keys(caps).length === 0) return true;
  return !!caps?.[key];
};

const hasSubCoordinatorAccess = computed(() => {
  const u = authStore.user || {};
  return (
    u.has_skill_builder_coordinator_access === true ||
    u.has_skill_builder_coordinator_access === 1 ||
    u.has_skill_builder_coordinator_access === '1'
  );
});

const isAllowed = (action) => {
  const role = authStore.user?.role;
  const roles = Array.isArray(action.roles) ? action.roles : null;
  const allowSubCoordinator = action?.allowSubCoordinator === true;
  if (roles && !roles.includes(role) && !(allowSubCoordinator && hasSubCoordinatorAccess.value)) return false;
  const caps = Array.isArray(action.capabilities) ? action.capabilities : null;
  if (caps && !caps.every((c) => hasCapability(c))) return false;
  return true;
};

const availableActions = computed(() => (props.actions || []).filter(isAllowed));

const selectedIds = ref([]);

const selectedIdsSet = computed(() => new Set(selectedIds.value || []));

// If an icon URL 404s (or otherwise fails to load), we fall back to the emoji placeholder.
// Previously we hid the <img> element, which left the card looking blank.
const failedIconIds = ref(new Set());

const iconUrl = (action) => {
  try {
    if (typeof props.iconResolver === 'function') return props.iconResolver(action);
  } catch {
    // ignore
  }
  return null;
};

const onIconError = (action, event) => {
  try {
    failedIconIds.value.add(String(action?.id));
    // best-effort debugging
    console.warn('[QuickActions] Icon failed to load', {
      actionId: action?.id,
      title: action?.title,
      src: event?.target?.src
    });
  } catch {
    // ignore
  }
};

const persist = () => {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify({ selectedIds: selectedIds.value }));
  } catch {
    // ignore
  }
};

const load = () => {
  try {
    const raw = localStorage.getItem(storageKey.value);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.selectedIds)) return parsed.selectedIds.map(String);
    }
    // One-time fall-forward from pre-tenant keys so existing customizations aren't lost.
    const legacyRaw = localStorage.getItem(legacyStorageKey.value);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed?.selectedIds)) {
        const ids = parsed.selectedIds.map(String);
        try {
          localStorage.setItem(storageKey.value, JSON.stringify({ selectedIds: ids }));
        } catch {
          // ignore
        }
        return ids;
      }
    }
  } catch {
    // ignore
  }
  return null;
};

const applyDefaults = () => {
  const allowedIds = new Set(availableActions.value.map((a) => String(a.id)));
  const defaults = (props.defaultActionIds || []).map(String).filter((id) => allowedIds.has(id));
  selectedIds.value = defaults.length > 0 ? defaults : Array.from(allowedIds).slice(0, 8);
};

const hydrate = () => {
  const stored = load();
  const allowedIds = new Set(availableActions.value.map((a) => String(a.id)));
  if (stored && stored.length > 0) {
    const cleaned = stored.map(String).filter((id) => allowedIds.has(id));
    if (cleaned.length > 0) {
      // Preserve saved order/selection — do not force-append new defaults.
      selectedIds.value = cleaned;
      return;
    }
  }
  applyDefaults();
};

const toggle = (id) => {
  const key = String(id);
  const current = [...(selectedIds.value || [])].map(String);
  const idx = current.indexOf(key);
  if (idx >= 0) current.splice(idx, 1);
  else current.push(key);
  selectedIds.value = current;
};

const move = (id, delta) => {
  const key = String(id);
  const list = [...(selectedIds.value || [])].map(String);
  const idx = list.indexOf(key);
  if (idx < 0) return;
  const next = idx + delta;
  if (next < 0 || next >= list.length) return;
  const tmp = list[idx];
  list[idx] = list[next];
  list[next] = tmp;
  selectedIds.value = list;
};

const resetDefaults = () => {
  applyDefaults();
  persist();
};

const filteredUnselectedActions = computed(() => {
  const selected = selectedIdsSet.value;
  const q = String(search.value || '').trim().toLowerCase();
  return availableActions.value.filter((a) => {
    if (selected.has(String(a.id))) return false;
    if (!q) return true;
    const hay = `${String(a.title || '').toLowerCase()} ${String(a.description || '').toLowerCase()} ${String(a.category || '').toLowerCase()}`;
    return hay.includes(q);
  });
});

const selectedActions = computed(() => {
  const map = new Map(availableActions.value.map((a) => [String(a.id), a]));
  return (selectedIds.value || []).map((id) => map.get(String(id))).filter(Boolean);
});

const badgeCounts = computed(() => props.badgeCounts && typeof props.badgeCounts === 'object' ? props.badgeCounts : {});

// ── Heatmap ────────────────────────────────────────────────────────────
const sortByFreq = ref(false);

const hasFrequencyData = computed(
  () => props.frequencies && Object.keys(props.frequencies).length > 0
);

const displayedActions = computed(() => {
  if (!sortByFreq.value || !hasFrequencyData.value) return selectedActions.value;
  return [...selectedActions.value].sort((a, b) => {
    const fa = Number(props.frequencies[a.id] || 0);
    const fb = Number(props.frequencies[b.id] || 0);
    return fb - fa;
  });
});

function heatLevel(actionId) {
  const count = Number(props.frequencies?.[actionId] || 0);
  for (let i = HEAT_LEVELS.length - 1; i >= 0; i--) {
    if (count >= HEAT_LEVELS[i].min) return HEAT_LEVELS[i].level;
  }
  return 0;
}

function heatStyle(actionId) {
  const level = heatLevel(actionId);
  if (level === 0) return {};
  const def = HEAT_LEVELS[level];
  return {
    background: def.bg,
    borderColor: def.border,
    color: def.text,
  };
}

function trackActionClick(action) {
  if (!props.trackingPage || !action?.id) return;
  fireTabEvent({
    page: props.trackingPage,
    tab: action.id,
    actionType: 'admin_action',
  });
}

onMounted(() => hydrate());

watch(availableActions, () => {
  // If availability changes (role/caps), reconcile selection.
  hydrate();
}, { deep: true });

watch(storageKey, () => {
  // Tenant switch — reload that tenant's saved quick actions.
  hydrate();
});

watch(selectedIds, () => persist(), { deep: true });

const openCustomizer = () => {
  showCustomizer.value = true;
};

defineExpose({ openCustomizer });
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-customize {
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 700;
  font-size: 12px;
}
.btn-customize:hover { border-color: var(--primary); }

.btn-sort-freq {
  padding: 5px 11px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  cursor: pointer;
  font-weight: 700;
  font-size: 12px;
  transition: background 0.12s, border-color 0.12s;
}
.btn-sort-freq:hover { border-color: #16a34a; color: #15803d; background: #f0fdf4; }
.btn-sort-freq.active { background: #dcfce7; border-color: #4ade80; color: #15803d; }

/* Heat legend */
.heat-legend {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.heat-legend-label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  margin-right: 3px;
  white-space: nowrap;
}
.heat-legend-swatch {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  cursor: default;
}

/* Per-card heat label */
.heat-count-label {
  display: block;
  margin-top: 3px;
  font-size: 10px;
  font-weight: 700;
  opacity: 0.75;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.quick-actions.compact .actions-grid {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.action-card {
  background: white;
  padding: 32px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 20px;
}

.quick-actions.compact .action-card {
  padding: 18px 20px;
  gap: 16px;
}

.quick-actions.compact .action-icon,
.quick-actions.compact .action-icon-placeholder {
  width: 48px;
  height: 48px;
}

.quick-actions.compact .action-icon-placeholder {
  font-size: 24px;
}

.quick-actions.compact .action-card h3 {
  font-size: 14px;
  line-height: 1.3;
  margin-bottom: 0;
}

.quick-actions.dense .header {
  margin-bottom: 6px;
}
.quick-actions.dense .heat-legend {
  margin-bottom: 8px;
}
.quick-actions.dense .header h2 {
  font-size: 0.95rem;
}
.quick-actions.dense .btn-customize {
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 8px;
}
.quick-actions.dense .actions-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}
.quick-actions.dense .action-card {
  padding: 8px 10px;
  gap: 8px;
  border-radius: 10px;
  box-shadow: none;
}
.quick-actions.dense .action-card:hover {
  transform: none;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--primary, #1f6b4a) 12%, transparent);
}
.quick-actions.dense.compact .action-card {
  padding: 7px 8px;
  gap: 7px;
}
.quick-actions.dense.compact .action-icon,
.quick-actions.dense.compact .action-icon-placeholder {
  width: 28px;
  height: 28px;
}
.quick-actions.dense.compact .action-icon-placeholder {
  font-size: 15px;
  border-radius: 6px;
}
.quick-actions.dense.compact .action-card h3 {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}
.quick-actions.dense .action-badge {
  min-width: 16px;
  height: 16px;
  font-size: 9px;
  top: -4px;
  right: -4px;
  border-width: 1px;
}
@media (max-width: 1200px) {
  .quick-actions.dense .actions-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 900px) {
  .quick-actions.dense .actions-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .quick-actions.dense .actions-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.action-icon {
  width: 64px;
  height: 64px;
  object-fit: contain;
  flex-shrink: 0;
}

.action-icon-wrap {
  position: relative;
  flex-shrink: 0;
}

.action-icon-placeholder {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  background: var(--bg-alt);
  border-radius: 8px;
  opacity: 0.7;
}

.action-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ef4444;
  color: white;
  font-size: 12px;
  font-weight: 800;
  border-radius: 999px;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.action-content {
  flex: 1;
  min-width: 0;
}

.action-card h3 {
  color: var(--text-primary);
  margin: 0 0 10px 0;
  font-weight: 800;
}

.action-card p {
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1400;
}

.modal {
  width: 96%;
  max-width: 980px;
  max-height: 90vh;
  overflow: hidden;
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 16px 18px;
  overflow: auto;
}

.controls {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.btn-secondary {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  cursor: pointer;
  font-weight: 800;
}

.section-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 4px 0 8px;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}
.section-label .hint {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
  color: #94a3b8;
}
.available-label { margin-top: 18px; }
.empty-selected {
  font-size: 13px;
  color: #94a3b8;
  padding: 10px 4px 14px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.list-item {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  width: 100%;
}

.list-item.selected-item {
  grid-template-columns: 44px 1fr auto auto;
  cursor: default;
}

.list-item:hover {
  border-color: var(--primary);
  background: #f8fafc;
}

.check {
  display: flex;
  align-items: center;
  justify-content: center;
}
.add-mark {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-weight: 800;
  color: var(--primary);
}
.reorder {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.reorder-btn, .remove-btn {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 800;
  color: var(--text-primary);
}
.reorder-btn {
  width: 28px;
  height: 22px;
  line-height: 1;
  padding: 0;
}
.reorder-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.remove-btn {
  padding: 6px 10px;
  font-size: 12px;
  white-space: nowrap;
}
.remove-btn:hover {
  border-color: #fca5a5;
  color: #b91c1c;
}
.btn-done {
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  background: var(--primary, #1f6b4a);
  color: #fff;
  cursor: pointer;
  font-weight: 800;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  font-weight: 900;
  color: var(--text-primary);
}

.desc {
  color: var(--text-secondary);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  background: var(--bg-alt);
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.modal-footer {
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}
</style>

