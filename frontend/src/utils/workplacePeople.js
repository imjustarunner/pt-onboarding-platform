export function isWorkplaceSchedulePerson(user) {
  const role=String(user?.role || '').trim().toLowerCase();
  return !!role && !['client_guardian','guardian','school_staff','school_support','client','parent','kiosk'].includes(role)
    && !String(user?.email || '').toLowerCase().endsWith('@members.invalid');
}
