/**
 * Utility to determine the appropriate login URL based on user's organization membership
 * 
 * Rules:
 * - Users with exactly 1 organization that has a slug → redirect to /{slug}/login
 * - Users with multiple organizations or no slug → redirect to /login (platform branding)
 * - Super admins → always use /login (platform branding)
 * - Supports both portal_url (legacy) and slug (new) for backward compatibility
 */

/**
 * Get the appropriate login URL for a user
 * @param {Object} user - User object (may be null if logged out)
 * @param {Array} userAgencies - Array of user's organizations (may be from localStorage)
 * @returns {string} Login URL path
 */
export function getLoginUrl(user = null, userAgencies = null) {
  // Super admins always use platform login
  if (user?.role === 'super_admin') {
    return '/login';
  }

  // Try to get organizations from parameter, localStorage, or user object
  let organizations = userAgencies;
  
  if (!organizations) {
    // Try to get from localStorage (stored by agency store)
    try {
      const storedAgencies = localStorage.getItem('userAgencies');
      if (storedAgencies) {
        organizations = JSON.parse(storedAgencies);
      }
    } catch (e) {
      console.warn('Failed to parse stored agencies:', e);
    }
  }

  // If still no organizations and we have a user, try to get from user object
  if (!organizations && user?.agencies) {
    organizations = user.agencies;
  }

  // If no organizations found, use platform login
  if (!organizations || organizations.length === 0) {
    return '/login';
  }

  // If user has multiple organizations, use platform login
  if (organizations.length > 1) {
    return '/login';
  }

  // User has exactly 1 organization - check for slug or portal_url
  const org = organizations[0];
  
  // Priority 1: Use slug (new standard)
  const slug = org?.slug;
  if (slug && slug.trim()) {
    return `/${slug}/login`;
  }
  
  // Priority 2: Fall back to portal_url (legacy support)
  const portalUrl = org?.portal_url || org?.portalUrl;
  if (portalUrl && portalUrl.trim()) {
    return `/${portalUrl}/login`;
  }

  // Organization exists but no slug or portal_url, use platform login
  return '/login';
}

/**
 * Store user's agencies in localStorage for use after logout
 * @param {Array} agencies - Array of agency objects
 */
export function storeUserAgencies(agencies) {
  try {
    if (agencies && agencies.length > 0) {
      localStorage.setItem('userAgencies', JSON.stringify(agencies));
    } else {
      localStorage.removeItem('userAgencies');
    }
  } catch (e) {
    console.warn('Failed to store user agencies:', e);
  }
}

/**
 * Clear stored user agencies (call on logout)
 */
export function clearStoredAgencies() {
  try {
    localStorage.removeItem('userAgencies');
  } catch (e) {
    // Ignore errors
  }
}
