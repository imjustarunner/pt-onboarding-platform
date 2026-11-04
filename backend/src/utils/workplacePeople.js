// FCC dependent profiles have reserved, non-deliverable identifiers and no
// workplace identity. Household membership alone does not hide a real employee.
export function isPrivateFamilyProfile(user) {
  return String(user?.email || '').trim().toLowerCase().endsWith('@members.invalid');
}
export function workplacePersonSql(alias = 'u') {
  return `LOWER(TRIM(COALESCE(${alias}.email,''))) NOT LIKE '%@members.invalid'`;
}

// Identity lookups remain available to authentication and Assistant Accounts.
export function humanRosterSql(alias = 'u') {
  return `${workplacePersonSql(alias)} AND COALESCE(${alias}.role,'') <> 'assistant'
    AND COALESCE(${alias}.is_assistant_account,0)=0`;
}
