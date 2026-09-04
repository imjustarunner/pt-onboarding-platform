/**
 * Shared Office Client Management quick-nav (Workforce Ops switcher style).
 */
export function buildOfficeQuickNavLinks({ orgPath, current = '' } = {}) {
  const p = typeof orgPath === 'function' ? orgPath : (path) => path;
  const cur = String(current || '').toLowerCase();
  const items = [
    { key: 'hub', label: 'Office Hub', to: p('/admin/office-hub') },
    { key: 'clients', label: 'Office Clients', to: p('/admin/office-clients') },
    { key: 'intake', label: 'Intake Queue', to: p('/admin/office-intake-queue') },
    { key: 'management', label: 'Client Management', to: p('/admin/clients') },
    { key: 'exchange', label: 'Client Exchange', to: p('/admin/client-exchange') }
  ];
  return items.map((item) => ({
    ...item,
    isActive: cur === item.key
  }));
}

/** Shared CSS class names used by office headers (pair with officeQuickNav.css). */
export const OFFICE_QUICK_NAV_CLASS = 'ocm-hub-switcher';
