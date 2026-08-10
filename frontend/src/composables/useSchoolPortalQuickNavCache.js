import { ref } from 'vue';
import api from '../services/api.js';
import { mapSchoolOverviewToQuickNavEntry } from '../utils/schoolPortalQuickNav.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheByAgencyId = new Map();
const inflightByAgencyId = new Map();
const schoolsRef = ref([]);

function normalizeOverviewRows(rows) {
  return (rows || [])
    .map((row) => mapSchoolOverviewToQuickNavEntry(row))
    .filter(Boolean);
}

/**
 * Shared cache of affiliated school orgs for Quick Nav (loaded from school overview).
 */
export function useSchoolPortalQuickNavCache() {
  function getSchools(agencyId) {
    const id = Number(agencyId);
    if (!Number.isFinite(id) || id < 1) return [];
    const cached = cacheByAgencyId.get(id);
    return cached?.rows || [];
  }

  async function ensureCache(agencyId, { force = false } = {}) {
    const id = Number(agencyId);
    if (!Number.isFinite(id) || id < 1) {
      schoolsRef.value = [];
      return [];
    }

    const cached = cacheByAgencyId.get(id);
    const fresh = cached && Date.now() - cached.loadedAt < CACHE_TTL_MS;
    if (!force && fresh) {
      schoolsRef.value = cached.rows;
      return cached.rows;
    }

    if (inflightByAgencyId.has(id)) {
      return inflightByAgencyId.get(id);
    }

    const promise = api
      .get('/dashboard/school-overview', {
        params: { agencyId: id, orgType: 'school' },
        skipGlobalLoading: true
      })
      .then((res) => {
        const rows = normalizeOverviewRows(res.data?.schools || []);
        cacheByAgencyId.set(id, { rows, loadedAt: Date.now() });
        schoolsRef.value = rows;
        return rows;
      })
      .catch(() => {
        if (cached?.rows?.length) {
          schoolsRef.value = cached.rows;
          return cached.rows;
        }
        schoolsRef.value = [];
        return [];
      })
      .finally(() => {
        inflightByAgencyId.delete(id);
      });

    inflightByAgencyId.set(id, promise);
    return promise;
  }

  function clearCache(agencyId = null) {
    if (agencyId == null) {
      cacheByAgencyId.clear();
      schoolsRef.value = [];
      return;
    }
    const id = Number(agencyId);
    if (Number.isFinite(id) && id > 0) {
      cacheByAgencyId.delete(id);
    }
  }

  return {
    schoolsRef,
    getSchools,
    ensureCache,
    clearCache
  };
}
