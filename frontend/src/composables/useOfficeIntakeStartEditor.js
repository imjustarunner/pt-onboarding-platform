import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import {
  JOIN_FONT_HREF,
  alignBlockStyle,
  clampOffsetValue,
  defaultIntakeStartLayout,
  localizeOfficeStartCopy,
  mergeIntakeStartLayout,
  normalizeAlign,
  readJoinLandingCache,
  restoreJoinWelcomeCopy,
  writeJoinLandingCache
} from '../utils/joinLandingTemplate.js';

const START_ALIGN_OPTIONS = [
  { id: 'left', label: 'Align left', glyph: '⇤' },
  { id: 'center', label: 'Center', glyph: '↔' },
  { id: 'right', label: 'Align right', glyph: '⇥' }
];

const START_BLOCK_LABELS = {
  logo: 'Logo',
  tagline: 'Tagline',
  script: 'Script line',
  values: 'Value list',
  help: 'Need help card',
  welcome: 'Welcome line',
  glad: 'Note under welcome',
  card: 'Intake card'
};

const START_SIZE_CONTROLS = {
  welcome: { key: 'welcome', label: 'Welcome size', min: 0.8, max: 7, step: 0.05 },
  glad: { key: 'glad', label: 'Note size', min: 0.7, max: 3, step: 0.05 },
  logo: { key: 'logoWidth', label: 'Logo size', min: 48, max: 360, step: 4 },
  tagline: { key: 'tagline', label: 'Tagline size', min: 0.5, max: 1.4, step: 0.02 },
  script: { key: 'script', label: 'Script size', min: 0.8, max: 4, step: 0.05 },
  values: { key: 'values', label: 'List size', min: 0.65, max: 1.4, step: 0.02 },
  help: { key: 'helpWidth', label: 'Card width', min: 120, max: 340, step: 5 }
};

const START_BLOCK_SELECTOR =
  '.intake-start-card, .intake-start-welcome-block, .intake-start-glad-block, .intake-start-block';

function blankStartCopy(source = {}, agencyName = 'ITSCO', t = (k) => k) {
  const c = source && typeof source === 'object' ? source : {};
  const restored = restoreJoinWelcomeCopy(c, agencyName);
  return {
    welcomeTitle: restored.welcomeTitle,
    welcomeGlad: restored.welcomeGlad,
    sidebarTagline: String(c.sidebarTagline || 'HEAL • GROW • THRIVE').trim(),
    sidebarScript: String(c.sidebarScript || "You're Not Alone.").trim(),
    value1: /non-?judgmental/i.test(c.value1 || '') ? 'Supportive & Welcoming' : String(c.value1 || 'Supportive & Welcoming').trim(),
    value2: String(c.value2 || 'Personalized to Your Needs').trim(),
    value3: String(c.value3 || 'Focused on Growth & Well-Being').trim(),
    helpTitle: String(c.helpTitle || 'Need Help?').trim(),
    helpBody: String(c.helpBody || "We're here for you.").trim(),
    sendMessage: String(c.sendMessage || 'Send Us a Message').trim(),
    startTitle: String(c.startTitle || t('letsGetIntakeStarted')).trim(),
    startLead: String(c.startLead || t('letsGetIntakeStartedLead')).trim()
  };
}

