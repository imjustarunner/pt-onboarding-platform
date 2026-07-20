// Per-user section visibility for the tenant ops admin dashboard.
// localStorage only — no server sync in this pass.

import { ref, watch, computed, isRef, unref } from 'vue';

export const DEFAULT_SECTION_VISIBILITY = Object.freeze({
  atGlance: true,
  documentationAlerts: true,
  quickActions: true,
  schoolUpdates: true,
  events: true,
  programs: true,
  communications: true,
  peopleOps: true,
  systemAlerts: true,
  todaysSchedule: true
});

/** Operations Dashboard (CPA / Provider+) — focus on coverage, hires, events, training. */
export const OPERATIONS_SECTION_VISIBILITY = Object.freeze({
  atGlance: true,
  documentationAlerts: false,
  quickActions: true,
  schoolUpdates: true,
  events: true,
  programs: true,
  communications: true,
  peopleOps: false,
  systemAlerts: false,
  todaysSchedule: true,
  momentum: true
});

export const SECTION_LABELS = Object.freeze([
  { key: 'atGlance', label: 'At a Glance' },
  { key: 'documentationAlerts', label: 'Documentation Alerts' },
  { key: 'quickActions', label: 'Quick Actions' },
  { key: 'schoolUpdates', label: 'School Updates & Changes' },
  { key: 'events', label: 'Events' },
  { key: 'programs', label: 'Programs' },
  { key: 'communications', label: 'Communications Center' },
  { key: 'peopleOps', label: 'People Ops Overview' },
  { key: 'systemAlerts', label: 'System Alerts' },
  { key: 'todaysSchedule', label: "Today's Schedule" },
  { key: 'momentum', label: 'Momentum List / Checklist' }
]);

const sanitizeKey = (value) => String(value || 'anon').replace(/[^a-zA-Z0-9_-]/g, '');

const loadSections = (storageKey, defaults) => {
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...defaults };
    const next = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (typeof parsed[key] === 'boolean') next[key] = parsed[key];
    }
    return next;
  } catch {
    return { ...defaults };
  }
};

const saveSections = (storageKey, sections) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(sections));
  } catch {
    // Quota / privacy mode — best effort.
  }
};

/**
 * @param {{ userId?: import('vue').Ref|string|number|null, namespace?: string, defaults?: Record<string, boolean> }} opts
 */
export function useAdminDashboardPrefs({
  userId = null,
  namespace = 'tenant',
  defaults = DEFAULT_SECTION_VISIBILITY
} = {}) {
  const userIdRef = isRef(userId) ? userId : ref(userId);
  const defaultsRef = { ...defaults };
  const storageKey = computed(
    () => `adminDashboardSections:${namespace}:${sanitizeKey(unref(userIdRef))}`
  );

  const sections = ref(loadSections(storageKey.value, defaultsRef));

  watch(userIdRef, () => {
    sections.value = loadSections(storageKey.value, defaultsRef);
  });

  watch(
    sections,
    (next) => {
      saveSections(storageKey.value, next);
    },
    { deep: true }
  );

  const isVisible = (key) => sections.value?.[key] !== false;

  const setSection = (key, value) => {
    if (!(key in defaultsRef)) return;
    sections.value = { ...sections.value, [key]: !!value };
  };

  const toggleSection = (key) => {
    setSection(key, !isVisible(key));
  };

  const resetSections = () => {
    sections.value = { ...defaultsRef };
  };

  const sectionLabels = SECTION_LABELS.filter((item) => item.key in defaultsRef);

  return {
    sections,
    sectionLabels,
    isVisible,
    setSection,
    toggleSection,
    resetSections
  };
}
