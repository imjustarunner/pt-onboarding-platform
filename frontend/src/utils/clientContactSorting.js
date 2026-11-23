export const clientContactSortOptions = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'agency', label: 'Organization' },
  { value: 'school', label: 'School' }
];

export function sortClientContacts(people, order) {
  const compare = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
  return [...people].sort((a, b) => {
    const byName = compare(a.displayName, b.displayName);
    if (order === 'agency') return compare(a.agencyName, b.agencyName) || byName;
    if (order === 'school') return compare(a.schoolName, b.schoolName) || byName;
    return order === 'name_desc' ? -byName : byName;
  });
}
