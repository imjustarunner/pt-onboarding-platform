export function isWorkplaceSchedulePerson(user) {
  const role=String(user?.role || '').trim().toLowerCase();
  const enabled = value => ![false,0,'0'].includes(value);
  return ['super_admin','admin','assistant_admin','support','staff','provider','provider_plus','supervisor','clinical_practice_assistant','intern','intern_plus','facilitator','tutor','clinician'].includes(role)
    && enabled(user.is_active) && enabled(user.membership_active)
    && ![true,1,'1'].includes(user.is_archived) && ![true,1,'1'].includes(user.is_demo)
    && ![true,1,'1'].includes(user.created_via_dev_fill)
    && ['ACTIVE','ACTIVE_EMPLOYEE','COMPLETED'].includes(String(user.status || '').toUpperCase())
    && !String(user?.email || '').toLowerCase().endsWith('@members.invalid');
}
