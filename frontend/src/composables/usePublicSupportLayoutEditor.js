import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import {
  clampOffsetValue,
  defaultPublicSupportLayout,
  mergePublicSupportLayout
} from '../utils/joinLandingTemplate.js';

const BLOCK_LABELS = {
  logo: 'Logo',
  kicker: 'Agency name',
  title: 'Support title',
  lead: 'Banner lead',
  login: 'Login button',
  join: 'Counselor button',
  careers: 'Careers button',
  booking: 'Booking button',
  billing: 'Billing questions',
  card: 'Send a message card'
};

const SIZE_CONTROLS = {
  logo: { key: 'logoWidth', label: 'Logo size', min: 40, max: 220, step: 2 },
  kicker: { key: 'kickerWidth', fontKey: 'kicker', label: 'Name width', min: 120, max: 420, step: 4 },
  title: { key: 'titleWidth', fontKey: 'title', label: 'Title width', min: 140, max: 460, step: 4 },
  lead: { key: 'leadWidth', fontKey: 'lead', label: 'Lead width', min: 140, max: 460, step: 4 },
  login: { key: 'loginWidth', label: 'Login width', min: 160, max: 420, step: 4 },
  join: { key: 'joinWidth', label: 'Counselor width', min: 160, max: 420, step: 4 },
  careers: { key: 'careersWidth', label: 'Careers width', min: 160, max: 420, step: 4 },
  booking: { key: 'bookingWidth', label: 'Booking width', min: 160, max: 420, step: 4 },
  billing: { key: 'billingWidth', label: 'Billing width', min: 160, max: 420, step: 4 },
  card: { key: 'cardWidth', label: 'Card width', min: 520, max: 1200, step: 10 }
};

const FONT_CONTROLS = {
  kicker: { key: 'kicker', label: 'Name size', min: 0.55, max: 1.2, step: 0.02 },
  title: { key: 'title', label: 'Title size', min: 1.1, max: 2.8, step: 0.05 },
  lead: { key: 'lead', label: 'Lead size', min: 0.7, max: 1.4, step: 0.02 }
};

const BLOCK_SELECTOR = '.pas-block, .pas-card';

