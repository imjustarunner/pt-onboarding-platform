/**
 * Utility to determine the appropriate login URL based on user's agency membership
 * 
 * Rules:
 * - Users with exactly 1 agency that has a portal_url → redirect to /{portal_url}/login
 * - Users with multiple agencies or no portal_url → redirect to /login (platform branding)
 * - Super admins → always use /login (platform branding)
 */

/**
 * Get the appropriate login URL for a user
 * @param {Object} user - User object (may be null if logged out)
 * @param {Array} userAgencies - Array of user's agencies (may be from localStorage)
 * @returns {string} Login URL path
 */
export function getLoginUrl(user = null, userAgencies = null) {
  // Super admins always use platform login
  if (user?.role === 'super_admin') {
    return '/login';
  }

  // Try to get agencies from parameter, localStorage, or user object
  let agencies = userAgencies;
  
  if (!agencies) {
    // Try to get from localStorage (stored by agency store)
    try {
      const storedAgencies = localStorage.getItem('userAgencies');
      if (storedAgencies) {
        agencies = JSON.parse(storedAgencies);
      }
    } catch (e) {
      console.warn('Failed to parse stored agencies:', e);
    }
  }

  // If still no agencies and we have a user, try to get from user object
  if (!agencies && user?.agencies) {
    agencies = user.agencies;
  }

  // If no agencies found, use platform login
  if (!agencies || agencies.length === 0) {
    return '/login';
  }

  // If user has multiple agencies, use platform login
  if (agencies.length > 1) {
    return '/login';
  }

  // User has exactly 1 agency - check if it has a portal_url
  const agency = agencies[0];
  const portalUrl = agency?.portal_url || agency?.portalUrl;

  if (portalUrl && portalUrl.trim()) {
    // Redirect to agency-specific login page
    return `/${portalUrl}/login`;
  }

  // Agency exists but no portal_url, use platform login
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
