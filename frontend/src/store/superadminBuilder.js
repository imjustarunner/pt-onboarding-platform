import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

const STORAGE_KEY = 'superadminBuilderDrafts.v1';

const safeParse = (raw, fallback) => {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

const loadAllDrafts = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = safeParse(raw, {});
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveAllDrafts = (drafts) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts || {}));
  } catch {
    // ignore
  }
};

export const useSuperadminBuilderStore = defineStore('superadminBuilder', () => {
  const panelOpen = ref(false);
  const mode = ref('tutorial'); // 'tutorial' | 'helper'
  const captureClicks = ref(false);

  // Drafts are keyed by route.name (string)
  const drafts = ref(loadAllDrafts());

  const getDraftForRouteName = (routeName) => {
    const key = String(routeName || '').trim();
    if (!key) return null;
    const d = drafts.value?.[key];
    return d && typeof d === 'object' ? d : null;
  };

  const getTutorialDraftForRouteName = (routeName) => {
    const d = getDraftForRouteName(routeName);
    const t = d?.tutorial;
    if (!t || typeof t !== 'object') return null;
    const steps = Array.isArray(t.steps) ? t.steps : [];
    const version = typeof t.version === 'number' ? t.version : 1;
    const id = String(t.id || '').trim() || `draft_${String(routeName || '').toLowerCase()}`;
    return { id, version, steps };
  };

  const setTutorialDraftForRouteName = (routeName, nextTour) => {
    const key = String(routeName || '').trim();
    if (!key) return;
    const prev = getDraftForRouteName(key) || {};
    const tutorial = {
      id: nextTour?.id || prev?.tutorial?.id,
      version: typeof nextTour?.version === 'number' ? nextTour.version : (prev?.tutorial?.version || 1),
      steps: Array.isArray(nextTour?.steps) ? nextTour.steps : (prev?.tutorial?.steps || [])
    };
    const next = { ...prev, tutorial };
    drafts.value = { ...(drafts.value || {}), [key]: next };
    saveAllDrafts(drafts.value);
  };

  const clearTutorialDraftForRouteName = (routeName) => {
    const key = String(routeName || '').trim();
    if (!key) return;
    const prev = getDraftForRouteName(key);
    if (!prev) return;
    const next = { ...prev };
    delete next.tutorial;
    drafts.value = { ...(drafts.value || {}), [key]: next };
    saveAllDrafts(drafts.value);
  };

  const getHelperDraftForRouteName = (routeName) => {
    const d = getDraftForRouteName(routeName);
    const h = d?.helper;
    if (!h || typeof h !== 'object') return null;
    const agent = h.agent && typeof h.agent === 'object'
      ? {
          enabled: h.agent.enabled === true,
          systemPrompt: String(h.agent.systemPrompt || '').trim() || null,
          allowedTools: Array.isArray(h.agent.allowedTools) ? h.agent.allowedTools : []
        }
      : { enabled: false, systemPrompt: null, allowedTools: [] };
    const placements = Array.isArray(h.placements)
      ? h.placements
          .map((p) => {
            const selector = String(p?.selector || '').trim();
            if (!selector) return null;
            const side = String(p?.side || 'right');
            const sideNorm = ['right', 'left', 'top', 'bottom'].includes(side) ? side : 'right';
            const msg = p?.message == null ? null : String(p.message);
            const pa = p?.agent && typeof p.agent === 'object'
              ? {
                  enabled: p.agent.enabled === true,
                  systemPrompt: String(p.agent.systemPrompt || '').trim() || null,
                  allowedTools: Array.isArray(p.agent.allowedTools) ? p.agent.allowedTools : []
                }
              : null;
            return { selector, side: sideNorm, message: msg, agent: pa };
          })
          .filter(Boolean)
      : [];

    return {
      enabled: h.enabled !== false,
      message: String(h.message || '').trim() || null,
      position: String(h.position || 'bottom_right'), // bottom_right | bottom_left
      imageUrl: h.imageUrl == null ? null : String(h.imageUrl),
      uiVariant: String(h.uiVariant || 'bubble'),
      openOnHover: h.openOnHover === true,
      forceEnabled: h.forceEnabled === true,
      visibleToRoles: Array.isArray(h.visibleToRoles) ? h.visibleToRoles : [],
      agent,
      placements
    };
  };

  const setHelperDraftForRouteName = (routeName, helper) => {
    const key = String(routeName || '').trim();
    if (!key) return;
    const prev = getDraftForRouteName(key) || {};
    const nextHelper = {
      enabled: helper?.enabled !== false,
      message: helper?.message || null,
      position: helper?.position || 'bottom_right',
      imageUrl: helper?.imageUrl || null,
      uiVariant: helper?.uiVariant || 'bubble',
      openOnHover: helper?.openOnHover === true,
      forceEnabled: helper?.forceEnabled === true,
      visibleToRoles: Array.isArray(helper?.visibleToRoles) ? helper.visibleToRoles : (prev?.helper?.visibleToRoles || []),
      agent: helper?.agent || prev?.helper?.agent || { enabled: false, systemPrompt: null, allowedTools: [] },
      placements: Array.isArray(helper?.placements) ? helper.placements : (prev?.helper?.placements || [])
    };
    const next = { ...prev, helper: nextHelper };
    drafts.value = { ...(drafts.value || {}), [key]: next };
    saveAllDrafts(drafts.value);
  };

  const clearHelperDraftForRouteName = (routeName) => {
    const key = String(routeName || '').trim();
    if (!key) return;
    const prev = getDraftForRouteName(key);
    if (!prev) return;
    const next = { ...prev };
    delete next.helper;
    drafts.value = { ...(drafts.value || {}), [key]: next };
    saveAllDrafts(drafts.value);
  };

  const setPanelOpen = (next) => {
    panelOpen.value = !!next;
    if (!panelOpen.value) captureClicks.value = false;
  };

  const togglePanel = () => setPanelOpen(!panelOpen.value);

  const setMode = (next) => {
    if (next === 'tutorial' || next === 'helper') mode.value = next;
  };

  const setCaptureClicks = (next) => {
    captureClicks.value = !!next;
  };

  const hasAnyDrafts = computed(() => Object.keys(drafts.value || {}).length > 0);

  return {
    panelOpen,
    mode,
    captureClicks,
    drafts,
    hasAnyDrafts,
    getDraftForRouteName,
    getTutorialDraftForRouteName,
    setTutorialDraftForRouteName,
    clearTutorialDraftForRouteName,
    getHelperDraftForRouteName,
    setHelperDraftForRouteName,
    clearHelperDraftForRouteName,
    setPanelOpen,
    togglePanel,
    setMode,
    setCaptureClicks
  };
});

