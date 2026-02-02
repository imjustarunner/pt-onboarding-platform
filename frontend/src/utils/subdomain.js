/**
 * Subdomain detection utilities
 * Extracts subdomain from hostname for portal URL detection
 */

/**
 * Get the subdomain from the current hostname
 * Examples:
 * - itsco.app.plottwistco.com -> "itsco"
 * - nextleveluplcc.app.plottwistco.com -> "nextleveluplcc"
 * - app.plottwistco.com -> null
 * - app.agency.health -> null
 * - school1.app.agency.health -> "school1"
 * - localhost -> null
 * - onboarding-frontend-378990906760.us-west3.run.app -> null (Cloud Run URL)
 * 
 * @returns {string|null} The subdomain identifier or null if no subdomain
 */
export function getSubdomain() {
  const hostname = window.location.hostname;
  
  // Handle localhost and IP addresses
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }
  
  // Exclude Cloud Run URLs (service.region.run.app pattern)
  // These are not agency subdomains and should not be treated as such
  if (hostname.endsWith('.run.app')) {
    return null;
  }
  
  // Split hostname by dots
  const parts = hostname.split('.');
  
  // Only treat hostnames in the pattern:
  //   <portal>.app.<base-domain>
  // Examples:
  // - itsco.app.plottwistco.com -> ["itsco","app","plottwistco","com"] -> "itsco"
  // - school1.app.agency.health -> ["school1","app","agency","health"] -> "school1"
  //
  // This avoids incorrectly treating "app.agency2.com" as portal="app".
  if (parts.length >= 4 && parts[1].toLowerCase() === 'app') {
    const portal = String(parts[0] || '').toLowerCase();
    if (!portal || portal === 'app' || portal === 'www') return null;
    return portal;
  }
  
  return null;
}

/**
 * Get the portal URL identifier from the subdomain
 * This is the same as getSubdomain() but with a more semantic name
 * 
 * @returns {string|null} The portal URL identifier or null
 */
export function getPortalUrl() {
  return getSubdomain();
}

/**
 * Check if we're on a subdomain (agency-specific portal)
 * 
 * @returns {boolean} True if on a subdomain, false otherwise
 */
export function isSubdomainPortal() {
  return getSubdomain() !== null;
}

