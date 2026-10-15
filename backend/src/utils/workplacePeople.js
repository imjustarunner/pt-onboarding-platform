// FCC dependent profiles have reserved, non-deliverable identifiers and no
// workplace identity. Household membership alone does not hide a real employee.
export function isPrivateFamilyProfile(user) {
  return String(user?.email || '').trim().toLowerCase().endsWith('@members.invalid');
}
export function workplacePersonSql(alias = 'u') {
  return `LOWER(TRIM(COALESCE(${alias}.email,''))) NOT LIKE '%@members.invalid'`;
}
