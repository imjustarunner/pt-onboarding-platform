import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/api';

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

  /**
   * Fetch organization by slug
   * @param {string} slug - Organization slug
   * @returns {Promise<Object|null>} Organization object or null
   */
  const fetchBySlug = async (slug) => {
    if (!slug) {
      error.value = 'Organization slug is required';
      return null;
    }

    loading.value = true;
    error.value = null;

    try {
      // Try to fetch by slug (backend will handle organization_type)
      const response = await api.get(`/agencies/slug/${slug}`);
      const org = response.data;
      
      if (!org || !org.is_active) {
        error.value = 'Organization not found or inactive';
        return null;
      }
      
      if (org) {
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
        return org;
      }
      
      return null;
    } catch (err) {
      console.error('Failed to fetch organization by slug:', err);
      error.value = err.response?.data?.error?.message || 'Failed to load organization';
      return null;
    } finally {
      loading.value = false;
    }
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