export function useOfficeIntakeStartEditor({
  joinLandingCopy,
  agencyInfo,
  referralAgencySlug,
  joinThemeUrl,
  t,
  intakeLocale
}) {
  const authStore = useAuthStore();
  const editingStartLayout = ref(false);
  const savingStartLayout = ref(false);
  const startLayoutError = ref('');
  const startLayoutOk = ref('');
  const selectedStartBlock = ref('');
  const intakeStartLayout = reactive(mergeIntakeStartLayout(null));
  const startLayoutDraft = reactive(mergeIntakeStartLayout(null));
  const startCopyDraft = reactive(blankStartCopy({}, 'ITSCO', t));
  let startDragState = null;
  let startResizeState = null;
  let startLayoutOkTimer = null;

  const agencyName = computed(() =>
    String(agencyInfo.value?.official_name || agencyInfo.value?.name || 'ITSCO').trim() || 'ITSCO'
  );

  const startCopy = computed(() => (
    editingStartLayout.value
      ? { ...startCopyDraft }
      : localizeOfficeStartCopy(blankStartCopy(joinLandingCopy.value, agencyName.value, t), intakeLocale.value)
  ));

  const activeStartLayout = computed(() => (
    editingStartLayout.value ? startLayoutDraft : intakeStartLayout
  ));

  const canEditOfficeStart = computed(() => {
    if (!authStore.isAuthenticated) return false;
    const role = String(authStore.user?.role || '').toLowerCase();
    return role === 'admin' || role === 'super_admin';
  });

  const selectedStartBlockLabel = computed(() => (
    selectedStartBlock.value
      ? START_BLOCK_LABELS[selectedStartBlock.value] || selectedStartBlock.value
      : 'Click a block to edit it'
  ));
  const selectedStartSizeControl = computed(() => START_SIZE_CONTROLS[selectedStartBlock.value] || null);
  const selectedStartSizeKey = computed(() => selectedStartSizeControl.value?.key || '');
  const selectedStartSizeLabel = computed(() => selectedStartSizeControl.value?.label || '');
  const selectedStartSizeMin = computed(() => selectedStartSizeControl.value?.min ?? 0);
  const selectedStartSizeMax = computed(() => selectedStartSizeControl.value?.max ?? 1);
  const selectedStartSizeStep = computed(() => selectedStartSizeControl.value?.step ?? 0.05);

  function isStartHidden(key) {
    return activeStartLayout.value.hidden?.[key] === true;
  }

  function officeStartAlign(key) {
    const fallback = defaultIntakeStartLayout().align[key] || 'left';
    return normalizeAlign(activeStartLayout.value.align?.[key], fallback);
  }

  function setOfficeStartAlign(key, align) {
    if (!editingStartLayout.value || !key) return;
    if (!startLayoutDraft.align) startLayoutDraft.align = {};
    startLayoutDraft.align[key] = normalizeAlign(align);
  }

  function officeStartBlockStyle(key) {
    const layout = activeStartLayout.value;
    const pos = key === 'card' ? { x: layout.x, y: layout.y } : (layout[key] || { x: 0, y: 0 });
    const sizes = layout.sizes || {};
    const style = {
      transform: `translate(${Number(pos.x) || 0}px, ${Number(pos.y) || 0}px)`,
      ...alignBlockStyle(officeStartAlign(key))
    };
    if (key === 'card') {
      style.width = `${Number(layout.width) || 860}px`;
      style.maxWidth = '100%';
    }
    if (key === 'welcome') style.fontSize = `${Number(sizes.welcome) || 3.2}rem`;
    if (key === 'glad') style.fontSize = `${Number(sizes.glad) || 1.15}rem`;
    if (key === 'tagline') style.fontSize = `${Number(sizes.tagline) || 0.68}rem`;
    if (key === 'script') style.fontSize = `${Number(sizes.script) || 1.9}rem`;
    if (key === 'values') style.fontSize = `${Number(sizes.values) || 0.84}rem`;
    if (key === 'logo') {
      style.width = `${Number(sizes.logoWidth) || 150}px`;
      style.maxWidth = '100%';
    }
    if (key === 'help' && Number(sizes.helpWidth) > 0) {
      style.width = `${Number(sizes.helpWidth)}px`;
    }
    return style;
  }

  const officeStartLogoStyle = computed(() => ({
    width: `${Number(activeStartLayout.value.sizes?.logoWidth) || 150}px`,
    maxWidth: '100%',
    height: 'auto'
  }));

  const officeStartScriptStyle = computed(() => ({
    fontSize: `${Number(activeStartLayout.value.sizes?.script) || 1.9}rem`
  }));

  function hydrate(copy) {
    const next = mergeIntakeStartLayout(copy?.intakeStartLayout);
    Object.assign(intakeStartLayout, next);
    if (!editingStartLayout.value) {
      Object.assign(startLayoutDraft, next);
      Object.assign(startCopyDraft, blankStartCopy(copy, agencyName.value, t));
    }
  }

  function toggleStartHidden(key) {
    if (!editingStartLayout.value) return;
    if (!startLayoutDraft.hidden) startLayoutDraft.hidden = { welcome: false, glad: false };
    startLayoutDraft.hidden[key] = !startLayoutDraft.hidden[key];
  }

  function restoreOriginalStartCopy() {
    const restored = restoreJoinWelcomeCopy({}, agencyName.value);
    startCopyDraft.welcomeTitle = restored.welcomeTitle;
    startCopyDraft.welcomeGlad = restored.welcomeGlad;
    if (!startLayoutDraft.hidden) startLayoutDraft.hidden = { welcome: false, glad: false };
    startLayoutDraft.hidden.welcome = false;
    startLayoutDraft.hidden.glad = false;
  }

  function startOfficeStartEdit() {
    Object.assign(startLayoutDraft, mergeIntakeStartLayout(intakeStartLayout));
    Object.assign(startCopyDraft, blankStartCopy(joinLandingCopy.value, agencyName.value, t));
    selectedStartBlock.value = 'card';
    editingStartLayout.value = true;
    startLayoutError.value = '';
  }

  function cancelOfficeStartEdit() {
    editingStartLayout.value = false;
    Object.assign(startLayoutDraft, mergeIntakeStartLayout(intakeStartLayout));
    Object.assign(startCopyDraft, blankStartCopy(joinLandingCopy.value, agencyName.value, t));
  }

  function onOfficeStartBlockMouseDown(key, event) {
    if (!editingStartLayout.value) return;
    selectedStartBlock.value = key;
    if (event.target?.closest('input, textarea, select, button, .ajl-resize')) return;
    startOfficeBlockDrag(key, event);
  }

  function startOfficeBlockDrag(key, event) {
    if (!editingStartLayout.value || event.button !== 0) return;
    if (event.target?.closest('input, textarea, select, .ajl-resize')) return;
    selectedStartBlock.value = key;
    const layout = startLayoutDraft;
    const pos = key === 'card' ? layout : (layout[key] || { x: 0, y: 0 });
    const el = event.target?.closest(START_BLOCK_SELECTOR);
    const win = typeof window !== 'undefined' ? window : null;
    const bounds = win
      ? { left: -280, top: -220, right: win.innerWidth + 280, bottom: win.innerHeight + 220 }
      : null;
    startDragState = {
      key,
      x: event.clientX,
      y: event.clientY,
      origX: Number(pos.x) || 0,
      origY: Number(pos.y) || 0,
      rect: el ? el.getBoundingClientRect() : null,
      bounds
    };
    window.addEventListener('mousemove', onOfficeStartDrag);
    window.addEventListener('mouseup', stopOfficeStartDrag);
  }

  function onOfficeStartDrag(event) {
    if (!startDragState) return;
    let nextX = startDragState.origX + (event.clientX - startDragState.x);
    let nextY = startDragState.origY + (event.clientY - startDragState.y);
    const { rect, bounds } = startDragState;
    if (rect && bounds) {
      nextX = clampOffsetValue({
        value: nextX,
        base: rect.left - startDragState.origX,
        size: rect.width,
        min: bounds.left,
        max: bounds.right
      });
      nextY = clampOffsetValue({
        value: nextY,
        base: rect.top - startDragState.origY,
        size: rect.height,
        min: bounds.top,
        max: bounds.bottom
      });
    }
    nextX = Math.round(nextX);
    nextY = Math.round(nextY);
    if (startDragState.key === 'welcome' || startDragState.key === 'glad') {
      if (!startLayoutDraft.align) startLayoutDraft.align = {};
      if (nextX < -24) startLayoutDraft.align[startDragState.key] = 'left';
      else if (nextX > 24) startLayoutDraft.align[startDragState.key] = 'right';
    }
    if (startDragState.key === 'card') {
      startLayoutDraft.x = nextX;
      startLayoutDraft.y = nextY;
      return;
    }
    startLayoutDraft[startDragState.key] = { x: nextX, y: nextY };
  }

  function stopOfficeStartDrag() {
    startDragState = null;
    window.removeEventListener('mousemove', onOfficeStartDrag);
    window.removeEventListener('mouseup', stopOfficeStartDrag);
  }

  function startOfficeStartResize(key, event) {
    if (!editingStartLayout.value) return;
    event.preventDefault();
    selectedStartBlock.value = key;
    startResizeState = {
      key,
      x: event.clientX,
      origW: key === 'card'
        ? (Number(startLayoutDraft.width) || 860)
        : key === 'logo'
          ? (Number(startLayoutDraft.sizes?.logoWidth) || 150)
          : (Number(startLayoutDraft.sizes?.[`${key}Width`]) || 220)
    };
    window.addEventListener('mousemove', onOfficeStartResize);
    window.addEventListener('mouseup', stopOfficeStartResize);
  }

  function onOfficeStartResize(event) {
    if (!startResizeState) return;
    const next = startResizeState.origW + (event.clientX - startResizeState.x);
    if (startResizeState.key === 'card') {
      startLayoutDraft.width = Math.min(1200, Math.max(420, next));
      return;
    }
    if (startResizeState.key === 'logo') {
      startLayoutDraft.sizes.logoWidth = Math.round(Math.min(360, Math.max(48, next)));
      return;
    }
    startLayoutDraft.sizes[`${startResizeState.key}Width`] = Math.round(Math.min(340, Math.max(120, next)));
  }

  function stopOfficeStartResize() {
    startResizeState = null;
    window.removeEventListener('mousemove', onOfficeStartResize);
    window.removeEventListener('mouseup', stopOfficeStartResize);
  }

  function resetOfficeStartLayout() {
    Object.assign(startLayoutDraft, defaultIntakeStartLayout());
    restoreOriginalStartCopy();
  }

  async function saveOfficeStartLayout() {
    const slug = referralAgencySlug.value;
    if (!slug) {
      startLayoutError.value = 'Unable to save this layout.';
      return;
    }
    savingStartLayout.value = true;
    startLayoutError.value = '';
    try {
      const layout = mergeIntakeStartLayout(startLayoutDraft);
      const existing = { ...(joinLandingCopy.value || {}), ...blankStartCopy(startCopyDraft, agencyName.value, t) };
      existing.intakeStartLayout = layout;
      const { data } = await api.patch(`/public/adaptive-intake/${encodeURIComponent(slug)}/landing`, {
        serviceType: 'counseling',
        copy: existing
      }, { skipGlobalLoading: true });
      Object.assign(intakeStartLayout, layout);
      joinLandingCopy.value = data?.copy || existing;
      if (data) {
        writeJoinLandingCache(slug, 'counseling', {
          ...(readJoinLandingCache(slug, 'counseling') || {}),
          copy: joinLandingCopy.value,
          themeImageUrl: joinThemeUrl.value
        });
      }
      editingStartLayout.value = false;
      startLayoutOk.value = 'Saved.';
      if (startLayoutOkTimer) clearTimeout(startLayoutOkTimer);
      startLayoutOkTimer = setTimeout(() => { startLayoutOk.value = ''; }, 4000);
    } catch (e) {
      startLayoutError.value = e?.response?.data?.error?.message || e?.message || 'Could not save.';
    } finally {
      savingStartLayout.value = false;
    }
  }

  onBeforeUnmount(() => {
    stopOfficeStartDrag();
    stopOfficeStartResize();
    if (startLayoutOkTimer) clearTimeout(startLayoutOkTimer);
  });

  return {
    JOIN_FONT_HREF,
    START_ALIGN_OPTIONS,
    editingStartLayout,
    savingStartLayout,
    startLayoutError,
    startLayoutOk,
    selectedStartBlock,
    startCopyDraft,
    startLayoutDraft,
    startCopy,
    intakeStartLayout,
    canEditOfficeStart,
    selectedStartBlockLabel,
    selectedStartSizeKey,
    selectedStartSizeLabel,
    selectedStartSizeMin,
    selectedStartSizeMax,
    selectedStartSizeStep,
    officeStartLogoStyle,
    officeStartScriptStyle,
    isStartHidden,
    officeStartAlign,
    setOfficeStartAlign,
    officeStartBlockStyle,
    hydrate,
    toggleStartHidden,
    restoreOriginalStartCopy,
    startOfficeStartEdit,
    cancelOfficeStartEdit,
    onOfficeStartBlockMouseDown,
    startOfficeBlockDrag,
    startOfficeStartResize,
    resetOfficeStartLayout,
    saveOfficeStartLayout,
    stopOfficeStartDrag,
    stopOfficeStartResize
  };
}
