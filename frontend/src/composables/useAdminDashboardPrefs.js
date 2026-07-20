// Per-user section visibility for the tenant ops admin dashboard.
// localStorage only — no server sync in this pass.

import { ref, watch, computed, isRef, unref } from 'vue';

const STORAGE_PREFIX = 'adminDashboardSections:tenant';

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
  { key: 'todaysSchedule', label: "Today's Schedule" }
]);

const sanitizeKey = (value) => String(value || 'anon').replace(/[^a-zA-Z0-9_-]/g, '');

const loadSections = (storageKey) => {
  if (typeof window === 'undefined') return { ...DEFAULT_SECTION_VISIBILITY };
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { ...DEFAULT_SECTION_VISIBILITY };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SECTION_VISIBILITY };
    const next = { ...DEFAULT_SECTION_VISIBILITY };
    for (const key of Object.keys(DEFAULT_SECTION_VISIBILITY)) {
      if (typeof parsed[key] === 'boolean') next[key] = parsed[key];
    }
    return next;
  } catch {
    return { ...DEFAULT_SECTION_VISIBILITY };
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
 * @param {{ userId?: import('vue').Ref|string|number|null }} opts
 */
export function useAdminDashboardPrefs({ userId = null } = {}) {
  const userIdRef = isRef(userId) ? userId : ref(userId);
  const storageKey = computed(
    () => `${STORAGE_PREFIX}:${sanitizeKey(unref(userIdRef))}`
  );

  const sections = ref(loadSections(storageKey.value));

  watch(userIdRef, () => {
    sections.value = loadSections(storageKey.value);
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
    if (!(key in DEFAULT_SECTION_VISIBILITY)) return;
    sections.value = { ...sections.value, [key]: !!value };
  };

  const toggleSection = (key) => {
    setSection(key, !isVisible(key));
  };

  const resetSections = () => {
    sections.value = { ...DEFAULT_SECTION_VISIBILITY };
  };

  return {
    sections,
    sectionLabels: SECTION_LABELS,
    isVisible,
    setSection,
    toggleSection,
    resetSections
  };
}