export function usePublicSupportLayoutEditor() {
  const editing = ref(false);
  const viewportWidth = ref(typeof window === 'undefined' ? 1200 : window.innerWidth);
  const skipDesktopLayout = computed(() => !editing.value && viewportWidth.value <= 860);

  function syncViewportWidth() {
    viewportWidth.value = window.innerWidth;
  }
  const selected = ref('');
  const selectedKeys = ref([]);
  const saved = reactive(mergePublicSupportLayout(null));
  const draft = reactive(mergePublicSupportLayout(null));
  let dragState = null;
  let resizeState = null;

  const active = computed(() => (editing.value ? draft : saved));
  const selectedLabel = computed(() => {
    if (selectedKeys.value.length > 1) return `${selectedKeys.value.length} items selected — drag any one to move them together`;
    return selected.value ? BLOCK_LABELS[selected.value] || selected.value : 'Click a block to move it. Shift-click to add more.';
  });
  const sizeControl = computed(() => SIZE_CONTROLS[selected.value] || null);
  const fontControl = computed(() => FONT_CONTROLS[selected.value] || null);
  const canResize = computed(() => Boolean(SIZE_CONTROLS[selected.value]));

  function isSelected(key) {
    return selectedKeys.value.includes(key);
  }

  function setSelection(keys, primary = '') {
    const unique = [...new Set((keys || []).filter(Boolean))];
    selectedKeys.value = unique;
    selected.value = primary || unique[unique.length - 1] || '';
  }

  function hydrate(layout) {
    const next = mergePublicSupportLayout(layout);
    Object.assign(saved, next);
    if (!editing.value) Object.assign(draft, next);
  }

  function startEdit() {
    Object.assign(draft, mergePublicSupportLayout(saved));
    setSelection(['card'], 'card');
    editing.value = true;
  }

  function cancelEdit() {
    editing.value = false;
    setSelection([]);
    Object.assign(draft, mergePublicSupportLayout(saved));
  }

  function resetLayout() {
    Object.assign(draft, defaultPublicSupportLayout());
  }

  function snapshot() {
    return mergePublicSupportLayout(draft);
  }

  function commitSaved(layout) {
    const next = mergePublicSupportLayout(layout);
    Object.assign(saved, next);
    Object.assign(draft, next);
    editing.value = false;
    setSelection([]);
  }

  function blockStyle(key) {
    if (skipDesktopLayout.value) return {};
    const pos = active.value.positions?.[key] || { x: 0, y: 0 };
    const sizes = active.value.sizes || {};
    const style = {
      transform: `translate(${Number(pos.x) || 0}px, ${Number(pos.y) || 0}px)`
    };
    if (key === 'logo') {
      style.width = `${Number(sizes.logoWidth) || 72}px`;
    }
    if (key === 'kicker') {
      style.width = `${Number(sizes.kickerWidth) || 240}px`;
      style.fontSize = `${Number(sizes.kicker) || 0.74}rem`;
    }
    if (key === 'title') {
      style.width = `${Number(sizes.titleWidth) || 280}px`;
      style.fontSize = `${Number(sizes.title) || 1.85}rem`;
    }
    if (key === 'lead') {
      style.width = `${Number(sizes.leadWidth) || 280}px`;
      style.fontSize = `${Number(sizes.lead) || 0.9}rem`;
    }
    if (['login', 'join', 'careers', 'booking', 'billing'].includes(key)) {
      style.width = `${Number(sizes[`${key}Width`]) || 280}px`;
    }
    if (key === 'card') {
      style.width = `${Number(sizes.cardWidth) || 980}px`;
      style.maxWidth = '100%';
    }
    return style;
  }

  function onBlockMouseDown(key, event) {
    if (!editing.value) return;
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    if (additive) {
      const next = isSelected(key)
        ? selectedKeys.value.filter((k) => k !== key)
        : [...selectedKeys.value, key];
      setSelection(next.length ? next : [key], key);
    } else if (!isSelected(key)) {
      setSelection([key], key);
    } else {
      selected.value = key;
    }
    if (event.target?.closest('input, textarea, select, button, a, .ajl-resize')) return;
    if (additive) return;
    startDrag(key, event);
  }

  function startDrag(key, event) {
    if (!editing.value || event.button !== 0) return;
    if (event.target?.closest('input, textarea, select, a, .ajl-resize')) return;
    if (!isSelected(key)) setSelection([key], key);
    selected.value = key;
    const movingKeys = selectedKeys.value.length ? selectedKeys.value : [key];
    const el = event.target?.closest(BLOCK_SELECTOR);
    const win = typeof window !== 'undefined' ? window : null;
    dragState = {
      key,
      keys: movingKeys,
      x: event.clientX,
      y: event.clientY,
      origins: Object.fromEntries(movingKeys.map((k) => {
        const pos = draft.positions[k] || { x: 0, y: 0 };
        return [k, { x: Number(pos.x) || 0, y: Number(pos.y) || 0 }];
      })),
      rect: el ? el.getBoundingClientRect() : null,
      bounds: win
        ? { left: -240, top: -180, right: win.innerWidth + 240, bottom: win.innerHeight + 180 }
        : null
    };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', stopDrag);
  }

  function onDrag(event) {
    if (!dragState) return;
    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    const origin = dragState.origins[dragState.key] || { x: 0, y: 0 };
    let nextX = origin.x + dx;
    let nextY = origin.y + dy;
    const { rect, bounds } = dragState;
    if (rect && bounds) {
      nextX = clampOffsetValue({
        value: nextX,
        base: rect.left - origin.x,
        size: rect.width,
        min: bounds.left,
        max: bounds.right
      });
      nextY = clampOffsetValue({
        value: nextY,
        base: rect.top - origin.y,
        size: rect.height,
        min: bounds.top,
        max: bounds.bottom
      });
    }
    const appliedDx = Math.round(nextX - origin.x);
    const appliedDy = Math.round(nextY - origin.y);
    for (const k of dragState.keys) {
      const from = dragState.origins[k] || { x: 0, y: 0 };
      draft.positions[k] = { x: from.x + appliedDx, y: from.y + appliedDy };
    }
  }

  function stopDrag() {
    dragState = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
  }

  function startResize(key, event) {
    if (!editing.value) return;
    event.preventDefault();
    selected.value = key;
    const control = SIZE_CONTROLS[key];
    resizeState = {
      key,
      x: event.clientX,
      orig: Number(draft.sizes[control?.key] || (key === 'card' ? 980 : 280))
    };
    window.addEventListener('mousemove', onResize);
    window.addEventListener('mouseup', stopResize);
  }

  function onResize(event) {
    if (!resizeState) return;
    const control = SIZE_CONTROLS[resizeState.key];
    if (!control) return;
    const delta = event.clientX - resizeState.x;
    const next = resizeState.orig + delta;
    draft.sizes[control.key] = Math.min(control.max, Math.max(control.min, Math.round(next)));
  }

  function stopResize() {
    resizeState = null;
    window.removeEventListener('mousemove', onResize);
    window.removeEventListener('mouseup', stopResize);
  }

  onMounted(() => {
    syncViewportWidth();
    window.addEventListener('resize', syncViewportWidth);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', syncViewportWidth);
    stopDrag();
    stopResize();
  });

  return {
    editing,
    selected,
    selectedKeys,
    selectedLabel,
    sizeControl,
    fontControl,
    canResize,
    draft,
    hydrate,
    startEdit,
    cancelEdit,
    resetLayout,
    snapshot,
    commitSaved,
    blockStyle,
    isSelected,
    onBlockMouseDown,
    startDrag,
    startResize
  };
}
