export function supervisionCalendarStaffSql(user = 'viewer', membership = 'member') {
  return `${membership}.is_active=1 AND COALESCE(${user}.is_active,1)=1
    AND COALESCE(${user}.is_archived,0)=0 AND COALESCE(${user}.is_demo,0)=0
    AND COALESCE(${user}.is_assistant_account,0)=0
    AND UPPER(COALESCE(${user}.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE')
    AND LOWER(COALESCE(${user}.role,'')) NOT IN ('','client','client_guardian','guardian','parent','kiosk','assistant','school_staff','school_support','school_admin','school','prehire','candidate')
    AND LOWER(COALESCE(${user}.email,'')) NOT LIKE '%@members.invalid'`;
}
