<template>
  <div class="quick-actions">
    <div class="header">
      <h2>{{ title }}</h2>
      <button v-if="canCustomize" class="btn-customize" type="button" @click="showCustomizer = true">
        Customize
      </button>
    </div>

    <div class="actions-grid">
      <router-link
        v-for="action in selectedActions"
        :key="action.id"
        :to="action.to"
        class="action-card"
      >
        <img
          v-if="iconUrl(action) && !failedIconIds.has(String(action.id))"
          :src="iconUrl(action)"
          :alt="`${action.title} icon`"
          class="action-icon"
          @error="(e) => onIconError(action, e)"
        />
        <div v-else class="action-icon-placeholder">{{ action.emoji || '📌' }}</div>

        <div class="action-content">
          <h3>{{ action.title }}</h3>
          <p v-if="!compact">{{ action.description }}</p>
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

          <div class="list">
            <button
              v-for="action in filteredAvailableActions"
              :key="action.id"
              type="button"
              class="list-item"
              @click="toggle(action.id)"
            >
              <span class="check">
                <input
                  type="checkbox"
                  :checked="selectedIdsSet.has(action.id)"
                  @change.prevent
                  tabindex="-1"
                />
              </span>
              <span class="meta">
                <span class="name">{{ action.title }}</span>
                <span class="desc">{{ action.description }}</span>
              </span>
              <span class="tag">{{ action.category || 'General' }}</span>
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" type="button" @click="showCustomizer = false">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  title: { type: String, default: 'Quick Actions' },
  contextKey: { type: String, required: true }, // e.g. platform|agency
  actions: { type: Array, required: true }, // [{id,title,description,to,emoji,category,roles?,capabilities?,iconKey?}]
  defaultActionIds: { type: Array, default: () => [] },
  iconResolver: { type: Function, default: null }, // (action) => url|null
  compact: { type: Boolean, default: false } // icon + title only
});

const authStore = useAuthStore();

const showCustomizer = ref(false);
const search = ref('');

const userKey = computed(() => {
  const u = authStore.user || {};
  return String(u.id || u.email || 'unknown');
});

const storageKey = computed(() => `quickActions:${props.contextKey}:${userKey.value}`);

const canCustomize = computed(() => {
  const role = authStore.user?.role;
  return ['admin', 'support', 'super_admin', 'staff'].includes(role);
});

const hasCapability = (key) => {
  // Super admins should never have UI hidden due to missing/false capability flags.
  if (String(authStore.user?.role || '').toLowerCase() === 'super_admin') return true;
  const caps = authStore.user?.capabilities;
  if (!caps || typeof caps !== 'object') return true; // backward-compat
  if (Object.keys(caps).length === 0) return true;
  return !!caps?.[key];
};

const isAllowed = (action) => {
  const role = authStore.user?.role;
  const roles = Array.isArray(action.roles) ? action.roles : null;
  if (roles && !roles.includes(role)) return false;
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
  const defaults = (props.defaultActionIds || []).map(String).filter((id) => allowedIds.has(id));
  if (stored && stored.length > 0) {
    const cleaned = stored.filter((id) => allowedIds.has(String(id)));
    if (cleaned.length > 0) {
      // Keep user selection but auto-append any new defaults that weren't previously present.
      const set = new Set(cleaned);
      for (const d of defaults) set.add(d);
      selectedIds.value = Array.from(set);
      return;
    }
  }
  applyDefaults();
};

const toggle = (id) => {
  const key = String(id);
  const set = new Set(selectedIds.value);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  selectedIds.value = Array.from(set);
};

const resetDefaults = () => {
  applyDefaults();
  persist();
};

const filteredAvailableActions = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  if (!q) return availableActions.value;
  return availableActions.value.filter((a) => {
    const hay = `${String(a.title || '').toLowerCase()} ${String(a.description || '').toLowerCase()} ${String(a.category || '').toLowerCase()}`;
    return hay.includes(q);
  });
});

const selectedActions = computed(() => {
  const map = new Map(availableActions.value.map((a) => [String(a.id), a]));
  return (selectedIds.value || []).map((id) => map.get(String(id))).filter(Boolean);
});

onMounted(() => hydrate());

watch(availableActions, () => {
  // If availability changes (role/caps), reconcile selection.
  hydrate();
}, { deep: true });

watch(selectedIds, () => persist(), { deep: true });
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}

.btn-customize {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 800;
}

.btn-customize:hover {
  border-color: var(--primary);
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
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

.action-icon-placeholder {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  background: var(--bg-alt);
  border-radius: 8px;
  flex-shrink: 0;
  opacity: 0.7;
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

