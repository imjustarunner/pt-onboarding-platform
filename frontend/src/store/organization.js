import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

const normalizeSlug = (slug) => String(slug || '').trim().toLowerCase();

const readStoredUserAgencies = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem('userAgencies') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const findStoredOrgBySlug = (slug) => {
  const target = normalizeSlug(slug);
  if (!target) return null;
  const agencies = readStoredUserAgencies();
  return agencies.find((org) => {
    const orgSlug = normalizeSlug(org?.slug);
    const portalUrl = normalizeSlug(org?.portal_url || org?.portalUrl);
    return orgSlug === target || portalUrl === target;
  }) || null;
};

// In-flight deduplication + short TTL cache for fetchBySlug.
// Prevents duplicate HTTP requests when beforeEach fires back-to-back for redirect chains.
const _slugInflight = new Map();   // slug → Promise
const _slugCache    = new Map();   // slug → { org, ts }
const SLUG_CACHE_TTL_MS = 5000;

/**
 * Organization Store
 * Manages organization context (Agency, School, Program, Learning)
 * The "agencies" table conceptually represents all organization types
 */
export const useOrganizationStore = defineStore('organization', () => {
  const currentOrganization = ref(null);
  const organizationContext = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const _applyOrg = (org) => {
    currentOrganization.value = org;
    organizationContext.value = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      organizationType: org.organization_type || 'agency',
      logoUrl: org.logo_url,
      colorPalette: org.color_palette,
      themeSettings: org.theme_settings,
      portalUrl: org.portal_url
    };
  };

  /**
   * Fetch organization by slug.
   * Concurrent calls for the same slug share one in-flight request; results are
   * cached for SLUG_CACHE_TTL_MS to absorb rapid re-navigations.
   */
  const fetchBySlug = async (slug) => {
    const normalized = normalizeSlug(slug);
    if (!normalized) {
      error.value = 'Organization slug is required';
      return null;
    }

    // Return cached result if still fresh
    const cached = _slugCache.get(normalized);
    if (cached && Date.now() - cached.ts < SLUG_CACHE_TTL_MS) {
      _applyOrg(cached.org);
      return cached.org;
    }

    // Coalesce concurrent requests for the same slug
    if (_slugInflight.has(normalized)) {
      return _slugInflight.get(normalized);
    }

    loading.value = true;
    error.value = null;

    const promise = (async () => {
      try {
        const response = await api.get(`/agencies/slug/${encodeURIComponent(normalized)}`, {
          skipGlobalLoading: true,
          timeout: 10000
        });
        const org = response.data;

        if (!org || !org.is_active) {
          error.value = 'Organization not found or inactive';
          return null;
        }

        _applyOrg(org);
        _slugCache.set(normalized, { org, ts: Date.now() });
        return org;
      } catch (err) {
        const status = Number(err?.response?.status || 0);
        const fallbackOrg = findStoredOrgBySlug(normalized);
        if ((status === 401 || status === 403) && fallbackOrg) {
          _applyOrg(fallbackOrg);
          return fallbackOrg;
        }
        if (import.meta.env.DEV) {
          console.error('Failed to fetch organization by slug:', err);
        }
        error.value = err.response?.data?.error?.message || 'Failed to load organization';
        return null;
      } finally {
        loading.value = false;
        _slugInflight.delete(normalized);
      }
    })();

    _slugInflight.set(normalized, promise);
    return promise;
  };

  /**
   * Set current organization
   * @param {Object} organization - Organization object
   */
  const setCurrentOrganization = (organization) => {
    currentOrganization.value = organization;
    if (organization) {
      organizationContext.value = {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        organizationType: organization.organization_type || 'agency',
        logoUrl: organization.logo_url,
        colorPalette: organization.color_palette,
        themeSettings: organization.theme_settings,
        portalUrl: organization.portal_url
      };
    } else {
      organizationContext.value = null;
    }
  };

  /**
   * Clear organization context
   */
  const clearOrganization = () => {
    currentOrganization.value = null;
    organizationContext.value = null;
  };

  /**
   * Check if current organization is a school
   */
  const isSchool = computed(() => {
    return organizationContext.value?.organizationType === 'school';
  });

  /**
   * Check if current organization is an agency
   */
  const isAgency = computed(() => {
    return organizationContext.value?.organizationType === 'agency';
  });

  /**
   * Check if current organization is a program
   */
  const isProgram = computed(() => {
    return organizationContext.value?.organizationType === 'program';
  });

  /**
   * Check if current organization is learning-focused
   */
  const isLearning = computed(() => {
    return organizationContext.value?.organizationType === 'learning';
  });

  return {
    currentOrganization,
    organizationContext,
    loading,
    error,
    isSchool,
    isAgency,
    isProgram,
    isLearning,
    fetchBySlug,
    setCurrentOrganization,
    clearOrganization
  };
});
