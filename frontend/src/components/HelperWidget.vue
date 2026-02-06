<template>
  <div
    v-if="enabled"
    class="helper-root"
    :class="[positionClass, { drawer: isDrawer }]"
    :style="anchoredStyle"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <button
      type="button"
      class="helper-avatar"
      :style="{ width: `${avatarSizePx}px`, height: `${avatarSizePx}px` }"
      @click="open = !open; if (open) setDismissed(false)"
      :aria-expanded="open ? 'true' : 'false'"
    >
      <img v-if="resolvedImageUrl" :src="resolvedImageUrl" alt="Helper" />
      <span v-else aria-hidden="true">?</span>
    </button>

    <div
      v-if="isDrawer"
      class="helper-panel drawer-panel"
      :class="{ open }"
      @click.stop
    >
      <div class="helper-head">
        <div class="helper-title">Helper</div>
        <button
          type="button"
          class="helper-close"
          @click="open = false; setDismissed(true)"
          aria-label="Dismiss helper message"
        >×</button>
      </div>

      <div v-if="message" class="helper-msg">
        {{ message }}
      </div>

      <div class="helper-ai">
        <div class="helper-ai-title">Ask a question</div>
        <div v-if="activeAgentConfig">
          <input v-model="question" placeholder="Ask about this page..." />
          <div v-if="isSuperAdmin" class="helper-ai-row">
            <label class="helper-ai-chk">
              <input type="checkbox" v-model="useGoogleSearch" />
              Use Google Search (superadmin)
            </label>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="asking || !question.trim()" @click="answerStub">
            {{ asking ? 'Asking…' : 'Ask' }}
          </button>
          <div v-if="askError" class="helper-error">{{ askError }}</div>
          <div v-if="answer" class="helper-answer">{{ answer }}</div>
        </div>
        <div v-else class="helper-msg dim">
          (No agent configured here yet — enable one in Builder → Helper.)
        </div>
      </div>
    </div>

    <div v-else-if="open" class="helper-panel" @click.stop>
      <div class="helper-head">
        <div class="helper-title">Helper</div>
        <button
          type="button"
          class="helper-close"
          @click="open = false; setDismissed(true)"
          aria-label="Dismiss helper message"
        >×</button>
      </div>

      <div v-if="message" class="helper-msg">
        {{ message }}
      </div>

      <div class="helper-ai">
        <div class="helper-ai-title">Ask a question</div>
        <div v-if="activeAgentConfig">
          <input v-model="question" placeholder="Ask about this page..." />
          <div v-if="isSuperAdmin" class="helper-ai-row">
            <label class="helper-ai-chk">
              <input type="checkbox" v-model="useGoogleSearch" />
              Use Google Search (superadmin)
            </label>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="asking || !question.trim()" @click="answerStub">
            {{ asking ? 'Asking…' : 'Ask' }}
          </button>
          <div v-if="askError" class="helper-error">{{ askError }}</div>
          <div v-if="answer" class="helper-answer">{{ answer }}</div>
        </div>
        <div v-else class="helper-msg dim">
          (No agent configured here yet — enable one in Builder → Helper.)
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { useSuperadminBuilderStore } from '../store/superadminBuilder';
import { useAgencyStore } from '../store/agency';
import { useOrganizationStore } from '../store/organization';
import { useOverlaysStore } from '../store/overlays';
import api from '../services/api';
import { toUploadsUrl } from '../utils/uploadsUrl';

const AVATAR_SIZE_PX = 140;
const DISMISS_STORAGE_PREFIX = 'helperWidgetDismissed.v1';

const props = defineProps({
  // User-facing toggle (can be wired to user_preferences later)
  enabled: { type: Boolean, default: true }
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const builderStore = useSuperadminBuilderStore();
const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();
const overlaysStore = useOverlaysStore();

// "open" controls the message bubble, not the avatar itself.
const open = ref(true);
const question = ref('');
const answer = ref('');
const asking = ref(false);
const askError = ref('');
const useGoogleSearch = ref(false); // superadmin-only; backend enforces too

const routeName = computed(() => String(route.name || ''));
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');
const userRole = computed(() => String(authStore.user?.role || '').trim());
const currentAgencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});
const currentOrganizationId = computed(() => organizationStore.organizationContext?.id || null);

