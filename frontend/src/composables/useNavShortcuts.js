/**
 * useNavShortcuts
 * Fetches the current user's most-visited admin pages (last 90 days),
 * deduplicates by page key, and returns a ready-to-render shortcut list.
 */
import { ref, computed } from 'vue';
import api from '../services/api.js';
import { normalizeAdminPageKey } from '../utils/normalizeAdminPageKey.js';

const PAGE_META = {
  'dashboard':                      { label: 'Admin Dashboard',      icon: '🏠' },
  'admin-dashboard':                { label: 'Admin Dashboard',      icon: '🏠' },
  'clients':                        { label: 'Clients',              icon: '👤' },
  'school-clients':                 { label: 'School Clients',       icon: '🏫' },
  'caseload-hub/schools-staff':     { label: 'School Management',    icon: '🏫' },
  'caseload-hub/calendar':          { label: 'School Calendar',      icon: '📅' },
  'outreach-hub':                   { label: 'Outreach Hub',         icon: '📍' },
  'caseload-hub':                   { label: 'Caseload Hub',         icon: '📋' },
  'provider-availability':          { label: 'Providers',            icon: '👥' },
  'school-ops':                     { label: 'School Ops',           icon: '🏫' },
  'schedule':                       { label: 'Schedule Hub',         icon: '📅' },
  'schedule/staff':                 { label: 'Staff Schedules',      icon: '📅' },
  'users':                          { label: 'Users',                icon: '👤' },
  'user-manager':                   { label: 'User Manager',         icon: '👤' },
  'operations-dashboard':           { label: 'Operations',           icon: '⚡' },
  'workforce-operations':           { label: 'Workforce Ops',        icon: '⚡' },
  'collaborative-year-update':      { label: 'Year Update',          icon: '📋' },
  'portals':                        { label: 'School Portals',       icon: '🔗' },
  'school-portals-hub':             { label: 'School Portals',       icon: '🔗' },
  'school-portals':                 { label: 'School Portals',       icon: '🔗' },
  'referral-directory':             { label: 'Referrals',            icon: '📂' },
  'intake':                         { label: 'Intake Queue',         icon: '📥' },
  'communications':                 { label: 'Communications',       icon: '💬' },
  'notes':                          { label: 'Notes',                icon: '📝' },
  'settings':                       { label: 'Settings',             icon: '⚙️'  },
  'schools/overview':               { label: 'Schools Overview',     icon: '🏫' },
  'schools':                        { label: 'Schools',              icon: '🏫' },
  'payroll':                        { label: 'Payroll',              icon: '💰' },
  'hiring':                         { label: 'Hiring',               icon: '📝' },
  'audit-center':                   { label: 'Audit Center',         icon: '🔍' },
  'agency-progress':                { label: 'Training Progress',    icon: '📊' },
  'unassigned-documents':           { label: 'Unassigned Docs',      icon: '📄' },
  'documents':                      { label: 'My Documents',         icon: '📄' },
  'library':                        { label: 'Tools and Resources', icon: '📚' },
  'client-onboarding':              { label: 'Client Action Needed',     icon: '📋' },
  'provider-client-onboarding':     { label: 'Client Action Needed',     icon: '📋' },
  'client-exchange':                { label: 'Client Exchange',      icon: '🔄' },
  'guardians':                      { label: 'Guardians',            icon: '👪' },
  'usage-analytics':                { label: 'Usage Analytics',      icon: '📊' },
};

const DEFAULT_ICON = '⚡';

/** Normalize a raw page key from the DB to its canonical key. */
function normalizeKey(page) {
  return normalizeAdminPageKey(page);
}

/** Normalize path for dedup — same admin home via different slugs counts once. */
function normalizePath(path) {
  const p = String(path || '').split('?')[0].toLowerCase();
  if (/\/admin\/?$/.test(p) || p === '/admin') return '/admin';
  return p;
}

function metaForKey(key) {
  if (PAGE_META[key]) return PAGE_META[key];
  // Longest-prefix match
  const sorted = Object.keys(PAGE_META).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    if (key.startsWith(k + '/') || key === k) return PAGE_META[k];
  }
  // Humanize fallback
  const label = (key.split('/').pop() || key).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, icon: DEFAULT_ICON };
}

// Module-level cache so we only fetch once per session
let _cache = null;
let _pending = null;

export function useNavShortcuts({ limit = 6 } = {}) {
  const shortcuts = ref(_cache ? [..._cache] : []);
  const loading = ref(!_cache);
  const error = ref(null);

  async function load() {
    if (_cache) {
      shortcuts.value = [..._cache];
      loading.value = false;
      return;
    }
    if (_pending) {
      await _pending;
      shortcuts.value = [...(_cache || [])];
      loading.value = false;
      return;
    }
    loading.value = true;
    error.value = null;
    // Fetch 2× what we'll show so deduplication doesn't exhaust the list
    const fetchLimit = Math.min(limit * 3, 20);
    _pending = api
      .get('/user-nav/shortcuts', { params: { limit: fetchLimit }, skipGlobalLoading: true })
      .then((res) => {
        const raw = res.data?.shortcuts || [];

        // Deduplicate by canonical key + destination path — keep highest visit count
        const seen = new Map(); // dedupeKey → best row
        for (const row of raw) {
          const key = normalizeKey(row.page);
          const pathKey = normalizePath(row.path);
          const dedupeKey = `${key}::${pathKey}`;
          if (!seen.has(dedupeKey) || Number(row.visit_count) > seen.get(dedupeKey).visitCount) {
            const { label, icon } = metaForKey(key);
            seen.set(dedupeKey, {
              page: row.page,
              path: row.path,
              canonicalKey: key,
              label,
              icon,
              visitCount: Number(row.visit_count || 0),
            });
          }
        }

        // Merge rows that share the same canonical page (e.g. dashboard vs Dashboard)
        const byCanonical = new Map();
        for (const row of seen.values()) {
          const existing = byCanonical.get(row.canonicalKey);
          if (!existing) {
            byCanonical.set(row.canonicalKey, { ...row, peakPathVisits: row.visitCount });
            continue;
          }
          existing.visitCount += row.visitCount;
          if (row.visitCount > existing.peakPathVisits) {
            existing.path = row.path;
            existing.page = row.page;
            existing.peakPathVisits = row.visitCount;
          }
        }
        for (const row of byCanonical.values()) delete row.peakPathVisits;

        _cache = [...byCanonical.values()].sort((a, b) => b.visitCount - a.visitCount);
        shortcuts.value = [..._cache];
      })
      .catch((err) => {
        console.warn('[useNavShortcuts] failed to load:', err);
        error.value = err;
      })
      .finally(() => {
        loading.value = false;
        _pending = null;
      });
    await _pending;
  }

  const topShortcuts = computed(() => shortcuts.value.slice(0, limit));

  load();

  return { shortcuts, topShortcuts, loading, error, reload: () => { _cache = null; load(); } };
}
