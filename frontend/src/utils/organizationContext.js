/**
 * Organization Context Utilities
 * Helper functions for resolving and working with organization context
 */

import { useOrganizationStore } from '../store/organization';
import api from '../services/api';

/**
 * Resolve organization from slug
 * @param {string} slug - Organization slug
 * @returns {Promise<Object|null>} Organization object or null
 */
export async function resolveOrganizationBySlug(slug) {
  if (!slug) {
    return null;
  }

  try {
    const response = await api.get(`/agencies/slug/${slug}`);
    return response.data || null;
  } catch (error) {
    console.error('Failed to resolve organization by slug:', error);
    return null;
  }
}

/**
 * Get organization type from slug
 * @param {string} slug - Organization slug
 * @returns {Promise<string|null>} Organization type ('agency', 'school', 'program', 'learning') or null
 */
export async function getOrganizationType(slug) {
  const org = await resolveOrganizationBySlug(slug);
  return org?.organization_type || 'agency'; // Default to 'agency' for backward compatibility
}

/**
 * Check if organization slug is a school
 * @param {string} slug - Organization slug
 * @returns {Promise<boolean>} True if organization is a school
 */
export async function isSchoolOrganization(slug) {
  const orgType = await getOrganizationType(slug);
  return orgType === 'school';
}

/**
 * Get appropriate dashboard route for organization type
 * @param {string} organizationType - Organization type
 * @param {string} slug - Organization slug
 * @returns {string} Dashboard route path
 */
export function getOrganizationDashboardRoute(organizationType, slug) {
  if (organizationType === 'school') {
    return `/${slug}/dashboard`; // School portal dashboard
  }
  // For agencies, programs, and learning, use standard routes
  return '/dashboard';
}

/**
 * Get appropriate login route for organization
 * @param {string} slug - Organization slug
 * @returns {string} Login route path
 */
export function getOrganizationLoginRoute(slug) {
  if (slug) {
    return `/${slug}/login`;
  }
  return '/login';
}