const helperConfig = computed(() => {
  // 1) Superadmin local draft override
  if (isSuperAdmin.value) {
    const draft = builderStore.getHelperDraftForRouteName(routeName.value);
    if (draft) return draft;
  }

  // 2) Published per-org config (best-effort; may not be loaded yet)
  if (currentAgencyId.value && routeName.value) {
    const cached = overlaysStore.getCached(currentAgencyId.value, routeName.value);
    const enabled = cached?.helper?.enabled !== false;
    const cfg = cached?.helper?.config || null;
    if (enabled && cfg && typeof cfg === 'object') return cfg;
  }

  // 3) No default: helper should only appear where configured.
  return null;
});

const placements = computed(() => (Array.isArray(helperConfig.value?.placements) ? helperConfig.value.placements : []));

const firstMatchingPlacement = computed(() => {
  for (const p of placements.value) {
    try {
      const sel = String(p?.selector || '').trim();
      if (!sel) continue;
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect?.();
      if (!r || r.width <= 0 || r.height <= 0) continue;
      return { ...p, __rect: r };
    } catch {
      // ignore
    }
  }
  return null;
});

const hasPlacementMatch = computed(() => !!firstMatchingPlacement.value);

const platformEnabled = computed(() => overlaysStore.platformHelper?.enabled !== false);
const visibleToRoles = computed(() => (Array.isArray(helperConfig.value?.visibleToRoles) ? helperConfig.value.visibleToRoles : []));
const forceEnabled = computed(() => helperConfig.value?.forceEnabled === true);
const roleAllowed = computed(() => {
  const list = visibleToRoles.value || [];
  if (!list.length) return true;
  return list.includes(userRole.value);
});

const userHelperEnabled = ref(true);

const loadUserHelperPreference = async () => {
  if (!authStore.user?.id) return;
  try {
    const resp = await api.get(`/users/${authStore.user.id}/preferences`, { skipGlobalLoading: true });
    const data = resp?.data || {};
    if ('helper_enabled' in data) {
      userHelperEnabled.value = data.helper_enabled !== false;
    }
  } catch {
  }
};

const didPrefetchUserPrefs = ref(false);
watch(
  () => [!!helperConfig.value, !!authStore.user?.id],
  async () => {
    if (!helperConfig.value || !authStore.user?.id) return;
    if (didPrefetchUserPrefs.value) return;
    didPrefetchUserPrefs.value = true;
    await loadUserHelperPreference();
  },
  { immediate: true }
);

const userPrefAllowed = computed(() => forceEnabled.value || userHelperEnabled.value !== false);

// If placements are defined, only show when a placement matches (ideal for modals / step UIs).
const enabled = computed(() => {
  if (!props.enabled) return false;
  if (!platformEnabled.value) return false;
  if (!helperConfig.value) return false;
  if (helperConfig.value.enabled === false) return false;
  if (!roleAllowed.value) return false;
  if (!userPrefAllowed.value) return false;
  if (placements.value.length > 0) return hasPlacementMatch.value;
  return true;
});

// Platform image is the source of truth, but only show it when helper is configured for this page.
const imageUrl = computed(() => (helperConfig.value ? (overlaysStore.platformHelper?.imageUrl || null) : null));
const helperImageUrl = computed(() => {
  const raw = helperConfig.value?.imageUrl;
  if (!raw) return null;
  return toUploadsUrl(String(raw));
});
const resolvedImageUrl = computed(() => helperImageUrl.value || imageUrl.value || null);

const message = computed(() => {
  if (!helperConfig.value) return '';
  const match = firstMatchingPlacement.value;
  if (match && match.message) return match.message;
  return helperConfig.value.message;
});

