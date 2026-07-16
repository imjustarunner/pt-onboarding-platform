/**
 * Practitioner vertical helpers (life coach / consultant tenants).
 * Keep detection centralized so App.vue, router, and dashboards stay in sync.
 */

export const PRACTITIONER_ORG_TYPES = Object.freeze(['life_coach', 'consultant']);

export function normalizeOrgType(type) {
  return String(type || '').trim().toLowerCase();
}

export function isPractitionerOrgType(type) {
  return PRACTITIONER_ORG_TYPES.includes(normalizeOrgType(type));
}

export function isLifeCoachOrgType(type) {
  return normalizeOrgType(type) === 'life_coach';
}

export function isConsultantOrgType(type) {
  return normalizeOrgType(type) === 'consultant';
}

/** Theme token set used by PractitionerShell and dashboard surfaces. */
export function getPractitionerTheme(type) {
  if (isConsultantOrgType(type)) {
    return {
      id: 'consultant',
      label: 'Elevate Consulting',
      cssClass: 'theme-consultant',
      accent: '#7c3aed',
      accent2: '#4f46e5',
      sidebar: '#0f172a',
      sidebarText: '#e2e8f0',
      surface: '#f1f5f9',
      success: '#059669'
    };
  }
  return {
    id: 'life_coach',
    label: 'Life Coaching Journey',
    cssClass: 'theme-life-coach',
    accent: '#c4a574',
    accent2: '#d4af37',
    sidebar: '#1a3a2a',
    sidebarText: '#e8f0ea',
    surface: '#f4f6f4',
    success: '#2d6a4f'
  };
}

export function practitionerNavForRole({ orgType, isClient, isOwner = true, permissions = null }) {
  if (isClient) {
    if (isConsultantOrgType(orgType)) {
      return [
        { id: 'dashboard', label: 'Dashboard', to: 'client-dashboard' },
        { id: 'sessions', label: 'Sessions', to: 'client-dashboard', hash: 'sessions' },
        { id: 'packages', label: 'Packages', to: 'client-dashboard', hash: 'packages' },
        { id: 'payments', label: 'Payments', to: 'client-dashboard', hash: 'payments' },
        { id: 'goals', label: 'Goals', to: 'client-dashboard', hash: 'goals' },
        { id: 'assessment-docs', label: 'Assessment docs', to: 'client-dashboard', hash: 'assessment-docs' },
        { id: 'messages', label: 'Messages', to: 'client-dashboard', hash: 'messages' },
        { id: 'settings', label: 'Settings', to: 'client-dashboard', hash: 'settings' }
      ];
    }
    return [
      { id: 'dashboard', label: 'Dashboard', to: 'client-dashboard' },
      { id: 'sessions', label: 'Sessions', to: 'client-dashboard', hash: 'sessions' },
      { id: 'packages', label: 'Packages', to: 'client-dashboard', hash: 'packages' },
      { id: 'payments', label: 'Payments', to: 'client-dashboard', hash: 'payments' },
      { id: 'goals', label: 'Goals', to: 'client-dashboard', hash: 'goals' },
      { id: 'assessment-docs', label: 'Assessment docs', to: 'client-dashboard', hash: 'assessment-docs' },
      { id: 'messages', label: 'Messages', to: 'client-dashboard', hash: 'messages' },
      { id: 'account', label: 'Account', to: 'client-dashboard', hash: 'account' }
    ];
  }

  const caps = permissions && typeof permissions === 'object' ? permissions : {};
  const owner = isOwner !== false;

  const base = isConsultantOrgType(orgType)
    ? [
        { id: 'home', label: 'Home', path: 'dashboard' },
        { id: 'clients', label: 'Clients', path: 'admin/clients', capability: 'clients' },
        {
          id: 'prospectives',
          label: 'Prospectives',
          path: 'admin/clients',
          query: { client_status_key: 'prospective' },
          capability: 'clients'
        },
        {
          id: 'inquiries',
          label: 'Inquiries',
          path: 'admin/availability-intake',
          query: { tab: 'appointments' },
          capability: 'inquiries'
        },
        { id: 'calendar', label: 'Calendar', path: 'admin/provider-availability', capability: 'calendar' },
        { id: 'booking', label: 'Public Booking', path: 'admin/public-services', ownerOnly: true },
        { id: 'packages', label: 'Packages', path: 'admin/session-packages', ownerOnly: true },
        { id: 'settings', label: 'Settings', path: 'admin/settings', ownerOnly: true }
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', path: 'dashboard' },
        { id: 'clients', label: 'Clients', path: 'admin/clients', capability: 'clients' },
        {
          id: 'prospectives',
          label: 'Prospectives',
          path: 'admin/clients',
          query: { client_status_key: 'prospective' },
          capability: 'clients'
        },
        {
          id: 'inquiries',
          label: 'Inquiries',
          path: 'admin/availability-intake',
          query: { tab: 'appointments' },
          capability: 'inquiries'
        },
        { id: 'calendar', label: 'Calendar', path: 'admin/provider-availability', capability: 'calendar' },
        { id: 'booking', label: 'Public Booking', path: 'admin/public-services', ownerOnly: true },
        { id: 'packages', label: 'Packages', path: 'admin/session-packages', ownerOnly: true },
        { id: 'settings', label: 'Settings', path: 'admin/settings', ownerOnly: true }
      ];

  if (owner) return base;

  return base.filter((item) => {
    if (item.ownerOnly) return false;
    if (!item.capability) return true;
    return caps[item.capability] === true;
  });
}
