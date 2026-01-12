/**
 * Preview Utilities
 * Helper functions for creating mock data and managing preview mode
 */

/**
 * Creates a mock user object for preview
 * @param {string} status - User status (PREHIRE_OPEN, PREHIRE_REVIEW, ONBOARDING, ACTIVE_EMPLOYEE)
 * @param {string} role - User role (user, admin, super_admin)
 * @returns {Object} Mock user object
 */
export function createMockUser(status = 'ACTIVE_EMPLOYEE', role = 'user') {
  return {
    id: 1,
    email: 'preview@example.com',
    first_name: 'Preview',
    last_name: 'User',
    status: status,
    role: role,
    type: role === 'admin' ? null : 'user',
    agencyIds: [1]
  };
}

/**
 * Creates mock agency data for preview
 * @param {number} agencyId - Agency ID
 * @param {Object} agencyData - Optional agency data to merge
 * @returns {Object} Mock agency object
 */
export function createMockAgencyData(agencyId, agencyData = {}) {
  return {
    id: agencyId,
    name: agencyData.name || 'Preview Agency',
    slug: agencyData.slug || 'preview-agency',
    portal_url: agencyData.portal_url || 'preview',
    color_palette: agencyData.color_palette || {
      primary: '#C69A2B',
      secondary: '#1D2633',
      accent: '#3A4C6B'
    },
    logo_url: agencyData.logo_url || null,
    onboarding_team_email: agencyData.onboarding_team_email || 'peopleops@example.com',
    is_active: true,
    ...agencyData
  };
}

/**
 * Creates mock dashboard data based on status
 * @param {string} status - User status
 * @returns {Object} Mock dashboard data
 */
export function createMockDashboardData(status) {
  const baseData = {
    onboardingCompletion: 0,
    trainingCount: 0,
    documentsCount: 0,
    checklistCount: 0,
    daysRemaining: null,
    pendingCompletionStatus: null
  };

  switch (status) {
    case 'PREHIRE_OPEN':
      return {
        ...baseData,
        onboardingCompletion: 35,
        documentsCount: 2,
        checklistCount: 3,
        pendingCompletionStatus: {
          allComplete: false,
          accessLocked: false
        }
      };

    case 'PREHIRE_REVIEW':
      return {
        ...baseData,
        onboardingCompletion: 100,
        documentsCount: 0,
        checklistCount: 0,
        pendingCompletionStatus: {
          allComplete: true,
          accessLocked: true
        }
      };

    case 'ONBOARDING':
      return {
        ...baseData,
        onboardingCompletion: 65,
        trainingCount: 2,
        documentsCount: 3,
        checklistCount: 5
      };

    case 'ACTIVE_EMPLOYEE':
      return {
        ...baseData,
        onboardingCompletion: 100,
        trainingCount: 5,
        documentsCount: 4,
        checklistCount: 8
      };

    default:
      return baseData;
  }
}

/**
 * Creates mock admin dashboard statistics
 * @returns {Object} Mock admin stats
 */
export function createMockAdminStats() {
  return {
    totalUsers: 25,
    agencyModules: 12,
    trainingFocusTemplates: 5,
    myAgencies: 1
  };
}

/**
 * Disables all interactive elements in a container
 * @param {HTMLElement} element - Container element
 */
export function disableInteractions(element) {
  if (!element) return;

  // Disable all buttons
  const buttons = element.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.6';
  });

  // Disable all links
  const links = element.querySelectorAll('a, router-link');
  links.forEach(link => {
    link.style.pointerEvents = 'none';
    link.style.cursor = 'default';
    link.style.opacity = '0.6';
  });

  // Disable all form inputs
  const inputs = element.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    input.disabled = true;
    input.style.pointerEvents = 'none';
  });

  // Prevent click events
  element.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);
}

/**
 * Applies preview mode styling to an element
 * @param {HTMLElement} element - Element to style
 */
export function applyPreviewStyling(element) {
  if (!element) return;
  
  element.style.pointerEvents = 'none';
  element.style.userSelect = 'none';
  element.classList.add('preview-mode');
}