const activeAgentConfig = computed(() => {
  const p = firstMatchingPlacement.value;
  const fromPlacement = p?.agent && typeof p.agent === 'object' ? p.agent : null;
  if (fromPlacement?.enabled === true) return fromPlacement;
  const fromPage = helperConfig.value?.agent && typeof helperConfig.value.agent === 'object' ? helperConfig.value.agent : null;
  if (fromPage?.enabled === true) return fromPage;
  return null;
});

const uiVariant = computed(() => String(helperConfig.value?.uiVariant || 'bubble'));
const isDrawer = computed(() => uiVariant.value === 'drawer');
const openOnHover = computed(() => helperConfig.value?.openOnHover === true);
const avatarSizePx = computed(() => (isDrawer.value ? 56 : AVATAR_SIZE_PX));

const positionClass = computed(() =>
  helperConfig.value?.position === 'bottom_left' ? 'bottom-left' : 'bottom-right'
);

// Stationary helper: we keep the avatar fixed to a corner.
// Placements are used for *visibility* + optional message override (not positioning).
const anchoredStyle = computed(() => null);

const dismissKey = computed(() => {
  const rn = String(routeName.value || '').trim() || 'unknown';
  const sel = String(firstMatchingPlacement.value?.selector || '').trim() || 'page';
  return `${DISMISS_STORAGE_PREFIX}::${rn}::${sel}`;
});

const placementKey = computed(() => String(firstMatchingPlacement.value?.selector || '').trim() || 'page');

const isDismissed = () => {
  try {
    return localStorage.getItem(dismissKey.value) === '1';
  } catch {
    return false;
  }
};

const setDismissed = (v) => {
  try {
    if (v) localStorage.setItem(dismissKey.value, '1');
    else localStorage.removeItem(dismissKey.value);
  } catch {
    // ignore
  }
};

watch(
  () => [route.fullPath, firstMatchingPlacement.value?.selector, message.value, enabled.value, isDrawer.value, openOnHover.value, forceEnabled.value],
  () => {
    // Auto-open bubble for the current context unless user dismissed it.
    if (isDrawer.value || openOnHover.value) {
      open.value = false;
      return;
    }
    const dismissed = forceEnabled.value ? false : isDismissed();
    open.value = !!message.value && enabled.value && !dismissed;
  },
  { immediate: true }
);

watch(() => route.fullPath, () => {
  // Reset per-page "AI" stub state; bubble visibility handled by watcher above.
  question.value = '';
  answer.value = '';
  askError.value = '';
  useGoogleSearch.value = false;
  // Prefetch published helper config for this page (best-effort).
  if (currentAgencyId.value && routeName.value) {
    overlaysStore.fetchRouteOverlays(currentAgencyId.value, routeName.value);
  }
});

// Prefetch platform helper settings only when the helper is actually configured on this page,
// so providers don’t hit superadmin-only endpoints (and we avoid noise on login pages).
const didPrefetchPlatformHelper = ref(false);
watch(
  () => [!!helperConfig.value, !!enabled.value, !!isSuperAdmin.value],
  async () => {
    const shouldPrefetch = (!!helperConfig.value && !!enabled.value) || isSuperAdmin.value;
    if (!shouldPrefetch) return;
    if (didPrefetchPlatformHelper.value) return;
    didPrefetchPlatformHelper.value = true;
    try {
      await overlaysStore.fetchPlatformHelper();
    } catch {
      // best-effort
    }
  },
  { immediate: true }
);

const highlightSelector = (selector) => {
  const sel = String(selector || '').trim();
  if (!sel) return;
  let el = null;
  try {
    el = document.querySelector(sel);
  } catch {
    return;
  }
  if (!el) return;
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  } catch {
    // ignore
  }
  try {
    const prev = el.style.outline;
    const prevOffset = el.style.outlineOffset;
    el.style.outline = '4px solid rgba(99, 102, 241, 0.9)';
    el.style.outlineOffset = '3px';
    window.setTimeout(() => {
      try {
        el.style.outline = prev || '';
        el.style.outlineOffset = prevOffset || '';
      } catch {
        // ignore
      }
    }, 2500);
  } catch {
    // ignore
  }
};

const executeUiCommands = async (commands) => {
  const arr = Array.isArray(commands) ? commands : [];
  for (const cmd of arr) {
    const type = String(cmd?.type || '').trim();
    if (type === 'navigate') {
      const to = String(cmd?.to || '').trim();
      if (to) {
        try {
          await router.push(to);
        } catch {
          // ignore
        }
      }
    } else if (type === 'highlight') {
      highlightSelector(cmd?.selector);
    } else if (type === 'openHelper') {
      open.value = true;
      setDismissed(false);
    } else if (type === 'closeHelper') {
      open.value = false;
      setDismissed(true);
    }
  }
};

const askAgent = async () => {
  const q = String(question.value || '').trim();
  if (!q) return;
  if (!activeAgentConfig.value) {
    askError.value = 'No agent configured for this page/placement yet.';
    return;
  }
  asking.value = true;
  askError.value = '';
  answer.value = '';

  try {
    const resp = await api.post(
      '/agents/assist',
      {
        prompt: q,
        grounding: useGoogleSearch.value ? 'google_search' : '',
        agentConfig: activeAgentConfig.value,
        context: {
          routeName: routeName.value,
          placementKey: placementKey.value,
          agencyId: currentAgencyId.value || null,
          organizationId: currentOrganizationId.value || null
        }
      },
      { skipGlobalLoading: true }
    );
    const data = resp?.data || {};
    answer.value = String(data.assistantText || '').trim() || '(No response)';
    await executeUiCommands(data.uiCommands);
  } catch (e) {
    askError.value = String(e?.response?.data?.error?.message || e?.message || 'Assistant request failed');
  } finally {
    asking.value = false;
  }
};

onMounted(() => {});
onUnmounted(() => {
  if (hoverCloseTimer.value) {
    clearTimeout(hoverCloseTimer.value);
    hoverCloseTimer.value = null;
  }
});

const hoverCloseTimer = ref(null);
const handleMouseEnter = () => {
  if (!openOnHover.value) return;
  if (hoverCloseTimer.value) {
    clearTimeout(hoverCloseTimer.value);
    hoverCloseTimer.value = null;
  }
  open.value = true;
  setDismissed(false);
};
const handleMouseLeave = () => {
  if (!openOnHover.value) return;
  if (hoverCloseTimer.value) clearTimeout(hoverCloseTimer.value);
  hoverCloseTimer.value = setTimeout(() => {
    open.value = false;
  }, 200);
};

const answerStub = () => askAgent();
</script>

<style scoped>
.helper-root {
  position: fixed;
  bottom: 18px;
  /* Must sit above app modals (some use z-index 10000). */
  z-index: 19000;
}
.helper-root.bottom-right { right: 18px; }
.helper-root.bottom-left { left: 18px; }
.helper-root.drawer {
  right: 0;
  bottom: 0;
  top: 0;
}
.helper-root.drawer .helper-avatar {
  position: fixed;
  right: 16px;
  bottom: 18px;
}

.helper-avatar {
  width: 140px;
  height: 140px;
  border-radius: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}
.helper-avatar img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.helper-panel {
  width: 320px;
  max-width: calc(100vw - 36px);
  margin-top: 10px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  padding: 12px;
}

.drawer-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(380px, 92vw);
  margin: 0;
  border-radius: 0;
  transform: translateX(100%);
  transition: transform 180ms ease;
  box-shadow: var(--shadow-lg);
}
.drawer-panel.open {
  transform: translateX(0);
}

.helper-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.helper-title {
  font-weight: 900;
  color: var(--text-primary);
}
.helper-close {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-alt);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  color: var(--text-primary);
}
.helper-msg {
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.35;
}
.helper-msg.dim {
  color: var(--text-secondary);
}

.helper-ai {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.helper-ai-row {
  margin: 8px 0;
}
.helper-ai-chk {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}
.helper-error {
  margin-top: 8px;
  font-size: 12px;
  color: #b91c1c;
}
.helper-ai-title {
  font-weight: 800;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.helper-ai input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 8px;
}
.helper-answer {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>

